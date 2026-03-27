/**
 * OpenAI-Compatible LLM Client with Streaming
 *
 * Uses the official openai SDK for networking.
 * Handles NVIDIA NIM, OpenAI, and any OpenAI-compatible API.
 *
 * The SDK handles:
 *   - HTTP connection management
 *   - SSE parsing / TextDecoder
 *   - Automatic retries with exponential backoff
 *   - Timeout management
 *   - AbortSignal propagation
 *
 * This file then maps SDK chunks → our internal StreamEvent types,
 * with a custom <think> block parser applied on top of delta.content
 * for reasoning models (DeepSeek / Qwen on NVIDIA NIM) that embed
 * their chain-of-thought directly in the content stream.
 */

import OpenAI from 'openai';
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
// Extended Delta
// ============================================================================

/**
 * NVIDIA NIM emits a non-standard `reasoning_content` field alongside `content`.
 * The official OpenAI SDK types don't include it, so we extend the delta type.
 */
interface ExtendedDelta {
  role?: string;
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[];
}

// ============================================================================
// LLM Client Config
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

// ============================================================================
// LLM Client
// ============================================================================

export class LLMClient {
  private _config: LLMClientConfig;
  private client: OpenAI;
  private model: string;

  constructor(config: LLMClientConfig) {
    this._config = config;
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiBase.replace(/\/$/, ''),
      maxRetries: config.maxRetries ?? 2,
      timeout: config.timeoutMs ?? 120000,
    });
  }

  // --------------------------------------------------------------------------
  // Tool conversion helper
  // --------------------------------------------------------------------------

  private toAPITool(tool: ToolDefinition): OpenAI.Chat.Completions.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as unknown as Record<string, unknown>,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Streaming completion
  // --------------------------------------------------------------------------

  /**
   * Make a streaming chat completion request.
   * Yields StreamEvents compatible with the ToolLoop.
   */
  async *streamChat(
    messages: ChatMessage[],
    options: CompletionOptions = {},
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent, void, unknown> {

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: options.model ?? this.model,
      messages: messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      stream: true,
    };

    if (options.temperature !== undefined) params.temperature = options.temperature;
    if (options.maxTokens !== undefined) params.max_tokens = options.maxTokens;
    if (options.topP !== undefined) params.top_p = options.topP;
    if (options.frequencyPenalty !== undefined) params.frequency_penalty = options.frequencyPenalty;
    if (options.presencePenalty !== undefined) params.presence_penalty = options.presencePenalty;
    if (options.stop !== undefined) params.stop = options.stop;

    // O1/O3 reasoning effort (OpenAI native + NVIDIA NIM passthrough)
    const targetModel = params.model.toLowerCase();
    if (targetModel.includes('openai/') || targetModel.includes('-o1') || targetModel.includes('-o3')) {
      (params as unknown as Record<string, unknown>).reasoning_effort = 'high';
      // o1/o3 don't accept temperature
      if (targetModel.includes('-o1') || targetModel.includes('-o3')) {
        delete params.temperature;
      }
    }

    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools.map(t => this.toAPITool(t));
      params.tool_choice = (options.toolChoice ?? 'auto') as OpenAI.Chat.Completions.ChatCompletionCreateParams['tool_choice'];
    }

    // Create the stream — SDK handles SSE parsing, retries, and timeout
    const stream = await this.client.chat.completions.create(params, { signal });

    // Track tool calls across chunks (same logic as before, SDK gives us same deltas)
    const toolCallsInProgress = new Map<number, {
      id: string;
      name: string;
      arguments: string;
    }>();

    // <think> block state (for DeepSeek/Qwen that embed CoT in content)
    let contentBuffer = '';
    let inThinkBlock = false;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta as ExtendedDelta;

      // ------------------------------------------------------------------
      // 1. NVIDIA NIM native reasoning field (Kimi-K2, Qwen-thinking, etc.)
      //    Streamed separately from content — emit directly as reasoning_delta
      // ------------------------------------------------------------------
      if (delta.reasoning_content) {
        yield {
          type: 'reasoning_delta',
          sessionId: '',
          data: { text: delta.reasoning_content },
        };
      }

      // ------------------------------------------------------------------
      // 2. Content streaming with <think> block parser
      //    Some models (DeepSeek R1 etc.) put <think>...</think> inside content
      // ------------------------------------------------------------------
      if (delta.content) {
        contentBuffer += delta.content;

        while (contentBuffer.length > 0) {
          if (!inThinkBlock) {
            const startIdx = contentBuffer.indexOf('<think>');
            if (startIdx !== -1) {
              // Flush text before <think>
              const before = contentBuffer.slice(0, startIdx);
              if (before) {
                const cleaned = before.replace(/<\/think>[\n\r]*/g, '');
                if (cleaned) yield { type: 'text_delta', sessionId: '', data: { text: cleaned } };
              }
              inThinkBlock = true;
              contentBuffer = contentBuffer.slice(startIdx + 7); // len('<think>') === 7
            } else {
              // Check if we might be in the middle of a partial <think> tag
              const lastLess = contentBuffer.lastIndexOf('<');
              if (lastLess !== -1 && '<think>'.startsWith(contentBuffer.slice(lastLess))) {
                // Partial tag — flush everything before it and wait for more chunks
                const before = contentBuffer.slice(0, lastLess);
                if (before) {
                  const cleaned = before.replace(/<\/think>[\n\r]*/g, '');
                  if (cleaned) yield { type: 'text_delta', sessionId: '', data: { text: cleaned } };
                }
                contentBuffer = contentBuffer.slice(lastLess);
                break;
              } else {
                // No <think> tag anywhere — flush entire buffer as text
                const cleaned = contentBuffer.replace(/<\/think>[\n\r]*/g, '');
                if (cleaned) yield { type: 'text_delta', sessionId: '', data: { text: cleaned } };
                contentBuffer = '';
              }
            }
          } else {
            // Inside a <think> block — look for the closing </think>
            const endIdx = contentBuffer.indexOf('</think>');
            if (endIdx !== -1) {
              const reasoning = contentBuffer.slice(0, endIdx);
              if (reasoning) {
                yield { type: 'reasoning_delta', sessionId: '', data: { text: reasoning } };
              }
              inThinkBlock = false;
              contentBuffer = contentBuffer.slice(endIdx + 8); // len('</think>') === 8

              // Strip leading newline after </think> to avoid extra blank line
              if (contentBuffer.startsWith('\n')) {
                contentBuffer = contentBuffer.slice(1);
              } else if (contentBuffer.startsWith('\r\n')) {
                contentBuffer = contentBuffer.slice(2);
              }
            } else {
              // Check for partial </think> tag at the end of the buffer
              const lastLess = contentBuffer.lastIndexOf('<');
              if (lastLess !== -1 && '</think>'.startsWith(contentBuffer.slice(lastLess))) {
                const reasoning = contentBuffer.slice(0, lastLess);
                if (reasoning) {
                  yield { type: 'reasoning_delta', sessionId: '', data: { text: reasoning } };
                }
                contentBuffer = contentBuffer.slice(lastLess);
                break;
              } else {
                // No closing tag yet — emit everything as reasoning
                yield { type: 'reasoning_delta', sessionId: '', data: { text: contentBuffer } };
                contentBuffer = '';
              }
            }
          }
        }
      }

      // ------------------------------------------------------------------
      // 3. Tool call streaming
      // ------------------------------------------------------------------
      if (delta.tool_calls) {
        for (const tcDelta of delta.tool_calls) {
          const index = tcDelta.index ?? 0;

          if (tcDelta.id) {
            // New tool call starting
            toolCallsInProgress.set(index, {
              id: tcDelta.id,
              name: tcDelta.function?.name ?? '',
              arguments: tcDelta.function?.arguments ?? '',
            });

            yield {
              type: 'tool_call_start',
              sessionId: '',
              data: {
                toolCallDelta: tcDelta as unknown as ToolCallDelta,
              },
            };
          } else {
            // Continuation chunk — append to existing
            const existing = toolCallsInProgress.get(index);
            if (existing) {
              if (tcDelta.function?.name) existing.name += tcDelta.function.name;
              if (tcDelta.function?.arguments) existing.arguments += tcDelta.function.arguments;

              yield {
                type: 'tool_call_delta',
                sessionId: '',
                data: {
                  toolCallDelta: tcDelta as unknown as ToolCallDelta,
                },
              };
            }
          }
        }
      }

      // ------------------------------------------------------------------
      // 4. Finish reason — flush buffer, emit completed tool calls & stream_end
      // ------------------------------------------------------------------
      if (choice.finish_reason) {
        // Flush any remaining buffered content
        if (contentBuffer.length > 0) {
          if (inThinkBlock) {
            yield { type: 'reasoning_delta', sessionId: '', data: { text: contentBuffer } };
          } else {
            yield { type: 'text_delta', sessionId: '', data: { text: contentBuffer } };
          }
          contentBuffer = '';
        }

        // Emit each completed tool call
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
            finishReason: choice.finish_reason as StreamEvent['data']['finishReason'],
            usage: chunk.usage as unknown as Usage | undefined,
          },
        };
      }
    }
  }

  // --------------------------------------------------------------------------
  // Non-streaming completion
  // --------------------------------------------------------------------------

  /**
   * Make a non-streaming chat completion request.
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

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: options.model ?? this.model,
      messages: messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      stream: false,
    };

    if (options.temperature !== undefined) params.temperature = options.temperature;
    if (options.maxTokens !== undefined) params.max_tokens = options.maxTokens;
    if (options.topP !== undefined) params.top_p = options.topP;
    if (options.frequencyPenalty !== undefined) params.frequency_penalty = options.frequencyPenalty;
    if (options.presencePenalty !== undefined) params.presence_penalty = options.presencePenalty;
    if (options.stop !== undefined) params.stop = options.stop;

    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools.map(t => this.toAPITool(t));
      params.tool_choice = (options.toolChoice ?? 'auto') as OpenAI.Chat.Completions.ChatCompletionCreateParams['tool_choice'];
    }

    const result = await this.client.chat.completions.create(params, { signal });
    const choice = result.choices[0];

    return {
      content: choice.message.content,
      toolCalls: (choice.message.tool_calls ?? []) as unknown as ToolCall[],
      usage: result.usage as unknown as Usage,
      finishReason: choice.finish_reason,
    };
  }

  // --------------------------------------------------------------------------
  // Utility
  // --------------------------------------------------------------------------

  /**
   * Create a new client with updated config fields.
   */
  withConfig(updates: Partial<LLMClientConfig>): LLMClient {
    return new LLMClient({
      ...this._config,
      ...updates,
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an LLM client from agent config.
 */
export function createLLMClient(config: AgentConfig): LLMClient {
  return new LLMClient({
    apiKey: config.apiKey,
    apiBase: config.apiBase,
    model: config.model,
    timeoutMs: config.llmTimeoutMs,
  });
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Check if an error is a context length error.
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
