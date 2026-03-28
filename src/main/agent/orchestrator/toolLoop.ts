/**
 * Tool Loop — Production-Grade ReAct Orchestrator
 *
 * Implements a ReAct-style (Reason + Act) tool execution loop with:
 * - In-loop context compaction (prevents context window overflow)
 * - Levenshtein-based fuzzy duplicate detection (catches near-identical tool call loops)
 * - Advanced stall breaker (detects read→edit→fail cycles and injects corrective hints)
 * - Head+tail tool result truncation (preserves errors while limiting context)
 * - Ephemeral hint injection (guides LLM without polluting user-visible transcript)
 * - Mode enforcement integration (planning/execution/verification boundaries)
 *
 * Key invariants (OpenAI message ordering rules):
 *  1. Assistant message is started BEFORE streaming begins.
 *  2. Tool-call deltas are captured into history AS THEY STREAM.
 *  3. After stream ends, tool calls are finalized (status: generating → generated).
 *  4. If no tool calls: break — conversation complete.
 *  5. If tool calls exist: execute them, add tool-result messages, loop again.
 */

import { distance } from 'fastest-levenshtein';
import type {
  AgentConfig,
  StreamEvent,
  ToolCallState,
} from '../core/types';
import type { LLMClient } from '../core/llm';
import type { ChatHistory } from '../core/history';
import type { ToolRegistry } from '../tools/registry';
import type { AgentSession } from './session';
import type { ContextManager } from './context';
import { evaluateToolPolicy } from '../tools/policies';
import { truncateToolResult, truncateTerminalOutput } from './truncation';
import type { ModeEnforcer } from './modeEnforcement';

// ============================================================================
// Constants
// ============================================================================

/** Max characters for a single tool result before truncation */
const MAX_TOOL_RESULT_CHARS = 6000;

/** Run compaction every N iterations */
const COMPACTION_INTERVAL = 4;

/** Number of consecutive similar tool calls before triggering stall detection */
const FUZZY_DUPLICATE_THRESHOLD = 3;

/** Max times a file can be the target of failed edits before stall breaker fires */
const MAX_FILE_EDIT_FAILURES = 3;

/** Similarity threshold for fuzzy argument matching (0-1) */
const FUZZY_SIMILARITY_THRESHOLD = 0.85;

/** Max stall hints to inject before forcing break */


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
  modeEnforcer?: ModeEnforcer;
  onStream: (event: StreamEvent) => void;
}

/** Tracks tool usage patterns for stall detection */
interface ToolUsageRecord {
  toolName: string;
  filePath: string | null;
  arguments: string;
  succeeded: boolean;
  iteration: number;
  timestamp: number;
}

/** Result of stall detection analysis */
interface StallDetectionResult {
  stalled: boolean;
  reason: string;
  hint: string;
  severity: 'warning' | 'critical';
  pattern: string;
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
  private modeEnforcer?: ModeEnforcer;
  private onStream: (event: StreamEvent) => void;

  constructor(config: ToolLoopConfig) {
    this.session = config.session;
    this.llm = config.llmClient;
    this.history = config.history;
    this.tools = config.toolRegistry;
    this.config = config.config;
    this.contextManager = config.contextManager;
    this.modeEnforcer = config.modeEnforcer;
    this.onStream = config.onStream;
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
        // 7. Mode enforcement check (planning/execution/verification boundaries)
        // -----------------------------------------------------------------------
        if (this.modeEnforcer) {
          for (const tc of pendingToolCalls) {
            const modeResult = this.modeEnforcer.checkToolPermission(
              tc.toolCall.function.name,
              tc.parsedArgs
            );
            if (!modeResult.allowed) {
              tc.status = 'errored';
              tc.error = `Mode violation: ${modeResult.reason}${modeResult.suggestedMode ? ` Try switching to ${modeResult.suggestedMode} mode.` : ''}`;
              console.warn(`[ToolLoop] Mode violation for ${tc.toolCall.function.name}: ${modeResult.reason}`);
            }
          }
        }

        // Filter out mode-blocked tools
        const modeAllowedTools = pendingToolCalls.filter((tc) => tc.status !== 'errored');

        // -----------------------------------------------------------------------
        // 8. Policy check
        // -----------------------------------------------------------------------
        const toolsAutoApproved: ToolCallState[] = [];
        const toolSettings = this.tools.getSettings();

        for (const tc of modeAllowedTools) {
          const tool = this.tools.get(tc.toolCall.function.name);
          const policyResult = await evaluateToolPolicy(
            tc.toolCall,
            tool,
            toolSettings,
            this.session.getToolContext()
          );

          if (policyResult.policy === 'allowedWithoutPermission' || policyResult.policy === 'allowedWithPermission') {
            toolsAutoApproved.push(tc);
          } else {
            tc.status = 'errored';
            tc.error = 'Tool is disabled by policy';
          }
        }

        // -----------------------------------------------------------------------
        // 9. Execute all approved tool calls (with result truncation)
        // -----------------------------------------------------------------------
        const toExecute = [
          ...toolsAutoApproved,
        ];

        for (const tc of toExecute) {
          const succeeded = await this.executeToolCall(tc, signal);

          // Record in fuzzy usage log for stall detection (enhanced with arguments)
          const filePath = this.extractFilePath(tc);
          toolUsageLog.push({
            toolName: tc.toolCall.function.name,
            filePath,
            arguments: tc.toolCall.function.arguments || '',
            succeeded,
            iteration: iterations,
            timestamp: Date.now(),
          });
        }

        // -----------------------------------------------------------------------
        // 11. Fuzzy stall detection (the main circuit breaker)
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
        // 12. Verify all tool calls settled
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
  // Tool Execution (with head+tail truncation)
  // ============================================================================

  /**
   * Execute a single tool call, truncate its result using head+tail strategy,
   * and write into history. Returns true if succeeded, false if failed.
   */
  private async executeToolCall(tc: ToolCallState, _signal: AbortSignal): Promise<boolean> {
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

      // ---- HEAD+TAIL TRUNCATION: preserve errors while limiting context ----
      if (outputContent.length > MAX_TOOL_RESULT_CHARS) {
        // Use terminal truncation for terminal commands (more tail-heavy)
        const isTerminalTool = toolName === 'runTerminalCommand' || 
                               toolName === 'startTerminalCommand' ||
                               toolName === 'getCommandStatus';
        
        outputContent = isTerminalTool
          ? truncateTerminalOutput(outputContent)
          : truncateToolResult(outputContent);
      }

      // Add the tool result message
      this.history.addToolResult(
        tc.toolCallId,
        outputContent || (result.success ? '(done)' : `Error: ${result.error}`),
        result.success ? 'done' : 'errored'
      );

      if (!result.success && result.error) {
        this.history.updateToolCallStatus(tc.toolCallId, 'errored', result.output, result.error);
      } else {
        // Store the full context items including lineRange and diffStats
        this.history.updateToolCallStatus(tc.toolCallId, 'done', result.output);
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
  // Stall Detection — Levenshtein-Based Fuzzy Analysis
  // ============================================================================

  /**
   * Advanced stall detection with Levenshtein-based fuzzy matching.
   * Catches patterns like:
   * - Same file read 3+ times in recent iterations
   * - Same file edited and failed 3+ times
   * - readFile→replaceFileContent→fail cycle on same target
   * - Near-identical tool arguments (fuzzy match)
   * - Terminal command repetition
   */
  private detectStall(
    log: ToolUsageRecord[],
    currentIteration: number
  ): StallDetectionResult {
    // Only look at the last 8 iterations
    const window = 8;
    const recent = log.filter((r) => r.iteration > currentIteration - window);

    if (recent.length < 4) {
      return { stalled: false, reason: '', hint: '', severity: 'warning', pattern: '' };
    }

    // ---- Pattern 1: Same file edited and failed N+ times ----
    const editTools = new Set(['replaceFileContent', 'multiReplaceFileContent', 'writeFile']);
    const editFailures = new Map<string, { count: number; args: string[] }>();

    for (const record of recent) {
      if (editTools.has(record.toolName) && !record.succeeded && record.filePath) {
        const key = record.filePath;
        const existing = editFailures.get(key) || { count: 0, args: [] };
        existing.count++;
        existing.args.push(record.arguments);
        editFailures.set(key, existing);
      }
    }

    for (const [filePath, data] of editFailures) {
      if (data.count >= MAX_FILE_EDIT_FAILURES) {
        // Check if arguments are similar (indicates same mistake repeated)
        const argsSimilar = this.areArgumentsSimilar(data.args);

        return {
          stalled: true,
          reason: `Edit failed ${data.count} times on ${filePath}${argsSimilar ? ' with similar content' : ''}`,
          hint: this.generateEditFailureHint(filePath, data.count, argsSimilar),
          severity: data.count >= 4 ? 'critical' : 'warning',
          pattern: 'repeated_edit_failure',
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
            'STOP re-reading and try one of these:\n' +
            '1. Use writeFile to completely rewrite the file\n' +
            '2. Accept the current state and move on\n' +
            '3. Ask the user for clarification on what change is needed',
          severity: count >= 5 ? 'critical' : 'warning',
          pattern: 'read_without_edit',
        };
      }
    }

    // ---- Pattern 3: Search pattern repetition ----
    const searchPatterns = new Map<string, number>();
    for (const record of recent) {
      if (record.toolName === 'searchInFiles' || record.toolName === 'grepSearch') {
        const key = record.filePath || 'unknown';
        searchPatterns.set(key, (searchPatterns.get(key) || 0) + 1);
      }
    }

    for (const [_searchPattern, count] of searchPatterns) {
      if (count >= FUZZY_DUPLICATE_THRESHOLD) {
        return {
          stalled: true,
          reason: `Search repeated ${count} times with similar pattern`,
          hint:
            'You are searching for the same thing repeatedly. ' +
            'The search results are not changing between calls. ' +
            'Either:\n' +
            '1. Use the results you already have\n' +
            '2. Try a completely different search query\n' +
            '3. The content you\'re looking for may not exist in this codebase',
          severity: 'warning',
          pattern: 'repeated_search',
        };
      }
    }

    // ---- Pattern 4: Fuzzy argument similarity across all recent calls ----
    const fuzzyDuplicates = this.detectFuzzyDuplicates(recent);
    if (fuzzyDuplicates) {
      return fuzzyDuplicates;
    }

    // ---- Pattern 5: Terminal command repetition ----
    const terminalCommands = recent.filter(
      (r) => r.toolName === 'runTerminalCommand' || r.toolName === 'startTerminalCommand'
    );
    const cmdCounts = new Map<string, number>();

    for (const record of terminalCommands) {
      const cmd = record.filePath || ''; // filePath stores cmd:... for terminal
      cmdCounts.set(cmd, (cmdCounts.get(cmd) || 0) + 1);
    }

    for (const [cmd, count] of cmdCounts) {
      if (count >= 3) {
        return {
          stalled: true,
          reason: `Terminal command repeated ${count} times`,
          hint:
            `The command "${cmd.replace('cmd:', '').slice(0, 50)}..." has been run ${count} times. ` +
            'If it\'s failing, try:\n' +
            '1. Check the error message carefully\n' +
            '2. Fix the underlying issue before re-running\n' +
            '3. Try a different command or approach',
          severity: 'warning',
          pattern: 'repeated_command',
        };
      }
    }

    return { stalled: false, reason: '', hint: '', severity: 'warning', pattern: '' };
  }

  /**
   * Detect fuzzy duplicates using Levenshtein distance on arguments.
   */
  private detectFuzzyDuplicates(recent: ToolUsageRecord[]): StallDetectionResult | null {
    // Group by tool name
    const byTool = new Map<string, ToolUsageRecord[]>();
    for (const record of recent) {
      const existing = byTool.get(record.toolName) || [];
      existing.push(record);
      byTool.set(record.toolName, existing);
    }

    // Check each tool for fuzzy duplicates
    for (const [toolName, records] of byTool) {
      if (records.length < FUZZY_DUPLICATE_THRESHOLD) continue;

      // Compare recent arguments for similarity
      const recentArgs = records.slice(-FUZZY_DUPLICATE_THRESHOLD).map((r) => r.arguments);
      let similarCount = 0;

      for (let i = 1; i < recentArgs.length; i++) {
        const similarity = this.calculateStringSimilarity(recentArgs[0], recentArgs[i]);
        if (similarity >= FUZZY_SIMILARITY_THRESHOLD) {
          similarCount++;
        }
      }

      if (similarCount >= FUZZY_DUPLICATE_THRESHOLD - 1) {
        return {
          stalled: true,
          reason: `${toolName} called ${records.length} times with ~${Math.round(FUZZY_SIMILARITY_THRESHOLD * 100)}% similar arguments`,
          hint:
            `You are calling ${toolName} repeatedly with nearly identical arguments. ` +
            'This is unlikely to produce different results. Try a fundamentally different approach.',
          severity: 'warning',
          pattern: 'fuzzy_duplicate',
        };
      }
    }

    return null;
  }

  /**
   * Calculate string similarity using Levenshtein distance.
   * Returns 0-1 where 1 = identical.
   * Uses fastest-levenshtein instead of a custom DP implementation.
   */
  private calculateStringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Limit comparison length for performance
    const maxLen = 500;
    const aSlice = a.slice(0, maxLen);
    const bSlice = b.slice(0, maxLen);

    const dist = distance(aSlice, bSlice);
    const maxPossible = Math.max(aSlice.length, bSlice.length);

    return 1 - dist / maxPossible;
  }

  /**
   * Check if a set of argument strings are similar to each other.
   */
  private areArgumentsSimilar(args: string[]): boolean {
    if (args.length < 2) return false;

    for (let i = 1; i < args.length; i++) {
      const similarity = this.calculateStringSimilarity(args[0], args[i]);
      if (similarity < FUZZY_SIMILARITY_THRESHOLD) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate a helpful hint for repeated edit failures.
   */
  private generateEditFailureHint(filePath: string, count: number, similar: boolean): string {
    const hints = [
      `The replaceFileContent tool has failed ${count} times on "${filePath}".`,
      '',
    ];

    if (similar) {
      hints.push('You appear to be making the same mistake repeatedly.');
      hints.push('');
    }

    hints.push('**DIAGNOSIS:** The targetContent is probably not matching the actual file.');
    hints.push('');
    hints.push('**SOLUTIONS (in order of preference):**');
    hints.push('1. Use readFile to see the EXACT current content');
    hints.push('2. Copy the exact text you want to replace, character-for-character');
    hints.push('3. Check for whitespace differences (spaces vs tabs, trailing whitespace)');
    hints.push('4. If the file has changed, re-read it before editing');
    hints.push('5. Use writeFile to completely rewrite the file if edits are extensive');

    if (count >= 4) {
      hints.push('');
      hints.push('⚠️ CRITICAL: You have failed many times. Consider asking the user for help.');
    }

    return hints.join('\n');
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
   * Inject an ephemeral error result into history for each pending tool call.
   * These hints guide the model without polluting the user-visible transcript.
   */
  private injectStallHint(pendingToolCalls: ToolCallState[], message: string): void {
    for (const tc of pendingToolCalls) {
      this.history.addToolResult(
        tc.toolCallId,
        `[ORCHESTRATOR INTERVENTION]\n\n${message}`,
        'errored'
      );
    }
  }
}
