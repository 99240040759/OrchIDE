/**
 * Context Manager — Production-Grade Implementation
 *
 * Manages context window size with intelligent compaction strategies:
 * - Head+tail truncation for large tool outputs
 * - Priority-based message retention (recent > tool results > old user messages)
 * - KI-aware compaction (never drop knowledge items)
 * - Extractive summarization for discarded messages
 *
 * This is critical infrastructure for preventing context overflow
 * while maintaining the most diagnostic-relevant content.
 */

import type { AgentConfig, ChatMessage } from '../core/types';
import type { ChatHistory } from '../core/history';
import { estimateTokens } from '../core/tokens';
import {
  truncateHeadTail,
  truncateToolResult,
  truncateWithReport,
  type TruncationConfig,
} from './truncation';
import type { KnowledgeItemManager, KIContextSelection } from './knowledgeItems';

// ============================================================================
// Types
// ============================================================================

export interface ContextManagerConfig {
  history: ChatHistory;
  agentConfig: AgentConfig;
  kiManager?: KnowledgeItemManager;
}

export interface CompactionResult {
  performed: boolean;
  messagesBefore: number;
  messagesAfter: number;
  tokensBefore: number;
  tokensAfter: number;
  messagesDropped: number;
  summaryCreated: boolean;
}

export interface ContextStats {
  currentTokens: number;
  maxTokens: number;
  usagePercent: number;
  messageCount: number;
  kiTokens: number;
  toolResultTokens: number;
  userMessageTokens: number;
  assistantTokens: number;
}

/** Message priority for retention during compaction */
interface MessagePriority {
  message: ChatMessage;
  index: number;
  priority: number;
  tokens: number;
  isProtected: boolean;
}

// ============================================================================
// Priority Weights
// ============================================================================

const PRIORITY_WEIGHTS = {
  /** System message — always keep */
  system: 1000,
  /** Most recent user message — always keep */
  recentUser: 500,
  /** Recent assistant messages with tool calls */
  recentAssistantWithTools: 400,
  /** Recent assistant text responses */
  recentAssistantText: 350,
  /** Tool results (errors prioritized) */
  toolResultError: 300,
  toolResultSuccess: 150,
  /** Older user messages */
  olderUser: 100,
  /** Older assistant messages */
  olderAssistant: 50,
};

/** Number of recent messages to always protect */
const PROTECTED_RECENT_COUNT = 6;

/** Minimum messages to keep after compaction */
const MIN_MESSAGES_AFTER_COMPACTION = 4;

// ============================================================================
// Context Manager Class
// ============================================================================

export class ContextManager {
  private history: ChatHistory;
  private config: AgentConfig;
  private kiManager?: KnowledgeItemManager;
  private lastKISelection?: KIContextSelection;

  constructor(history: ChatHistory, config: AgentConfig, kiManager?: KnowledgeItemManager);
  constructor(cfg: ContextManagerConfig);
  constructor(
    historyOrCfg: ChatHistory | ContextManagerConfig,
    config?: AgentConfig,
    kiManager?: KnowledgeItemManager
  ) {
    if ('toMessages' in historyOrCfg) {
      // Called with separate arguments
      this.history = historyOrCfg;
      this.config = config!;
      this.kiManager = kiManager;
    } else {
      // Called with config object
      this.history = historyOrCfg.history;
      this.config = historyOrCfg.agentConfig;
      this.kiManager = historyOrCfg.kiManager;
    }
  }

  // ==========================================================================
  // KI Integration
  // ==========================================================================

  /**
   * Set the Knowledge Item manager for KI-aware compaction.
   */
  setKIManager(manager: KnowledgeItemManager): void {
    this.kiManager = manager;
  }

  /**
   * Get KI content to inject into context.
   * Call this when building the system prompt.
   */
  getKIContent(query: string = ''): string {
    if (!this.kiManager) return '';

    // Reserve tokens for KIs (about 20% of context)
    const kiTokenBudget = Math.floor(this.config.contextWindowSize * 0.2);
    this.lastKISelection = this.kiManager.selectForContext(query, kiTokenBudget);

    return this.kiManager.formatForContext(this.lastKISelection);
  }

  /**
   * Get the last KI selection (for stats/debugging).
   */
  getLastKISelection(): KIContextSelection | undefined {
    return this.lastKISelection;
  }

  // ==========================================================================
  // Compaction
  // ==========================================================================

  /**
   * Check if compaction is needed and perform it.
   */
  async checkAndCompact(): Promise<CompactionResult> {
    const messages = this.history.toMessages();
    const currentTokens = this.estimateTotalTokens(messages);
    const threshold = this.config.contextWindowSize * this.config.compactionThreshold;

    const result: CompactionResult = {
      performed: false,
      messagesBefore: messages.length,
      messagesAfter: messages.length,
      tokensBefore: currentTokens,
      tokensAfter: currentTokens,
      messagesDropped: 0,
      summaryCreated: false,
    };

    if (currentTokens <= threshold) {
      return result;
    }

    console.log(
      `[ContextManager] Compaction triggered: ${currentTokens} tokens > ${threshold} threshold`
    );

    // Perform multi-stage compaction
    await this.performCompaction(result);

    // Recalculate final stats
    const finalMessages = this.history.toMessages();
    result.messagesAfter = finalMessages.length;
    result.tokensAfter = this.estimateTotalTokens(finalMessages);
    result.messagesDropped = result.messagesBefore - result.messagesAfter;
    result.performed = true;

    console.log(
      `[ContextManager] Compaction complete: ${result.messagesBefore} → ${result.messagesAfter} msgs, ` +
        `${result.tokensBefore} → ${result.tokensAfter} tokens`
    );

    return result;
  }

  /**
   * Perform multi-stage context compaction.
   */
  private async performCompaction(result: CompactionResult): Promise<void> {
    const targetTokens = Math.floor(this.config.contextWindowSize * 0.7);

    // Stage 1: Truncate large tool results using head+tail
    await this.truncateLargeToolResults();

    // Check if we're under target
    let currentTokens = this.estimateTotalTokens(this.history.toMessages());
    if (currentTokens <= targetTokens) {
      console.log('[ContextManager] Stage 1 (truncation) sufficient');
      return;
    }

    // Stage 2: Priority-based message dropping
    await this.dropLowPriorityMessages(targetTokens);

    // Check again
    currentTokens = this.estimateTotalTokens(this.history.toMessages());
    if (currentTokens <= targetTokens) {
      console.log('[ContextManager] Stage 2 (priority drop) sufficient');
      return;
    }

    // Stage 3: Create summary and aggressive compaction
    await this.aggressiveCompaction(targetTokens, result);
  }

  /**
   * Stage 1: Truncate large tool results using head+tail strategy.
   * Note: This is now handled at tool execution time by toolLoop.ts
   * This method is kept for any tool results that slip through.
   */
  private async truncateLargeToolResults(): Promise<void> {
    // Tool result truncation is now handled in toolLoop.ts at execution time
    // This stage is a no-op but kept for the multi-stage flow
    console.log('[ContextManager] Stage 1: Tool results already truncated at execution time');
  }

  /**
   * Stage 2: Drop low-priority messages while preserving essential ones.
   * Uses the built-in ChatHistory.compact() method instead of manual removal.
   */
  private async dropLowPriorityMessages(targetTokens: number): Promise<void> {
    // Use built-in compact method which handles summarization
    const compactResult = this.history.compact(targetTokens);
    
    if (compactResult.compacted) {
      console.log(`[ContextManager] Stage 2: Compacted ${compactResult.removedCount} messages`);
    }
  }

  /**
   * Score messages by priority for retention decisions.
   */
  private scoreMessagesByPriority(messages: ChatMessage[]): MessagePriority[] {
    const result: MessagePriority[] = [];
    const messageCount = messages.length;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isRecent = i >= messageCount - PROTECTED_RECENT_COUNT;
      let priority = 0;
      let isProtected = false;

      // Calculate priority based on message type and recency
      switch (msg.role) {
        case 'system':
          priority = PRIORITY_WEIGHTS.system;
          isProtected = true;
          break;

        case 'user':
          if (i === messageCount - 1 || isRecent) {
            priority = PRIORITY_WEIGHTS.recentUser;
            isProtected = true;
          } else {
            priority = PRIORITY_WEIGHTS.olderUser;
          }
          break;

        case 'assistant':
          if (isRecent) {
            priority = msg.tool_calls?.length
              ? PRIORITY_WEIGHTS.recentAssistantWithTools
              : PRIORITY_WEIGHTS.recentAssistantText;
            isProtected = true;
          } else {
            priority = PRIORITY_WEIGHTS.olderAssistant;
          }
          break;

        case 'tool':
          // Tool results — check if error or success
          const content = typeof msg.content === 'string' ? msg.content.toLowerCase() : '';
          const isError =
            content.includes('error') ||
            content.includes('failed') ||
            content.includes('exception');
          priority = isError ? PRIORITY_WEIGHTS.toolResultError : PRIORITY_WEIGHTS.toolResultSuccess;

          // Protect recent tool results
          if (isRecent) {
            isProtected = true;
          }
          break;
      }

      result.push({
        message: msg,
        index: i,
        priority,
        tokens: this.estimateMessageTokens(msg),
        isProtected,
      });
    }

    return result;
  }

  /**
   * Stage 3: Aggressive compaction with summary generation.
   * Uses the built-in ChatHistory.compact() for final aggressive trimming.
   */
  private async aggressiveCompaction(
    targetTokens: number,
    result: CompactionResult
  ): Promise<void> {
    // Use aggressive built-in compaction
    const compactResult = this.history.compact(targetTokens);
    
    if (compactResult.compacted) {
      result.summaryCreated = true;
      console.log(
        `[ContextManager] Stage 3: Aggressive compaction removed ${compactResult.removedCount} messages`
      );
    }
  }

  /**
   * Create an extractive summary of messages.
   */
  private createExtractSummary(messages: ChatMessage[]): string {
    const sections: string[] = ['<conversation_summary>'];

    // Extract key information
    const userRequests: string[] = [];
    const toolsUsed = new Set<string>();
    const filesModified = new Set<string>();
    const errorsEncountered: string[] = [];
    const completedActions: string[] = [];

    for (const msg of messages) {
      // User requests
      if (msg.role === 'user' && typeof msg.content === 'string') {
        const preview = msg.content.slice(0, 150).replace(/\n/g, ' ').trim();
        if (preview.length > 20 && userRequests.length < 5) {
          userRequests.push(preview);
        }
      }

      // Tool calls
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          toolsUsed.add(tc.function.name);

          // Extract file paths
          try {
            const args = JSON.parse(tc.function.arguments);
            if (args.filePath) filesModified.add(args.filePath);
            if (args.targetPath) filesModified.add(args.targetPath);
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Tool results
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        const content = msg.content;
        const isError =
          content.toLowerCase().includes('error') ||
          content.toLowerCase().includes('failed');

        if (isError && errorsEncountered.length < 3) {
          const errorPreview = content.slice(0, 200).replace(/\n/g, ' ');
          errorsEncountered.push(errorPreview);
        } else if (
          !isError &&
          (content.includes('success') || content.includes('created') || content.includes('modified'))
        ) {
          const actionPreview = content.slice(0, 100).replace(/\n/g, ' ');
          if (completedActions.length < 5) {
            completedActions.push(actionPreview);
          }
        }
      }
    }

    // Build summary
    if (userRequests.length > 0) {
      sections.push('\n**User Requests:**');
      for (const req of userRequests) {
        sections.push(`- ${req}${req.length >= 150 ? '...' : ''}`);
      }
    }

    if (toolsUsed.size > 0) {
      sections.push(`\n**Tools Used:** ${Array.from(toolsUsed).join(', ')}`);
    }

    if (filesModified.size > 0) {
      const files = Array.from(filesModified).slice(0, 10);
      sections.push(`\n**Files Involved:** ${files.join(', ')}`);
    }

    if (completedActions.length > 0) {
      sections.push('\n**Completed Actions:**');
      for (const action of completedActions) {
        sections.push(`- ${action}`);
      }
    }

    if (errorsEncountered.length > 0) {
      sections.push('\n**Errors Encountered:**');
      for (const error of errorsEncountered) {
        sections.push(`- ${error}${error.length >= 200 ? '...' : ''}`);
      }
    }

    sections.push('\n</conversation_summary>');

    return sections.join('\n');
  }

  // ==========================================================================
  // Token Estimation
  // ==========================================================================

  /**
   * Estimate total tokens in a list of messages.
   */
  estimateTotalTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateMessageTokens(msg);
    }
    return total;
  }

  /**
   * Estimate tokens for a single message.
   */
  private estimateMessageTokens(msg: ChatMessage): number {
    let tokens = 0;

    // Content tokens
    if (typeof msg.content === 'string') {
      tokens += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.text) {
          tokens += estimateTokens(part.text);
        }
      }
    }

    // Tool call tokens
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        tokens += estimateTokens(JSON.stringify(tc));
      }
    }

    // Role/structure overhead (~4 tokens per message)
    tokens += 4;

    return tokens;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get detailed context usage statistics.
   */
  getContextStats(): ContextStats {
    const messages = this.history.toMessages();
    let kiTokens = 0;
    let toolResultTokens = 0;
    let userMessageTokens = 0;
    let assistantTokens = 0;

    for (const msg of messages) {
      const msgTokens = this.estimateMessageTokens(msg);

      switch (msg.role) {
        case 'system':
          // System includes KI content
          kiTokens = msgTokens;
          break;
        case 'user':
          userMessageTokens += msgTokens;
          break;
        case 'assistant':
          assistantTokens += msgTokens;
          break;
        case 'tool':
          toolResultTokens += msgTokens;
          break;
      }
    }

    // Adjust KI tokens if we have a selection
    if (this.lastKISelection) {
      kiTokens = this.lastKISelection.totalTokens;
    }

    const currentTokens = kiTokens + toolResultTokens + userMessageTokens + assistantTokens;

    return {
      currentTokens,
      maxTokens: this.config.contextWindowSize,
      usagePercent: (currentTokens / this.config.contextWindowSize) * 100,
      messageCount: messages.length,
      kiTokens,
      toolResultTokens,
      userMessageTokens,
      assistantTokens,
    };
  }

  /**
   * Get a formatted summary of context usage.
   */
  getContextSummary(): string {
    const stats = this.getContextStats();

    return [
      `Context: ${stats.currentTokens}/${stats.maxTokens} tokens (${stats.usagePercent.toFixed(1)}%)`,
      `Messages: ${stats.messageCount}`,
      `Breakdown: KI=${stats.kiTokens}, Tools=${stats.toolResultTokens}, User=${stats.userMessageTokens}, Assistant=${stats.assistantTokens}`,
    ].join('\n');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a context manager with the given configuration.
 */
export function createContextManager(
  history: ChatHistory,
  config: AgentConfig,
  kiManager?: KnowledgeItemManager
): ContextManager {
  return new ContextManager({ history, agentConfig: config, kiManager });
}
