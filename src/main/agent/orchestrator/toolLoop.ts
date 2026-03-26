/**
 * Tool Loop
 *
 * Implements the ReAct-style (Reason + Act) tool execution loop.
 * Streams LLM responses, collects tool calls, executes them, then
 * feeds results back until the LLM stops requesting tools.
 *
 * Key invariants (matching OpenAI message ordering rules):
 *  1. Assistant message is started BEFORE streaming begins.
 *  2. Tool-call deltas are captured into history AS THEY STREAM.
 *  3. After stream ends, tool calls are finalized (status: generating → generated).
 *  4. If no tool calls: break — conversation complete.
 *  5. If tool calls exist: execute them, add tool-result messages, loop again.
 *  6. The next LLM call sees: […previous messages, assistant(with tool_calls), tool(result), …]
 */

import type {
  AgentConfig,
  ChatMessage,
  ToolCall,
  ToolCallState,
  StreamEvent,
} from '../core/types';
import type { LLMClient } from '../core/llm';
import type { ChatHistory } from '../core/history';
import type { ToolRegistry } from '../tools/registry';
import type { AgentSession } from './session';
import { evaluateToolPolicy } from '../tools/policies';

export interface ToolLoopConfig {
  session: AgentSession;
  llmClient: LLMClient;
  history: ChatHistory;
  toolRegistry: ToolRegistry;
  config: AgentConfig;
  onStream: (event: StreamEvent) => void;
  onAgentEvent: (event: unknown) => void;
  onToolApprovalRequired: (toolCalls: ToolCallState[]) => Promise<void>;
}

export class ToolLoop {
  private session: AgentSession;
  private llm: LLMClient;
  private history: ChatHistory;
  private tools: ToolRegistry;
  private config: AgentConfig;
  private onStream: (event: StreamEvent) => void;
  private onAgentEvent: (event: unknown) => void;
  private onToolApprovalRequired: (toolCalls: ToolCallState[]) => Promise<void>;

  constructor(config: ToolLoopConfig) {
    this.session = config.session;
    this.llm = config.llmClient;
    this.history = config.history;
    this.tools = config.toolRegistry;
    this.config = config.config;
    this.onStream = config.onStream;
    this.onAgentEvent = config.onAgentEvent;
    this.onToolApprovalRequired = config.onToolApprovalRequired;
  }

  /**
   * Run the tool loop until the LLM stops producing tool calls
   * or we hit the iteration cap.
   */
  async run(signal: AbortSignal): Promise<void> {
    console.log('[ToolLoop] run() started');
    let iterations = 0;
    const maxIterations = this.config.maxToolIterations;

    // Duplicate-call detection: track last N tool signatures to detect infinite loops.
    // A "signature" is toolName + JSON-sorted-args. If the same signature appears
    // MAX_DUPLICATE_THRESHOLD times in a row, the LLM is stuck → bail out.
    const MAX_DUPLICATE_THRESHOLD = 3;
    const recentSignatures: string[] = [];

    while (iterations < maxIterations) {
      if (signal.aborted) {
        console.log('[ToolLoop] Aborted by signal');
        break;
      }

      iterations++;
      console.log(`[ToolLoop] === Iteration ${iterations}/${maxIterations} ===`);

      // -----------------------------------------------------------------------
      // 1. Build the message list for this LLM call
      // -----------------------------------------------------------------------
      const messages = this.history.toMessages();
      const toolDefinitions = this.tools.getDefinitions();

      console.log(`[ToolLoop] Messages count: ${messages.length}`);
      console.log(
        '[ToolLoop] Message roles:',
        messages.map((m) => m.role)
      );
      console.log(`[ToolLoop] Tool definitions count: ${toolDefinitions.length}`);

      // -----------------------------------------------------------------------
      // 2. Start a fresh assistant message BEFORE streaming so deltas land in it
      // -----------------------------------------------------------------------
      console.log('[ToolLoop] Starting assistant message in history...');
      this.history.startAssistantMessage();

      try {
        // -----------------------------------------------------------------------
        // 3. Stream LLM response
        //    - text_delta   → append to assistant content
        //    - tool_call_start / tool_call_delta → call handleToolCallDelta
        //      (BOTH carry delta data; start has id+name, delta has argument chunks)
        //    - tool_call_complete → finalization is done via finalizeToolCalls()
        //    - stream_end → loop exits naturally
        // -----------------------------------------------------------------------
        console.log('[ToolLoop] Calling llm.streamChat()...');
        for await (const event of this.llm.streamChat(
          messages,
          { tools: toolDefinitions },
          signal
        )) {
          if (signal.aborted) break;

          // Forward every event to the session (→ IPC → renderer)
          this.onStream(event);

          switch (event.type) {
            case 'text_delta':
              if (event.data.text) {
                this.history.appendToLastAssistant(event.data.text);
              }
              break;

            // CRITICAL FIX: Both start and delta events carry ToolCallDelta.
            // Start carries { id, function.name, function.arguments (partial) }.
            // Delta carries { function.arguments (next chunk) }.
            case 'tool_call_start':
            case 'tool_call_delta':
              if (event.data.toolCallDelta) {
                this.history.handleToolCallDelta(event.data.toolCallDelta);
              }
              break;

            // tool_call_complete is emitted by our LLM client after the finish
            // chunk; it carries the FULLY assembled args from toolCallsInProgress
            // (the LLM client's own accumulator) — use it to overwrite history
            // so any streaming chunk boundary issues can't corrupt the final args.
            case 'tool_call_complete':
              if (event.data.toolCall?.id && event.data.toolCall.function?.arguments !== undefined) {
                this.history.overrideToolCallArguments(
                  event.data.toolCall.id,
                  event.data.toolCall.function.arguments
                );
              }
              break;

            case 'error':
              if (event.data.error) {
                throw new Error(event.data.error);
              }
              break;

            default:
              break;
          }
        }

        // -----------------------------------------------------------------------
        // 4. Finalize: change status of streaming tool calls from
        //    'generating' → 'generated' and parse their JSON arguments.
        // -----------------------------------------------------------------------
        this.history.finalizeToolCalls();

        console.log('[ToolLoop] Stream complete, checking for tool calls...');

        // -----------------------------------------------------------------------
        // 5. Did the LLM request any tools?
        // -----------------------------------------------------------------------
        const lastItem = this.history.getLast();

        // If the last item has no tool call states, or they're all empty,
        // the LLM returned a plain text response → we are done.
        const pendingToolCalls =
          lastItem?.toolCallStates?.filter((tc) => tc.status === 'generated') ?? [];

        if (pendingToolCalls.length === 0) {
          console.log('[ToolLoop] No tool calls — conversation complete');

          // Safety: if the last assistant message has empty content AND no tool
          // calls, it means the LLM sent a pure stop for some reason.  Keep it
          // in history anyway so the conversation record is complete.
          break;
        }

        console.log(`[ToolLoop] Found ${pendingToolCalls.length} tool call(s) to execute`);

        // -----------------------------------------------------------------------
        // Duplicate-call guard: detect when the LLM is stuck in a loop calling
        // the same tool with the same args repeatedly.
        // -----------------------------------------------------------------------
        const iterationSignature = pendingToolCalls
          .map((tc) => `${tc.toolCall.function.name}:${tc.toolCall.function.arguments}`)
          .sort()
          .join('|');

        recentSignatures.push(iterationSignature);
        if (recentSignatures.length > MAX_DUPLICATE_THRESHOLD) {
          recentSignatures.shift();
        }

        const allSame = recentSignatures.length === MAX_DUPLICATE_THRESHOLD &&
          recentSignatures.every(s => s === iterationSignature);

        if (allSame) {
          console.warn(
            `[ToolLoop] Duplicate tool call detected ${MAX_DUPLICATE_THRESHOLD}x in a row: ${iterationSignature.slice(0, 120)}. Breaking loop.`
          );
          // Add a tool error message so the LLM knows it's stuck
          for (const tc of pendingToolCalls) {
            this.history.addToolResult(
              tc.toolCallId,
              'Error: This tool call was repeated with identical arguments. Please try a different approach.',
              'errored'
            );
          }
          break;
        }

        // -----------------------------------------------------------------------
        // 6. Policy check: split into auto-approved vs needs-human-approval
        // -----------------------------------------------------------------------
        const toolsNeedingApproval: ToolCallState[] = [];
        const toolsAutoApproved: ToolCallState[] = [];

        for (const tc of pendingToolCalls) {
          const tool = this.tools.get(tc.toolCall.function.name);
          const policyResult = await evaluateToolPolicy(
            tc.toolCall,
            tool,
            { defaults: {}, overrides: [] },
            this.session.getToolContext()
          );

          if (policyResult.policy === 'allowedWithoutPermission') {
            toolsAutoApproved.push(tc);
          } else if (policyResult.policy === 'allowedWithPermission') {
            toolsNeedingApproval.push(tc);
          } else {
            // disabled
            tc.status = 'errored';
            tc.error = 'Tool is disabled by policy';
          }
        }

        console.log(
          `[ToolLoop] Auto-approved: ${toolsAutoApproved.length}, Need approval: ${toolsNeedingApproval.length}`
        );

        // -----------------------------------------------------------------------
        // 7. Ask for human approval if required
        // -----------------------------------------------------------------------
        if (toolsNeedingApproval.length > 0) {
          console.log('[ToolLoop] Requesting approval for tools...');
          await this.onToolApprovalRequired(toolsNeedingApproval);
          // After this resolves, their status is 'generated' (approved) or
          // 'canceled' (rejected) — set by AgentSession.approveToolCalls().
        }

        // -----------------------------------------------------------------------
        // 8. Execute all approved tool calls
        // -----------------------------------------------------------------------
        const toExecute = [
          ...toolsAutoApproved,
          ...toolsNeedingApproval.filter((tc) => tc.status === 'generated'),
        ];

        for (const tc of toExecute) {
          await this.executeToolCall(tc, signal);
        }

        // -----------------------------------------------------------------------
        // 9. Verify all tool calls that were supposed to run are settled
        // -----------------------------------------------------------------------
        if (!this.history.areAllToolCallsComplete()) {
          console.log('[ToolLoop] Some tool calls not settled — stopping loop');
          break;
        }

        // Loop continues: next iteration sends tool results to LLM.
        console.log('[ToolLoop] All tool calls complete — continuing loop for LLM follow-up');

      } catch (error) {
        console.error('[ToolLoop] Error in iteration:', error);
        // Remove the dangling empty assistant message from history before
        // re-throwing so the conversation state stays consistent.
        this.history.removeLastIfEmptyAssistant();
        throw error;
      }
    }

    if (iterations >= maxIterations) {
      console.warn(`[ToolLoop] Reached maximum iterations (${maxIterations})`);
    }

    console.log('[ToolLoop] Tool loop complete');
  }

  /**
   * Execute a single tool call and write the result into history.
   */
  private async executeToolCall(tc: ToolCallState, signal: AbortSignal): Promise<void> {
    const toolName = tc.toolCall.function.name;
    console.log(`[ToolLoop] Executing tool: ${toolName}`);

    // Mark as in-flight
    this.history.updateToolCallStatus(tc.toolCallId, 'calling');

    // Emit event so renderer can show "running" state
    this.onStream({
      type: 'tool_call_start',
      sessionId: this.session.sessionId,
      data: {
        toolCall: tc.toolCall,
      },
    });

    try {
      const result = await this.tools.execute(
        tc.toolCall,
        this.session.getToolContext()
      );

      console.log(
        `[ToolLoop] Tool ${toolName} ${result.success ? 'succeeded' : 'failed'}`
      );

      // Flatten context items to a single string for the tool message
      const outputContent = result.output.map((item) => item.content).join('\n\n');

      // Add the tool result message — this is what the LLM sees next iteration
      this.history.addToolResult(
        tc.toolCallId,
        outputContent || (result.success ? '(done)' : `Error: ${result.error}`),
        result.success ? 'done' : 'errored'
      );

      if (!result.success && result.error) {
        this.history.updateToolCallStatus(tc.toolCallId, 'errored', undefined, result.error);
      }

      // Emit result event to renderer
      this.onStream({
        type: 'tool_result',
        sessionId: this.session.sessionId,
        data: {
          toolCallState: this.history.getToolCallState(tc.toolCallId),
        },
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ToolLoop] Tool ${toolName} threw:`, errorMsg);

      this.history.addToolResult(tc.toolCallId, `Error: ${errorMsg}`, 'errored');
      this.history.updateToolCallStatus(tc.toolCallId, 'errored', undefined, errorMsg);

      // Emit error result to renderer
      this.onStream({
        type: 'tool_result',
        sessionId: this.session.sessionId,
        data: {
          toolCallState: this.history.getToolCallState(tc.toolCallId),
        },
      });
    }
  }
}
