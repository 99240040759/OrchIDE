/**
 * Chat History Manager
 * 
 * Manages conversation history with tool call state tracking.
 * Provides methods for adding messages, updating tool states, and compaction.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  ChatHistoryItemWithId,
  ToolCall,
  ToolCallState,
  ToolCallStatus,
  ContextItem,
  AssistantMessage,
  Usage,
} from './types';
import {
  countMessagesTokens,
  summarizeForCompaction,
} from './tokens';

// ============================================================================
// Chat History Class
// ============================================================================

export class ChatHistory {
  private history: ChatHistoryItemWithId[] = [];
  private systemMessage: string | null = null;

  constructor(systemMessage?: string) {
    this.systemMessage = systemMessage ?? null;
  }

  // ============================================================================
  // Basic Operations
  // ============================================================================

  /**
   * Get all history items
   */
  getHistory(): ChatHistoryItemWithId[] {
    return [...this.history];
  }

  /**
   * Get history length
   */
  get length(): number {
    return this.history.length;
  }

  /**
   * Get the last history item
   */
  getLast(): ChatHistoryItemWithId | undefined {
    return this.history[this.history.length - 1];
  }

  /**
   * Get item at index
   */
  getAt(index: number): ChatHistoryItemWithId | undefined {
    return this.history[index];
  }

  /**
   * Clear history
   */
  clear(): void {
    this.history = [];
  }

  /**
   * Set system message
   */
  setSystemMessage(message: string): void {
    this.systemMessage = message;
  }

  /**
   * Get system message
   */
  getSystemMessage(): string | null {
    return this.systemMessage;
  }

  // ============================================================================
  // Message Operations
  // ============================================================================

  /**
   * Add a user message
   */
  addUserMessage(content: string, contextItems: ContextItem[] = []): ChatHistoryItemWithId {
    const item: ChatHistoryItemWithId = {
      id: uuidv4(),
      message: {
        id: uuidv4(),
        role: 'user',
        content,
      },
      contextItems,
    };
    this.history.push(item);
    return item;
  }

  /**
   * Add an assistant message
   */
  addAssistantMessage(
    content: string | null,
    toolCalls?: ToolCall[],
    _usage?: Usage
  ): ChatHistoryItemWithId {
    const message: AssistantMessage & { id: string } = {
      id: uuidv4(),
      role: 'assistant',
      content,
    };
    
    if (toolCalls && toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    const item: ChatHistoryItemWithId = {
      id: uuidv4(),
      message,
      contextItems: [],
      toolCallStates: toolCalls?.map(tc => ({
        toolCallId: tc.id,
        toolCall: tc,
        status: 'generated' as ToolCallStatus,
        parsedArgs: safeParseArgs(tc.function.arguments),
      })),
    };
    
    this.history.push(item);
    return item;
  }

  /**
   * Add a tool result message
   */
  addToolResult(
    toolCallId: string,
    content: string,
    status: ToolCallStatus = 'done'
  ): ChatHistoryItemWithId {
    const item: ChatHistoryItemWithId = {
      id: uuidv4(),
      message: {
        id: uuidv4(),
        role: 'tool',
        content,
        tool_call_id: toolCallId,
      },
      contextItems: [],
    };
    
    // Update the tool call state in the corresponding assistant message
    this.updateToolCallStatus(toolCallId, status);
    
    this.history.push(item);
    return item;
  }

  /**
   * Append content or reasoning to the last assistant message (for streaming)
   */
  appendToLastAssistant(content: string, isReasoning = false): void {
    const last = this.getLast();
    if (last && last.message.role === 'assistant') {
      const msg = last.message as import('./types').AssistantMessage;
      if (isReasoning) {
        msg.reasoning = (msg.reasoning ?? '') + content;
      } else {
        msg.content = (msg.content ?? '') + content;
      }
    }
  }

  /**
   * Start a new assistant message for streaming
   */
  startAssistantMessage(): ChatHistoryItemWithId {
    return this.addAssistantMessage('');
  }

  // ============================================================================
  // Tool Call State Management
  // ============================================================================

  /**
   * Update tool call status
   */
  updateToolCallStatus(
    toolCallId: string,
    status: ToolCallStatus,
    output?: ContextItem[],
    error?: string
  ): void {
    // Find the assistant message containing this tool call
    for (let i = this.history.length - 1; i >= 0; i--) {
      const item = this.history[i];
      if (item.toolCallStates) {
        const tcState = item.toolCallStates.find(tc => tc.toolCallId === toolCallId);
        if (tcState) {
          tcState.status = status;
          if (output) tcState.output = output;
          if (error) tcState.error = error;
          if (status === 'calling') tcState.startedAt = Date.now();
          if (status === 'done' || status === 'errored') tcState.completedAt = Date.now();
          return;
        }
      }
    }
  }

  /**
   * Get tool call state by ID
   */
  getToolCallState(toolCallId: string): ToolCallState | undefined {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const item = this.history[i];
      if (item.toolCallStates) {
        const tcState = item.toolCallStates.find(tc => tc.toolCallId === toolCallId);
        if (tcState) return tcState;
      }
    }
    return undefined;
  }

  /**
   * Get all pending tool calls (generated but not executed)
   */
  getPendingToolCalls(): ToolCallState[] {
    const pending: ToolCallState[] = [];
    for (const item of this.history) {
      if (item.toolCallStates) {
        for (const tc of item.toolCallStates) {
          if (tc.status === 'generated' || tc.status === 'pending_approval') {
            pending.push(tc);
          }
        }
      }
    }
    return pending;
  }

  /**
   * Get all tool calls in progress
   */
  getInProgressToolCalls(): ToolCallState[] {
    const inProgress: ToolCallState[] = [];
    for (const item of this.history) {
      if (item.toolCallStates) {
        for (const tc of item.toolCallStates) {
          if (tc.status === 'calling') {
            inProgress.push(tc);
          }
        }
      }
    }
    return inProgress;
  }

  /**
   * Check if all tool calls for last assistant message are complete
   */
  areAllToolCallsComplete(): boolean {
    const last = this.findLastAssistantWithToolCalls();
    if (!last || !last.toolCallStates) return true;
    
    return last.toolCallStates.every(tc => 
      tc.status === 'done' || 
      tc.status === 'errored' || 
      tc.status === 'canceled'
    );
  }

  /**
   * Find the last assistant message with tool calls
   */
  findLastAssistantWithToolCalls(): ChatHistoryItemWithId | undefined {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const item = this.history[i];
      if (item.message.role === 'assistant' && item.toolCallStates?.length) {
        return item;
      }
    }
    return undefined;
  }

  // ============================================================================
  // Streaming Support
  // ============================================================================

  /**
   * Add or update tool call from streaming delta
   */
  handleToolCallDelta(delta: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }): void {
    const last = this.getLast();
    if (!last || last.message.role !== 'assistant') return;

    if (!last.toolCallStates) {
      last.toolCallStates = [];
    }

    const index = delta.index ?? last.toolCallStates.length;

    if (delta.id) {
      // New tool call
      const toolCall: ToolCall = {
        id: delta.id,
        type: 'function',
        function: {
          name: delta.function?.name ?? '',
          arguments: delta.function?.arguments ?? '',
        },
      };
      
      last.toolCallStates[index] = {
        toolCallId: delta.id,
        toolCall,
        status: 'generating',
      };
      
      // Also add to message.tool_calls
      if (!last.message.tool_calls) {
        (last.message as AssistantMessage).tool_calls = [];
      }
      (last.message as AssistantMessage).tool_calls![index] = toolCall;
    } else {
      // Continue existing tool call — append arguments/name chunks.
      //
      // CRITICAL: existing.toolCall and message.tool_calls[index] are the SAME
      // object reference (assigned together above at creation time). Mutating
      // existing.toolCall.function.arguments ALREADY updates the message entry.
      // A second += on msgTc would double every chunk → garbled JSON.
      const existing = last.toolCallStates[index];
      if (existing) {
        if (delta.function?.name) {
          existing.toolCall.function.name += delta.function.name;
        }
        if (delta.function?.arguments) {
          existing.toolCall.function.arguments += delta.function.arguments;
        }
        // No separate msgTc update needed — same object reference.
      }
    }
  }

  /**
   * Override the arguments for a tool call with the fully-assembled string
   * from tool_call_complete.  Called by the tool loop after the stream ends.
   * This is the authoritative source — the LLM client assembled it from all
   * chunks in order inside toolCallsInProgress, so it can never be doubled.
   */
  overrideToolCallArguments(toolCallId: string, fullyAssembledArgs: string): void {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const item = this.history[i];
      if (item.message.role === 'assistant' && item.toolCallStates) {
        for (const tc of item.toolCallStates) {
          if (tc.toolCallId === toolCallId) {
            // Overwrite with authoritative assembled string
            tc.toolCall.function.arguments = fullyAssembledArgs;
            // message.tool_calls[x] is the same object reference — auto-updated
            console.log(`[ChatHistory] Overrode args for ${toolCallId}: ${fullyAssembledArgs.slice(0, 80)}`);
            return;
          }
        }
      }
    }
  }

  /**
   * Mark generating tool calls as generated (called after stream ends)
   */
  finalizeToolCalls(): void {
    // Walk backwards from the end of history to find the last assistant message
    // that still has tool calls in 'generating' state.  We cannot just use
    // getLast() because the streamed assistant message may be buried before
    // tool-result messages in pathological cases.
    for (let i = this.history.length - 1; i >= 0; i--) {
      const item = this.history[i];
      if (item.message.role === 'assistant' && item.toolCallStates?.length) {
        for (const tc of item.toolCallStates) {
          if (tc.status === 'generating') {
            tc.status = 'generated';
            tc.parsedArgs = safeParseArgs(tc.toolCall.function.arguments);
          }
        }
        return; // only finalize the most-recent assistant message
      }
    }
  }

  /**
   * Remove the last history item if it is an empty assistant message with no
   * tool calls.  Called by the tool loop on error to avoid persisting a blank
   * placeholder that would confuse subsequent LLM calls.
   */
  removeLastIfEmptyAssistant(): void {
    const last = this.getLast();
    if (!last) return;
    if (
      last.message.role === 'assistant' &&
      (!last.message.content || last.message.content === '') &&
      (!last.toolCallStates || last.toolCallStates.length === 0)
    ) {
      this.history.pop();
      console.log('[ChatHistory] Removed empty assistant placeholder from history');
    }
  }

  // ============================================================================
  // Conversion to API Format
  // ============================================================================

  /**
   * Convert history to ChatMessage array for API calls.
   *
   * Sanitization applied:
   * - Empty tool_calls arrays are stripped from assistant messages (OpenAI
   *   rejects assistant messages with tool_calls: []).
   * - Null/empty assistant messages that have no tool_calls are included as-is
   *   (the LLM may have replied with just whitespace before stopping).
   */
  toMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Add system message if present
    if (this.systemMessage) {
      messages.push({
        role: 'system',
        content: this.systemMessage,
      });
    }

    for (const item of this.history) {
      const msg = item.message;

      // For assistant messages: strip empty tool_calls array so the OpenAI API
      // does not reject the request, and ensure tool_calls with real entries
      // are preserved.
      if (msg.role === 'assistant') {
        const assistantMsg = msg as import('./types').AssistantMessage;
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length === 0) {
          // Clone without the empty array
          const { tool_calls: _dropped, ...rest } = assistantMsg as any;
          messages.push(rest as ChatMessage);
          continue;
        }
      }

      messages.push(msg);
    }

    return messages;
  }

  /**
   * Convert history to API format with context rendering
   */
  toMessagesWithContext(): ChatMessage[] {
    const messages: ChatMessage[] = [];

    if (this.systemMessage) {
      messages.push({
        role: 'system',
        content: this.systemMessage,
      });
    }

    for (const item of this.history) {
      const msg = { ...item.message };
      
      // Prepend context items to user messages
      if (msg.role === 'user' && item.contextItems.length > 0) {
        const contextText = item.contextItems
          .map(ci => `<context name="${ci.name}">\n${ci.content}\n</context>`)
          .join('\n\n');
        msg.content = `${contextText}\n\n${msg.content}`;
      }
      
      messages.push(msg);
    }

    return messages;
  }

  // ============================================================================
  // Token Management
  // ============================================================================

  /**
   * Get total token count
   */
  getTokenCount(): number {
    return countMessagesTokens(this.toMessages());
  }

  /**
   * Compact history to fit within token limit
   */
  compact(maxTokens: number): { compacted: boolean; removedCount: number } {
    const messages = this.toMessages();
    const currentTokens = countMessagesTokens(messages);

    if (currentTokens <= maxTokens) {
      return { compacted: false, removedCount: 0 };
    }

    // Calculate how many messages to summarize
    const targetTokens = maxTokens * 0.7; // Leave room for new messages
    let tokensToRemove = currentTokens - targetTokens;
    let messagesToSummarize = 0;

    // Count from oldest messages (after system)
    const nonSystemHistory = this.history;
    for (const item of nonSystemHistory) {
      if (tokensToRemove <= 0) break;
      tokensToRemove -= countMessagesTokens([item.message]);
      messagesToSummarize++;
    }

    if (messagesToSummarize === 0) {
      return { compacted: false, removedCount: 0 };
    }

    // Create summary of removed messages
    const toSummarize = nonSystemHistory.slice(0, messagesToSummarize);
    const summary = summarizeForCompaction(toSummarize.map(h => h.message));

    // Remove old messages
    this.history = nonSystemHistory.slice(messagesToSummarize);

    // Add summary as first user message
    this.history.unshift({
      id: uuidv4(),
      message: {
        id: uuidv4(),
        role: 'user',
        content: `[Previous conversation summary]\n${summary}\n[End of summary]`,
      },
      contextItems: [],
    });

    return { compacted: true, removedCount: messagesToSummarize };
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Export history for persistence
   */
  export(): { systemMessage: string | null; history: ChatHistoryItemWithId[] } {
    return {
      systemMessage: this.systemMessage,
      history: this.history,
    };
  }

  /**
   * Import history from persisted data
   */
  import(data: { systemMessage: string | null; history: ChatHistoryItemWithId[] }): void {
    this.systemMessage = data.systemMessage;
    this.history = data.history;
  }

  /**
   * Create from persisted data
   */
  static fromData(data: { systemMessage: string | null; history: ChatHistoryItemWithId[] }): ChatHistory {
    const history = new ChatHistory(data.systemMessage ?? undefined);
    history.history = data.history;
    return history;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function safeParseArgs(argsString: string): Record<string, unknown> {
  try {
    return JSON.parse(argsString);
  } catch {
    return {};
  }
}

/**
 * Find a history item by tool call ID
 */
export function findHistoryItemByToolCallId(
  history: ChatHistoryItemWithId[],
  toolCallId: string
): ChatHistoryItemWithId | undefined {
  for (const item of history) {
    if (item.toolCallStates?.some(tc => tc.toolCallId === toolCallId)) {
      return item;
    }
  }
  return undefined;
}

/**
 * Find a tool call state by ID
 */
export function findToolCallById(
  history: ChatHistoryItemWithId[],
  toolCallId: string
): ToolCallState | undefined {
  for (const item of history) {
    const tc = item.toolCallStates?.find(t => t.toolCallId === toolCallId);
    if (tc) return tc;
  }
  return undefined;
}

/**
 * Render context items to string
 */
export function renderContextItems(items: ContextItem[]): string {
  if (items.length === 0) return '';
  
  return items
    .filter(item => !item.hidden)
    .map(item => {
      const header = item.description ? `${item.name}: ${item.description}` : item.name;
      return `### ${header}\n\n${item.content}`;
    })
    .join('\n\n');
}
