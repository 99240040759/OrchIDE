/**
 * Chat store - manages chat messages and live streaming state
 * Handles text streaming, thinking/reasoning, tool calls, and tool results in real-time
 */

import { create } from 'zustand';
import type { ToolCallEvent, StreamEvent } from '../../shared/types';
import { getOrchideAPI } from '../utils/orchide';

const orchide = getOrchideAPI();

// Re-export for convenience
export type { ToolCallEvent };

// Extended Message type with tool calls
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  timestamp: number;
  toolCalls?: ToolCallEvent[];
  parts?: LivePart[];
}

// ============================================================================
// Live Stream Part Types
// ============================================================================

export type LivePartType = 'text' | 'thinking' | 'tool-call';

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

  // Tracking for thinking state
  isThinking: boolean;

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
  appendThinking: (text: string) => void;
  addToolCall: (toolCall: ToolCallEvent) => void;
  updateToolCall: (toolCall: ToolCallEvent) => void;
  handleStreamEvent: (event: StreamEvent) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: '',
  messages: [],
  isStreaming: false,
  liveParts: [],
  isThinking: false,
  streamingContent: '',

  setSessionId: (id) => set({ sessionId: id }),

  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),

  setMessages: (msgs) => set({ messages: msgs }),

  startStreaming: () => set({
    isStreaming: true,
    liveParts: [],
    isThinking: false,
    streamingContent: '',
  }),

  appendThinking: (text) => {
    set((state) => {
      const parts = [...state.liveParts];
      const lastPart = parts[parts.length - 1];

      if (lastPart && lastPart.type === 'thinking') {
        parts[parts.length - 1] = {
          ...lastPart,
          content: (lastPart.content || '') + text,
        };
      } else {
        parts.push({
          id: `thinking-${Date.now()}`,
          type: 'thinking',
          content: text,
          timestamp: Date.now(),
        });
      }

      return { liveParts: parts, isThinking: true };
    });
  },

  appendText: (text) => {
    set((state) => {
      const parts = [...state.liveParts];
      const lastPart = parts[parts.length - 1];

      // If we were thinking, mark thinking as done
      const wasThinking = state.isThinking;

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
        isThinking: wasThinking ? false : state.isThinking,
      };
    });
  },

  addToolCall: (toolCall) => {
    set((state) => {
      const existingPart = state.liveParts.find(
        (part) => part.type === 'tool-call' && part.toolCall?.id === toolCall.id
      );

      if (existingPart) {
        const parts = state.liveParts.map((part) => {
          if (part.type === 'tool-call' && part.toolCall?.id === toolCall.id) {
            return { ...part, toolCall };
          }
          return part;
        });
        return { liveParts: parts, isThinking: false };
      } else {
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
          isThinking: false,
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
      case 'reasoning-delta':
        if (data.text) {
          state.appendThinking(data.text);
        }
        break;

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
        break;
    }
  },

  finalizeStream: () => {
    const { streamingContent, messages, liveParts } = get();

    const toolCalls = liveParts
      .filter(p => p.type === 'tool-call' && p.toolCall)
      .map(p => p.toolCall!);

    const thinkingContent = liveParts
      .filter(p => p.type === 'thinking' && p.content)
      .map(p => p.content!)
      .join('');

    // If the model wrapped its ENTIRE response in <think> tags, streamingContent
    // will be empty but thinkingContent will have all the text. In this case,
    // promote the thinking content to be the actual message so it renders normally
    // instead of being buried in a collapsed "Thought process" block.
    const hasNoTextButOnlyThinking =
      !streamingContent.trim() && toolCalls.length === 0 && thinkingContent.trim();

    const effectiveContent = hasNoTextButOnlyThinking ? thinkingContent : streamingContent;
    const effectiveThinking = hasNoTextButOnlyThinking ? undefined : (thinkingContent || undefined);

    // Also fix the liveParts so the live render matches the final message
    const finalizedParts: LivePart[] = hasNoTextButOnlyThinking
      ? [{
          id: `text-promoted-${Date.now()}`,
          type: 'text',
          content: thinkingContent,
          timestamp: Date.now(),
        }]
      : liveParts.map((part) => ({
          ...part,
          toolCall: part.toolCall
            ? {
                ...part.toolCall,
                args: { ...(part.toolCall.args || {}) },
              }
            : undefined,
        }));

    const hasContent = effectiveContent.trim() || toolCalls.length > 0 || thinkingContent.trim();

    if (hasContent) {
      const finalMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: effectiveContent,
        thinking: effectiveThinking,
        timestamp: Date.now(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        parts: finalizedParts.length > 0 ? finalizedParts : undefined,
      };

      set({
        messages: [...messages, finalMsg],
        isStreaming: false,
        liveParts: [],
        isThinking: false,
        streamingContent: '',
      });
      
      // Update DB with tool_calls and parts since agent.ts only writes raw content initially
      if (orchide) {
        orchide.history.updateMessageExtras(
          get().sessionId,
          finalMsg.toolCalls ? JSON.stringify(finalMsg.toolCalls) : null,
          finalMsg.parts ? JSON.stringify(finalMsg.parts) : null
        ).catch(err => console.error('[chatStore] Failed to update message extras', err));
      }
    } else {
      set({
        isStreaming: false,
        liveParts: [],
        isThinking: false,
        streamingContent: '',
      });
    }
  },

  clearMessages: () => set({
    messages: [],
    liveParts: [],
    isThinking: false,
    streamingContent: '',
    isStreaming: false,
  }),
}));
