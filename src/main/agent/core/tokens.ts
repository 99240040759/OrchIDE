/**
 * Token Counting Utilities
 * 
 * Provides token counting for context management.
 * Uses a simple approximation for speed - can be replaced with tiktoken for accuracy.
 */

import type { ChatMessage, ToolDefinition } from './types';

// ============================================================================
// Token Estimation
// ============================================================================

// Average characters per token (rough estimate for English text)
const CHARS_PER_TOKEN = 4;

// Overhead tokens per message (for role, formatting)
const MESSAGE_OVERHEAD = 4;

// Tool definition overhead
const TOOL_DEFINITION_OVERHEAD = 20;

/**
 * Estimate token count for a string
 * This is a fast approximation - for accurate counts, use tiktoken
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Count tokens in a single message
 */
export function countMessageTokens(message: ChatMessage): number {
  let tokens = MESSAGE_OVERHEAD;

  // Content tokens
  if (typeof message.content === 'string') {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === 'text' && part.text) {
        tokens += estimateTokens(part.text);
      } else if (part.type === 'image_url') {
        // Image tokens are complex - use a rough estimate
        const detail = part.image_url?.detail ?? 'auto';
        tokens += detail === 'high' ? 765 : detail === 'low' ? 85 : 170;
      }
    }
  }

  // Tool call tokens
  if (message.role === 'assistant' && message.tool_calls) {
    for (const tc of message.tool_calls) {
      tokens += estimateTokens(tc.function.name);
      tokens += estimateTokens(tc.function.arguments);
      tokens += 10; // Overhead for tool call structure
    }
  }

  // Tool call ID
  if (message.role === 'tool' && message.tool_call_id) {
    tokens += estimateTokens(message.tool_call_id);
  }

  return tokens;
}

/**
 * Count tokens in message array
 */
export function countMessagesTokens(messages: ChatMessage[]): number {
  let total = 3; // Base overhead for message array
  for (const message of messages) {
    total += countMessageTokens(message);
  }
  return total;
}

/**
 * Count tokens in tool definitions
 */
export function countToolTokens(tools: ToolDefinition[]): number {
  let total = 0;
  for (const tool of tools) {
    total += TOOL_DEFINITION_OVERHEAD;
    total += estimateTokens(tool.function.name);
    total += estimateTokens(tool.function.description);
    total += estimateTokens(JSON.stringify(tool.function.parameters));
  }
  return total;
}

/**
 * Estimate total request tokens (messages + tools + system)
 */
export function estimateRequestTokens(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): number {
  let total = countMessagesTokens(messages);
  if (tools && tools.length > 0) {
    total += countToolTokens(tools);
  }
  return total;
}

// ============================================================================
// Context Management
// ============================================================================

/**
 * Calculate remaining tokens in context window
 */
export function getRemainingTokens(
  contextWindowSize: number,
  currentTokens: number,
  reservedForCompletion = 4096
): number {
  return Math.max(0, contextWindowSize - currentTokens - reservedForCompletion);
}

/**
 * Check if we're approaching context limit
 */
export function isApproachingContextLimit(
  contextWindowSize: number,
  currentTokens: number,
  threshold = 0.8
): boolean {
  return currentTokens >= contextWindowSize * threshold;
}

/**
 * Truncate messages to fit within token limit
 * Keeps system message and most recent messages
 */
export function truncateMessages(
  messages: ChatMessage[],
  maxTokens: number,
  keepSystemMessage = true
): { messages: ChatMessage[]; truncated: boolean } {
  if (countMessagesTokens(messages) <= maxTokens) {
    return { messages, truncated: false };
  }

  const result: ChatMessage[] = [];
  let tokens = 3; // Base overhead

  // Keep system message if present and requested
  const systemMessage = messages.find(m => m.role === 'system');
  if (keepSystemMessage && systemMessage) {
    const systemTokens = countMessageTokens(systemMessage);
    if (tokens + systemTokens < maxTokens) {
      result.push(systemMessage);
      tokens += systemTokens;
    }
  }

  // Add messages from the end (most recent first)
  const nonSystemMessages = messages.filter(m => m.role !== 'system');
  const recentMessages: ChatMessage[] = [];

  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i];
    const msgTokens = countMessageTokens(msg);
    
    if (tokens + msgTokens <= maxTokens) {
      recentMessages.unshift(msg);
      tokens += msgTokens;
    } else {
      break;
    }
  }

  // Combine: system message + recent messages
  result.push(...recentMessages);

  return { 
    messages: result, 
    truncated: result.length < messages.length 
  };
}

/**
 * Create a summary of older messages for compaction
 */
export function summarizeForCompaction(messages: ChatMessage[]): string {
  const summary: string[] = [];
  
  for (const msg of messages) {
    if (msg.role === 'user') {
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : 'User provided input';
      summary.push(`User: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`);
    } else if (msg.role === 'assistant') {
      const content = msg.content ?? '';
      const toolInfo = msg.tool_calls?.length 
        ? ` [Used ${msg.tool_calls.length} tool(s)]` 
        : '';
      summary.push(`Assistant: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}${toolInfo}`);
    }
  }

  return summary.join('\n');
}

// ============================================================================
// Token Budget Allocation
// ============================================================================

interface TokenBudget {
  systemMessage: number;
  tools: number;
  history: number;
  completion: number;
  total: number;
}

/**
 * Calculate token budget allocation
 */
export function calculateTokenBudget(
  contextWindowSize: number,
  systemMessageTokens: number,
  toolTokens: number,
  completionReserve = 4096
): TokenBudget {
  const systemMessage = systemMessageTokens;
  const tools = toolTokens;
  const completion = completionReserve;
  const history = contextWindowSize - systemMessage - tools - completion;

  return {
    systemMessage,
    tools,
    history: Math.max(0, history),
    completion,
    total: contextWindowSize,
  };
}

/**
 * Get model context window size
 * Returns known sizes for common models, default otherwise
 */
export function getModelContextSize(modelName: string): number {
  const modelSizes: Record<string, number> = {
    // NVIDIA NIM models
    'meta/llama-3.3-70b-instruct': 128000,
    'meta/llama-3.1-405b-instruct': 128000,
    'meta/llama-3.1-70b-instruct': 128000,
    'meta/llama-3.1-8b-instruct': 128000,
    
    // OpenAI models
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16385,
    
    // Anthropic models
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-3.5-sonnet': 200000,
    
    // Default
    'default': 128000,
  };

  // Try exact match
  if (modelSizes[modelName]) {
    return modelSizes[modelName];
  }

  // Try partial match
  const lowerName = modelName.toLowerCase();
  for (const [key, size] of Object.entries(modelSizes)) {
    if (lowerName.includes(key.toLowerCase())) {
      return size;
    }
  }

  return modelSizes['default'];
}
