/**
 * Chat store - manages chat messages and live streaming state
 * Handles text streaming, tool calls, tool results, and thinking in real-time
 */

import { create } from 'zustand';
import type { Message, ToolCallEvent, StreamEvent } from '../../shared/types';

// Re-export for convenience
export type { Message, ToolCallEvent };

// ============================================================================
// Live Stream Part Types
// ============================================================================

export type LivePartType = 'text' | 'tool-call' | 'tool-result';

export interface LivePart {
  id: string;
  type: LivePartType;
  content?: string;
  toolCall?: ToolCallEvent;
  timestamp: number;
}

// ============================================================================
// Store State
// ============================================================================

interface ChatState {
  sessionId: string;
  messages: Message[];
  isStreaming: boolean;

  // Live streaming state - array of parts being built in real-time
  liveParts: LivePart[];

  // Legacy compatibility
  streamingContent: string;

  // Actions
  setSessionId: (id: string) => void;
  addMessage: (msg: Message) => void;
  setMessages: (msgs: Message[]) => void;
  startStreaming: () => void;
  finalizeStream: () => void;
  clearMessages: () => void;

  // Live streaming actions
  appendText: (text: string) => void;
  addToolCall: (toolCall: ToolCallEvent) => void;
  updateToolCall: (toolCall: ToolCallEvent) => void;
  handleStreamEvent: (event: StreamEvent) => void;

  // Legacy compatibility
  appendStreamChunk: (chunk: string) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: '',
  messages: [],
  isStreaming: false,
  liveParts: [],
  streamingContent: '',

  setSessionId: (id) => set({ sessionId: id }),

  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),

  setMessages: (msgs) => set({ messages: msgs }),

  startStreaming: () => set({
    isStreaming: true,
    liveParts: [],
    streamingContent: '',
  }),

  appendText: (text) => {
    set((state) => {
      const parts = [...state.liveParts];
      const lastPart = parts[parts.length - 1];

      // Append to existing text part or create new one
      if (lastPart && lastPart.type === 'text') {
        parts[parts.length - 1] = {
          ...lastPart,
          content: (lastPart.content || '') + text,
        };
      } else {
        parts.push({
          id: `text-${Date.now()}`,
          type: 'text',
          content: text,
          timestamp: Date.now(),
        });
      }

      return {
        liveParts: parts,
        streamingContent: state.streamingContent + text,
      };
    });
  },

  addToolCall: (toolCall) => {
    set((state) => ({
      liveParts: [
        ...state.liveParts,
        {
          id: toolCall.id,
          type: 'tool-call',
          toolCall,
          timestamp: Date.now(),
        },
      ],
    }));
  },

  updateToolCall: (toolCall) => {
    set((state) => {
      const parts = state.liveParts.map((part) => {
        if (part.type === 'tool-call' && part.toolCall?.id === toolCall.id) {
          return { ...part, toolCall };
        }
        return part;
      });
      return { liveParts: parts };
    });
  },

  handleStreamEvent: (event) => {
    const { type, data } = event;
    const state = get();

    switch (type) {
      case 'text-delta':
        if (data.text) {
          state.appendText(data.text);
        }
        break;

      case 'tool-call-start':
        if (data.toolCall) {
          state.addToolCall(data.toolCall);
        }
        break;

      case 'tool-result':
        if (data.toolCall) {
          state.updateToolCall(data.toolCall);
        }
        break;

      case 'step-finish':
      case 'finish':
        // These are informational, no action needed
        break;
    }
  },

  finalizeStream: () => {
    const { streamingContent, messages, liveParts } = get();

    // Only create message if there's actual content (text or tool calls)
    const hasContent = streamingContent.trim() || liveParts.some(p => p.type === 'tool-call');

    if (hasContent) {
      // Build final message content
      // For now, just use the text content; tool calls are shown inline during streaming
      const finalMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: streamingContent || '[Tool execution completed]',
        timestamp: Date.now(),
      };

      set({
        messages: [...messages, finalMsg],
        isStreaming: false,
        liveParts: [],
        streamingContent: '',
      });
    } else {
      set({
        isStreaming: false,
        liveParts: [],
        streamingContent: '',
      });
    }
  },

  // Legacy compatibility
  appendStreamChunk: (chunk) => {
    get().appendText(chunk);
  },

  clearMessages: () => set({
    messages: [],
    liveParts: [],
    streamingContent: '',
    isStreaming: false,
  }),
}));
