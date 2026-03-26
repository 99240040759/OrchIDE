/**
 * Context Manager
 * 
 * Manages context window size and performs compaction when needed.
 */

import type { AgentConfig, ChatMessage } from '../core/types';
import type { ChatHistory } from '../core/history';
import { estimateTokens } from '../core/tokens';

// ============================================================================
// Context Manager Class
// ============================================================================

export class ContextManager {
  private history: ChatHistory;
  private config: AgentConfig;

  constructor(history: ChatHistory, config: AgentConfig) {
    this.history = history;
    this.config = config;
  }

  /**
   * Check if compaction is needed and perform it
   */
  async checkAndCompact(): Promise<boolean> {
    const messages = this.history.toMessages();
    const currentTokens = this.estimateTotalTokens(messages);
    const threshold = this.config.contextWindowSize * this.config.compactionThreshold;

    if (currentTokens > threshold) {
      await this.performCompaction();
      return true;
    }

    return false;
  }

  /**
   * Estimate total tokens in messages
   */
  estimateTotalTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const content of msg.content) {
          if (content.text) {
            total += estimateTokens(content.text);
          }
        }
      }
      
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          total += estimateTokens(JSON.stringify(tc));
        }
      }
    }
    return total;
  }

  /**
   * Perform context compaction
   */
  private async performCompaction(): Promise<void> {
    const messages = this.history.toMessages();
    
    // Strategy: Keep system message, summarize old messages, keep recent ones
    const systemMessage = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    // Keep the last N messages (roughly 30% of context)
    const keepCount = Math.max(4, Math.floor(nonSystemMessages.length * 0.3));
    const toKeep = nonSystemMessages.slice(-keepCount);
    const toSummarize = nonSystemMessages.slice(0, -keepCount);

    if (toSummarize.length < 4) {
      // Not enough to summarize
      return;
    }

    // Create a summary of old messages
    const summary = this.createSummary(toSummarize);

    // Rebuild history with compaction
    const targetTokens = Math.floor(this.config.contextWindowSize * 0.7);
    this.history.compact(targetTokens);
  }

  /**
   * Create a summary of messages
   */
  private createSummary(messages: ChatMessage[]): string {
    // Simple extractive summary
    // In production, this could use the LLM to create a better summary
    
    const parts: string[] = ['[Previous conversation summary]'];
    
    const topics: string[] = [];
    const toolsUsed: string[] = [];
    const filesModified: string[] = [];

    for (const msg of messages) {
      // Extract user questions/requests
      if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.length > 20) {
        const preview = msg.content.slice(0, 100).replace(/\n/g, ' ');
        if (!topics.includes(preview)) {
          topics.push(preview);
        }
      }

      // Extract tool usage
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (!toolsUsed.includes(tc.function.name)) {
            toolsUsed.push(tc.function.name);
          }
          
          // Track file operations
          try {
            const args = JSON.parse(tc.function.arguments);
            if (args.filePath) {
              filesModified.push(args.filePath);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    if (topics.length > 0) {
      parts.push(`\nTopics discussed: ${topics.slice(0, 5).join('; ')}`);
    }

    if (toolsUsed.length > 0) {
      parts.push(`\nTools used: ${toolsUsed.join(', ')}`);
    }

    if (filesModified.length > 0) {
      const uniqueFiles = Array.from(new Set(filesModified)).slice(0, 10);
      parts.push(`\nFiles involved: ${uniqueFiles.join(', ')}`);
    }

    parts.push('\n[End of summary - recent messages follow]');

    return parts.join('\n');
  }

  /**
   * Get context usage statistics
   */
  getContextStats(): {
    currentTokens: number;
    maxTokens: number;
    usagePercent: number;
    messageCount: number;
  } {
    const messages = this.history.toMessages();
    const currentTokens = this.estimateTotalTokens(messages);
    
    return {
      currentTokens,
      maxTokens: this.config.contextWindowSize,
      usagePercent: (currentTokens / this.config.contextWindowSize) * 100,
      messageCount: messages.length,
    };
  }
}
