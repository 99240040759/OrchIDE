/**
 * Chat store - manages chat messages and live streaming state
 * Handles text streaming, tool calls, tool results, and thinking in real-time
 */

import { create } from 'zustand';
import type { ToolCallEvent, StreamEvent } from '../../shared/types';

// Re-export for convenience
export type { ToolCallEvent };

// Extended Message type with tool calls
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallEvent[]; // Store tool calls with the message
  parts?: LivePart[];
}

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
    set((state) => {
      // Check if this tool call already exists (prevent duplicates)
      const existingPart = state.liveParts.find(
        (part) => part.type === 'tool-call' && part.toolCall?.id === toolCall.id
      );

      if (existingPart) {
        // Update existing tool call instead of adding duplicate
        const parts = state.liveParts.map((part) => {
          if (part.type === 'tool-call' && part.toolCall?.id === toolCall.id) {
            return { ...part, toolCall };
          }
          return part;
        });
        return { liveParts: parts };
      } else {
        // Add new tool call
        return {
          liveParts: [
            ...state.liveParts,
            {
              id: toolCall.id,
              type: 'tool-call',
              toolCall,
              timestamp: Date.now(),
            },
          ],
        };
      }
    });
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

    // Extract tool calls from live parts
    const toolCalls = liveParts
      .filter(p => p.type === 'tool-call' && p.toolCall)
      .map(p => p.toolCall!);

    const finalizedParts: LivePart[] = liveParts.map((part) => ({
      ...part,
      toolCall: part.toolCall
        ? {
            ...part.toolCall,
            args: { ...(part.toolCall.args || {}) },
          }
        : undefined,
    }));

    // Create message if there's content OR tool calls (to persist tool calls)
    const hasContent = streamingContent.trim() || toolCalls.length > 0;

    if (hasContent) {
      const finalMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: streamingContent,
        timestamp: Date.now(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        parts: finalizedParts.length > 0 ? finalizedParts : undefined,
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
