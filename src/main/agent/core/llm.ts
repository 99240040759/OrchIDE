/**
 * OpenAI-Compatible LLM Client with Streaming
 * 
 * Works with NVIDIA NIM, OpenAI, and any OpenAI-compatible API.
 * Supports tool calling, streaming, and abort signals.
 */

import type {
  ChatMessage,
  CompletionOptions,
  StreamEvent,
  ToolCall,
  ToolCallDelta,
  ToolDefinition,
  Usage,
  AgentConfig,
} from './types';

// ============================================================================
// API Types
// ============================================================================

interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  tools?: ChatCompletionTool[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  stream?: boolean;
}

interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: Usage;
}

interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: string;
    content?: string | null;
    tool_calls?: ToolCallDelta[];
  };
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionResponseChoice[];
  usage: Usage;
}

interface ChatCompletionResponseChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

// ============================================================================
// LLM Client
// ============================================================================

export interface LLMClientConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
}

// Alias for compatibility
export type LLMConfig = LLMClientConfig;

export class LLMClient {
  private apiKey: string;
  private apiBase: string;
  private model: string;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(config: LLMClientConfig) {
    this.apiKey = config.apiKey;
    this.apiBase = config.apiBase.replace(/\/$/, ''); // Remove trailing slash
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 120000;
    this.maxRetries = config.maxRetries ?? 2;
  }

  /**
   * Convert internal ChatMessage to API format
   */
  private toAPIMessage(message: ChatMessage): ChatCompletionMessage {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content as string,
        tool_call_id: message.tool_call_id,
      };
    }

    if (message.role === 'assistant') {
      const apiMsg: ChatCompletionMessage = {
        role: 'assistant',
        content: message.content,
      };
      if (message.tool_calls && message.tool_calls.length > 0) {
        apiMsg.tool_calls = message.tool_calls;
      }
      return apiMsg;
    }

    return {
      role: message.role,
      content: typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content),
    };
  }

  /**
   * Convert ToolDefinition to API format
   */
  private toAPITool(tool: ToolDefinition): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as unknown as Record<string, unknown>,
      },
    };
  }

  /**
   * Make a streaming chat completion request
   */
  async *streamChat(
    messages: ChatMessage[],
    options: CompletionOptions = {},
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent, void, unknown> {
    console.log('[LLMClient] streamChat called');
    console.log('[LLMClient] Messages:', messages.length);
    console.log('[LLMClient] Options:', options);
    console.log('[LLMClient] API base:', this.apiBase);
    console.log('[LLMClient] Model:', this.model);
    console.log('[LLMClient] Has API key:', !!this.apiKey);
    
    const apiMessages = messages.map(m => this.toAPIMessage(m));
    console.log('[LLMClient] API messages:', apiMessages);
    
    const body: ChatCompletionRequest = {
      model: options.model ?? this.model,
      messages: apiMessages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stop,
      stream: true,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => this.toAPITool(t));
      body.tool_choice = options.toolChoice ?? 'auto';
    }

    console.log('[LLMClient] Request body:', JSON.stringify(body, null, 2));

    let retries = 0;
    let lastError: Error | null = null;

    while (retries <= this.maxRetries) {
      try {
        console.log(`[LLMClient] Attempt ${retries + 1}/${this.maxRetries + 1}`);
        
        // Compose a unified AbortController that fires when EITHER the external
        // signal fires OR our internal timeout fires.
        const timeoutController = new AbortController();
        const timeout = setTimeout(() => {
          console.warn('[LLMClient] Request timed out after', this.timeoutMs, 'ms');
          timeoutController.abort();
        }, this.timeoutMs);

        const combinedController = new AbortController();

        const onExternalAbort = () => combinedController.abort();
        const onTimeoutAbort  = () => combinedController.abort();

        signal?.addEventListener('abort', onExternalAbort, { once: true });
        timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

        const url = `${this.apiBase}/chat/completions`;
        console.log('[LLMClient] Making request to:', url);
        console.log('[LLMClient] Headers: Content-Type=application/json, Authorization=Bearer ***');

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: combinedController.signal,
        });

        console.log('[LLMClient] Response status:', response.status);

        clearTimeout(timeout);
        // Clean up abort listeners to avoid memory leaks
        signal?.removeEventListener('abort', onExternalAbort);

        if (!response.ok) {
          const errorBody = await response.text();
          console.error('[LLMClient] API error response:', errorBody);
          throw new Error(`LLM API error (${response.status}): ${errorBody}`);
        }

        if (!response.body) {
          console.error('[LLMClient] No response body received');
          throw new Error('No response body received');
        }

        console.log('[LLMClient] Starting to read response stream...');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        // Track tool calls across chunks
        const toolCallsInProgress = new Map<number, {
          id: string;
          name: string;
          arguments: string;
        }>();

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              if (!trimmed.startsWith('data: ')) continue;

              try {
                const chunk: ChatCompletionChunk = JSON.parse(trimmed.slice(6));
                const choice = chunk.choices[0];
                
                if (!choice) continue;

                // Handle content streaming
                if (choice.delta.content) {
                  yield {
                    type: 'text_delta',
                    sessionId: '',
                    data: { text: choice.delta.content },
                  };
                }

                // Handle tool calls
                if (choice.delta.tool_calls) {
                  for (const tcDelta of choice.delta.tool_calls) {
                    const index = tcDelta.index ?? 0;
                    
                    if (tcDelta.id) {
                      // New tool call
                      toolCallsInProgress.set(index, {
                        id: tcDelta.id,
                        name: tcDelta.function?.name ?? '',
                        arguments: tcDelta.function?.arguments ?? '',
                      });

                      yield {
                        type: 'tool_call_start',
                        sessionId: '',
                        data: {
                          toolCallDelta: tcDelta,
                        },
                      };
                    } else {
                      // Continuation of existing tool call
                      const existing = toolCallsInProgress.get(index);
                      if (existing) {
                        if (tcDelta.function?.name) {
                          existing.name += tcDelta.function.name;
                        }
                        if (tcDelta.function?.arguments) {
                          existing.arguments += tcDelta.function.arguments;
                        }

                        yield {
                          type: 'tool_call_delta',
                          sessionId: '',
                          data: {
                            toolCallDelta: tcDelta,
                          },
                        };
                      }
                    }
                  }
                }

                // Handle finish reason
                if (choice.finish_reason) {
                  // Emit completed tool calls
                  for (const tc of Array.from(toolCallsInProgress.values())) {
                    yield {
                      type: 'tool_call_complete',
                      sessionId: '',
                      data: {
                        toolCall: {
                          id: tc.id,
                          type: 'function',
                          function: {
                            name: tc.name,
                            arguments: tc.arguments,
                          },
                        },
                      },
                    };
                  }

                  yield {
                    type: 'stream_end',
                    sessionId: '',
                    data: {
                      finishReason: choice.finish_reason,
                      usage: chunk.usage,
                    },
                  };
                }
              } catch (parseError) {
                // Skip malformed chunks
                console.warn('[LLM] Failed to parse chunk:', trimmed);
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        return; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on abort
        if (signal?.aborted) {
          throw new Error('Request aborted');
        }

        retries++;
        if (retries <= this.maxRetries) {
          // Exponential backoff
          await new Promise(resolve => 
            setTimeout(resolve, Math.pow(2, retries) * 1000)
          );
        }
      }
    }

    throw lastError ?? new Error('Failed after max retries');
  }

  /**
   * Make a non-streaming chat completion request
   */
  async chat(
    messages: ChatMessage[],
    options: CompletionOptions = {},
    signal?: AbortSignal
  ): Promise<{
    content: string | null;
    toolCalls: ToolCall[];
    usage: Usage;
    finishReason: string;
  }> {
    const apiMessages = messages.map(m => this.toAPIMessage(m));
    
    const body: ChatCompletionRequest = {
      model: options.model ?? this.model,
      messages: apiMessages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stop,
      stream: false,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => this.toAPITool(t));
      body.tool_choice = options.toolChoice ?? 'auto';
    }

    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errorBody}`);
    }

    const result: ChatCompletionResponse = await response.json();
    const choice = result.choices[0];

    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls ?? [],
      usage: result.usage,
      finishReason: choice.finish_reason,
    };
  }

  /**
   * Create a new client with updated config
   */
  withConfig(updates: Partial<LLMClientConfig>): LLMClient {
    return new LLMClient({
      apiKey: updates.apiKey ?? this.apiKey,
      apiBase: updates.apiBase ?? this.apiBase,
      model: updates.model ?? this.model,
      timeoutMs: updates.timeoutMs ?? this.timeoutMs,
      maxRetries: updates.maxRetries ?? this.maxRetries,
    });
  }
}

/**
 * Create LLM client from agent config
 */
export function createLLMClient(config: AgentConfig): LLMClient {
  return new LLMClient({
    apiKey: config.apiKey,
    apiBase: config.apiBase,
    model: config.model,
    timeoutMs: config.llmTimeoutMs,
  });
}

/**
 * Check if an error is a context length error
 */
export function isContextLengthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('context length') ||
    message.includes('maximum context') ||
    message.includes('token limit') ||
    message.includes('too many tokens') ||
    message.includes('context_length_exceeded')
  );
}
