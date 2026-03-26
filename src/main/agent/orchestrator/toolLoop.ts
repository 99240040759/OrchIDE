/**
 * Tool Loop — Production-Grade ReAct Orchestrator
 *
 * Implements a ReAct-style (Reason + Act) tool execution loop with:
 * - In-loop context compaction (prevents context window overflow)
 * - Fuzzy duplicate detection (catches near-identical tool call loops)
 * - Stall breaker (detects read→edit→fail cycles and injects corrective hints)
 * - Tool result truncation (prevents single tool output from bloating context)
 *
 * Key invariants (OpenAI message ordering rules):
 *  1. Assistant message is started BEFORE streaming begins.
 *  2. Tool-call deltas are captured into history AS THEY STREAM.
 *  3. After stream ends, tool calls are finalized (status: generating → generated).
 *  4. If no tool calls: break — conversation complete.
 *  5. If tool calls exist: execute them, add tool-result messages, loop again.
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
import type { ContextManager } from './context';
import { evaluateToolPolicy } from '../tools/policies';

// ============================================================================
// Constants
// ============================================================================

/** Max characters for a single tool result before truncation */
const MAX_TOOL_RESULT_CHARS = 4000;

/** Run compaction every N iterations */
const COMPACTION_INTERVAL = 5;

/** Number of consecutive similar tool calls before triggering stall detection */
const FUZZY_DUPLICATE_THRESHOLD = 3;

/** Max times a file can be the target of failed edits before stall breaker fires */
const MAX_FILE_EDIT_FAILURES = 3;

// ============================================================================
// Types
// ============================================================================

export interface ToolLoopConfig {
  session: AgentSession;
  llmClient: LLMClient;
  history: ChatHistory;
  toolRegistry: ToolRegistry;
  config: AgentConfig;
  contextManager: ContextManager;
  onStream: (event: StreamEvent) => void;
  onAgentEvent: (event: unknown) => void;
  onToolApprovalRequired: (toolCalls: ToolCallState[]) => Promise<void>;
}

/** Tracks tool usage patterns for stall detection */
interface ToolUsageRecord {
  toolName: string;
  filePath: string | null;
  succeeded: boolean;
  iteration: number;
}

// ============================================================================
// Tool Loop
// ============================================================================

export class ToolLoop {
  private session: AgentSession;
  private llm: LLMClient;
  private history: ChatHistory;
  private tools: ToolRegistry;
  private config: AgentConfig;
  private contextManager: ContextManager;
  private onStream: (event: StreamEvent) => void;
  private onAgentEvent: (event: unknown) => void;
  private onToolApprovalRequired: (toolCalls: ToolCallState[]) => Promise<void>;

  constructor(config: ToolLoopConfig) {
    this.session = config.session;
    this.llm = config.llmClient;
    this.history = config.history;
    this.tools = config.toolRegistry;
    this.config = config.config;
    this.contextManager = config.contextManager;
    this.onStream = config.onStream;
    this.onAgentEvent = config.onAgentEvent;
    this.onToolApprovalRequired = config.onToolApprovalRequired;
  }

  /**
   * Run the tool loop until the LLM stops producing tool calls
   * or we hit the iteration cap.
   */
  async run(signal: AbortSignal): Promise<void> {
    let iterations = 0;
    const maxIterations = this.config.maxToolIterations;

    // ---- Stall Detection State ----
    // Exact-match duplicate detection (legacy — kept as first line of defence)
    const recentSignatures: string[] = [];
    const EXACT_DUP_THRESHOLD = 3;

    // Fuzzy pattern tracking: records every tool call with its file target + result
    const toolUsageLog: ToolUsageRecord[] = [];

    while (iterations < maxIterations) {
      if (signal.aborted) break;

      iterations++;

      // -----------------------------------------------------------------------
      // 0. In-loop compaction — prevent context overflow mid-session
      // -----------------------------------------------------------------------
      if (iterations > 1 && iterations % COMPACTION_INTERVAL === 0) {
        const compacted = await this.contextManager.checkAndCompact();
        if (compacted) {
          const stats = this.contextManager.getContextStats();
          console.log(
            `[ToolLoop] Context compacted at iteration ${iterations}. ` +
            `${stats.messageCount} msgs, ~${stats.currentTokens} tokens (${stats.usagePercent.toFixed(0)}%)`
          );
        }
      }

      // -----------------------------------------------------------------------
      // 1. Build the message list for this LLM call
      // -----------------------------------------------------------------------
      const messages = this.history.toMessages();
      const toolDefinitions = this.tools.getDefinitions();

      console.log(
        `[ToolLoop] === Iteration ${iterations}/${maxIterations} === ` +
        `(${messages.length} msgs, ${toolDefinitions.length} tools)`
      );

      // -----------------------------------------------------------------------
      // 2. Start a fresh assistant message BEFORE streaming so deltas land in it
      // -----------------------------------------------------------------------
      this.history.startAssistantMessage();

      try {
        // -----------------------------------------------------------------------
        // 3. Stream LLM response
        // -----------------------------------------------------------------------
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

            case 'reasoning_delta':
              if (event.data.text) {
                this.history.appendToLastAssistant(event.data.text, true);
              }
              break;

            case 'tool_call_start':
            case 'tool_call_delta':
              if (event.data.toolCallDelta) {
                this.history.handleToolCallDelta(event.data.toolCallDelta);
              }
              break;

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
        // 4. Finalize: change status generating → generated, parse JSON args
        // -----------------------------------------------------------------------
        this.history.finalizeToolCalls();

        // -----------------------------------------------------------------------
        // 5. Did the LLM request any tools?
        // -----------------------------------------------------------------------
        const lastItem = this.history.getLast();
        const pendingToolCalls =
          lastItem?.toolCallStates?.filter((tc) => tc.status === 'generated') ?? [];

        if (pendingToolCalls.length === 0) {
          console.log('[ToolLoop] No tool calls — conversation complete');
          break;
        }

        console.log(`[ToolLoop] ${pendingToolCalls.length} tool call(s) to execute`);

        // -----------------------------------------------------------------------
        // 6. Exact-match duplicate guard (first line of defence)
        // -----------------------------------------------------------------------
        const iterationSignature = pendingToolCalls
          .map((tc) => `${tc.toolCall.function.name}:${tc.toolCall.function.arguments}`)
          .sort()
          .join('|');

        recentSignatures.push(iterationSignature);
        if (recentSignatures.length > EXACT_DUP_THRESHOLD) {
          recentSignatures.shift();
        }

        const allExactSame =
          recentSignatures.length === EXACT_DUP_THRESHOLD &&
          recentSignatures.every((s) => s === iterationSignature);

        if (allExactSame) {
          console.warn(
            `[ToolLoop] EXACT duplicate detected ${EXACT_DUP_THRESHOLD}x: ${iterationSignature.slice(0, 80)}`
          );
          this.injectStallHint(
            pendingToolCalls,
            'You are repeating the exact same tool call with identical arguments. ' +
            'This approach is not working. Try a completely different strategy.'
          );
          break;
        }

        // -----------------------------------------------------------------------
        // 7. Policy check: split into auto-approved vs needs-human-approval
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
            tc.status = 'errored';
            tc.error = 'Tool is disabled by policy';
          }
        }

        // -----------------------------------------------------------------------
        // 8. Ask for human approval if required
        // -----------------------------------------------------------------------
        if (toolsNeedingApproval.length > 0) {
          await this.onToolApprovalRequired(toolsNeedingApproval);
        }

        // -----------------------------------------------------------------------
        // 9. Execute all approved tool calls (with result truncation)
        // -----------------------------------------------------------------------
        const toExecute = [
          ...toolsAutoApproved,
          ...toolsNeedingApproval.filter((tc) => tc.status === 'generated'),
        ];

        for (const tc of toExecute) {
          const succeeded = await this.executeToolCall(tc, signal);

          // Record in fuzzy usage log for stall detection
          const filePath = this.extractFilePath(tc);
          toolUsageLog.push({
            toolName: tc.toolCall.function.name,
            filePath,
            succeeded,
            iteration: iterations,
          });
        }

        // -----------------------------------------------------------------------
        // 10. Fuzzy stall detection (the main circuit breaker)
        // -----------------------------------------------------------------------
        const stallResult = this.detectStall(toolUsageLog, iterations);
        if (stallResult.stalled) {
          console.warn(`[ToolLoop] STALL DETECTED: ${stallResult.reason}`);

          // Instead of silently breaking, inject a corrective hint into the
          // conversation so the model can self-correct
          this.history.addUserMessage(
            `[System] The orchestrator detected a stall pattern: ${stallResult.reason}\n\n` +
            `${stallResult.hint}\n\n` +
            'Please acknowledge this and take a different approach.'
          );

          // Don't break — give the model ONE more chance with the hint.
          // The exact-match guard or the next stall check will catch it if it persists.
          console.log('[ToolLoop] Injected corrective hint — giving model one more iteration');
        }

        // -----------------------------------------------------------------------
        // 11. Verify all tool calls settled
        // -----------------------------------------------------------------------
        if (!this.history.areAllToolCallsComplete()) {
          console.log('[ToolLoop] Some tool calls not settled — stopping loop');
          break;
        }

      } catch (error) {
        console.error('[ToolLoop] Error:', error instanceof Error ? error.message : error);
        this.history.removeLastIfEmptyAssistant();
        throw error;
      }
    }

    if (iterations >= maxIterations) {
      console.warn(`[ToolLoop] Reached maximum iterations (${maxIterations})`);

      // Add a system message so the model knows it was cut off
      this.history.addUserMessage(
        '[System] The tool loop reached its maximum iteration limit. ' +
        'Please summarize what has been accomplished so far and what remains to be done.'
      );
    }

    console.log(`[ToolLoop] Complete after ${iterations} iteration(s)`);
  }

  // ============================================================================
  // Tool Execution (with result truncation)
  // ============================================================================

  /**
   * Execute a single tool call, truncate its result, and write into history.
   * Returns true if succeeded, false if failed.
   */
  private async executeToolCall(tc: ToolCallState, signal: AbortSignal): Promise<boolean> {
    const toolName = tc.toolCall.function.name;

    // Mark as in-flight
    this.history.updateToolCallStatus(tc.toolCallId, 'calling');

    // Emit event so renderer can show "running" state
    this.onStream({
      type: 'tool_call_start',
      sessionId: this.session.sessionId,
      data: { toolCall: tc.toolCall },
    });

    try {
      const result = await this.tools.execute(
        tc.toolCall,
        this.session.getToolContext()
      );

      // Flatten context items to a single string
      let outputContent = result.output.map((item) => item.content).join('\n\n');

      // ---- TRUNCATION: prevent single tool result from bloating context ----
      if (outputContent.length > MAX_TOOL_RESULT_CHARS) {
        const truncated = outputContent.slice(0, MAX_TOOL_RESULT_CHARS);
        outputContent = truncated + `\n\n[Output truncated — showing first ${MAX_TOOL_RESULT_CHARS} of ${outputContent.length} chars]`;
      }

      // Add the tool result message
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
        data: { toolCallState: this.history.getToolCallState(tc.toolCallId) },
      });

      const succeeded = result.success !== false;
      console.log(`[ToolLoop] ${toolName} ${succeeded ? '✓' : '✗'}`);
      return succeeded;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ToolLoop] ${toolName} threw: ${errorMsg}`);

      this.history.addToolResult(tc.toolCallId, `Error: ${errorMsg}`, 'errored');
      this.history.updateToolCallStatus(tc.toolCallId, 'errored', undefined, errorMsg);

      this.onStream({
        type: 'tool_result',
        sessionId: this.session.sessionId,
        data: { toolCallState: this.history.getToolCallState(tc.toolCallId) },
      });

      return false;
    }
  }

  // ============================================================================
  // Stall Detection
  // ============================================================================

  /**
   * Fuzzy stall detection — catches patterns like:
   * - Same file read 3+ times in recent iterations
   * - Same file edited and failed 3+ times
   * - readFile→replaceFileContent→fail cycle on same target
   */
  private detectStall(
    log: ToolUsageRecord[],
    currentIteration: number
  ): { stalled: boolean; reason: string; hint: string } {
    // Only look at the last 8 iterations
    const window = 8;
    const recent = log.filter((r) => r.iteration > currentIteration - window);

    if (recent.length < 4) {
      return { stalled: false, reason: '', hint: '' };
    }

    // ---- Pattern 1: Same file edited and failed N+ times ----
    const editTools = new Set(['replaceFileContent', 'multiReplaceFileContent', 'writeFile']);
    const editFailures = new Map<string, number>();

    for (const record of recent) {
      if (editTools.has(record.toolName) && !record.succeeded && record.filePath) {
        const key = record.filePath;
        editFailures.set(key, (editFailures.get(key) || 0) + 1);
      }
    }

    for (const [filePath, count] of editFailures) {
      if (count >= MAX_FILE_EDIT_FAILURES) {
        return {
          stalled: true,
          reason: `replaceFileContent failed ${count} times on ${filePath}`,
          hint:
            `The replaceFileContent tool has failed ${count} times on "${filePath}". ` +
            'The targetContent string is probably not matching the actual file contents. ' +
            'You should: (1) Use readFile to see the EXACT current content of the file, ' +
            'then (2) Copy the exact text you want to replace, character-for-character, ' +
            'OR (3) Use writeFile to completely rewrite the file if the edits are extensive.',
        };
      }
    }

    // ---- Pattern 2: Same file read 4+ times without successful edit ----
    const readCounts = new Map<string, number>();
    const editSuccesses = new Set<string>();

    for (const record of recent) {
      if (record.toolName === 'readFile' && record.filePath) {
        readCounts.set(record.filePath, (readCounts.get(record.filePath) || 0) + 1);
      }
      if (editTools.has(record.toolName) && record.succeeded && record.filePath) {
        editSuccesses.add(record.filePath);
      }
    }

    for (const [filePath, count] of readCounts) {
      if (count >= 4 && !editSuccesses.has(filePath)) {
        return {
          stalled: true,
          reason: `readFile called ${count} times on ${filePath} without successful edit`,
          hint:
            `You have read "${filePath}" ${count} times without making a successful edit. ` +
            'Stop re-reading the file and either: (1) Use writeFile to rewrite the entire file, ' +
            'or (2) Move on to a different approach entirely. ' +
            'Reading the same file repeatedly will not change its contents.',
        };
      }
    }

    // ---- Pattern 3: Same searchInFiles pattern repeated 3+ times ----
    const searchPatterns = new Map<string, number>();
    for (const record of recent) {
      if (record.toolName === 'searchInFiles' || record.toolName === 'grepSearch') {
        // Use filePath as a proxy for the search pattern (it's stored there by extractFilePath)
        const key = record.filePath || 'unknown';
        searchPatterns.set(key, (searchPatterns.get(key) || 0) + 1);
      }
    }

    for (const [pattern, count] of searchPatterns) {
      if (count >= FUZZY_DUPLICATE_THRESHOLD) {
        return {
          stalled: true,
          reason: `searchInFiles called ${count} times with similar parameters`,
          hint:
            'You are searching for the same thing repeatedly. ' +
            'The search results are not changing between calls. ' +
            'Use the results you already have, or try a different search query.',
        };
      }
    }

    return { stalled: false, reason: '', hint: '' };
  }

  /**
   * Extract the primary file path from a tool call's arguments.
   * Used for fuzzy stall detection (grouping by target file).
   */
  private extractFilePath(tc: ToolCallState): string | null {
    try {
      const argsStr = tc.toolCall.function.arguments;
      const args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;

      // File operations
      if (args.filePath) return String(args.filePath);
      if (args.targetPath) return String(args.targetPath);
      if (args.TargetFile) return String(args.TargetFile);

      // Directory operations
      if (args.dirPath) return String(args.dirPath);
      if (args.DirectoryPath) return String(args.DirectoryPath);

      // Search operations — use pattern as pseudo-path for dedup
      if (args.pattern) return `search:${args.pattern}`;
      if (args.Query) return `search:${args.Query}`;

      // Terminal operations
      if (args.command) return `cmd:${String(args.command).slice(0, 60)}`;
      if (args.CommandLine) return `cmd:${String(args.CommandLine).slice(0, 60)}`;

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Inject an error result into history for each pending tool call,
   * telling the model to change strategy.
   */
  private injectStallHint(pendingToolCalls: ToolCallState[], message: string): void {
    for (const tc of pendingToolCalls) {
      this.history.addToolResult(
        tc.toolCallId,
        `Error: ${message}`,
        'errored'
      );
    }
  }
}
