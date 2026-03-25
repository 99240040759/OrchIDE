/**
 * Chat store - manages chat messages and streaming state
 * Uses Zustand for state management
 */

import { create } from 'zustand';
import type { Message } from '../../shared/types';

// Re-export Message type for convenience
export type { Message };

interface ChatState {
  sessionId: string;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;

  // Actions
  setSessionId: (id: string) => void;
  addMessage: (msg: Message) => void;
  setMessages: (msgs: Message[]) => void;
  startStreaming: () => void;
  appendStreamChunk: (chunk: string) => void;
  finalizeStream: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: '',
  messages: [],
  isStreaming: false,
  streamingContent: '',

  setSessionId: (id) => set({ sessionId: id }),

  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),

  setMessages: (msgs) => set({ messages: msgs }),

  startStreaming: () => set({ isStreaming: true, streamingContent: '' }),

  appendStreamChunk: (chunk) => {
    set((state) => ({ streamingContent: state.streamingContent + chunk }));
  },

  finalizeStream: () => {
    const { streamingContent, messages } = get();

    if (streamingContent.trim()) {
      const finalMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: streamingContent,
        timestamp: Date.now(),
      };
      set({
        messages: [...messages, finalMsg],
        isStreaming: false,
        streamingContent: '',
      });
    } else {
      set({ isStreaming: false, streamingContent: '' });
    }
  },

  clearMessages: () => set({
    messages: [],
    streamingContent: '',
    isStreaming: false,
  }),
}));
