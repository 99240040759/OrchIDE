/**
 * InputBar component - Message input and agent controls
 * Uses proper event subscription with cleanup to prevent memory leaks
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Plus, Mic, ArrowRight, Square, Globe, Cpu } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from '../../store/chatStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAgentStore } from '../../store/agentStore';
import './InputBar.css';

const orchide = (window as any).orchide;

export const InputBar: React.FC = () => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get stable references to store state and actions
  const sessionId = useChatStore(state => state.sessionId);
  const isStreaming = useChatStore(state => state.isStreaming);
  const addMessage = useChatStore(state => state.addMessage);

  const activeWorkspace = useWorkspaceStore(state => state.activeWorkspace);
  const mode = useWorkspaceStore(state => state.mode);

  // Auto-resize textarea on value change
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [value]);

  // Set up auto-resize (moved from above since we removed the large effect)

  // Handle send message
  const handleSend = useCallback(async () => {
    const msg = value.trim();
    if (!msg || isStreaming) return;

    // Reset input
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Add user message to UI immediately
    const userMsg = {
      id: uuidv4(),
      role: 'user' as const,
      content: msg,
      timestamp: Date.now(),
    };
    addMessage(userMsg);

    // Send to agent
    try {
      await orchide?.agent.send({
        sessionId,
        message: msg,
        mode: mode as 'chat' | 'agentic',
        workspacePath: activeWorkspace?.path,
        workspaceName: activeWorkspace?.name,
      });
    } catch (error) {
      console.error('[InputBar] Failed to send message:', error);
    }
  }, [value, isStreaming, sessionId, mode, activeWorkspace, addMessage]);

  // Handle stop generation
  const handleStop = useCallback(async () => {
    if (orchide && sessionId) {
      await orchide.agent.cancel(sessionId);
    }
    useChatStore.getState().finalizeStream();
  }, [sessionId]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`input-container${isStreaming ? ' generating' : ''}`} onClick={() => textareaRef.current?.focus()}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          activeWorkspace
            ? `Ask the agent to work on ${activeWorkspace.name}... (Shift+Enter for newline)`
            : 'Ask anything, search the web, or explore ideas...'
        }
        className="main-input"
        rows={1}
        disabled={isStreaming}
      />
      <div className="input-actions">
        <button className="action-btn" title="Attach file">
          <Plus size={14} />
        </button>

        <button className="action-btn pill model-btn" title="Model: NVIDIA NIM">
          <Cpu size={13} /> NIM
        </button>

        {activeWorkspace && (
          <button className="action-btn pill web-btn" title="Web search active">
            <Globe size={13} /> Web
          </button>
        )}

        <div className="right-actions">
          <button className="action-btn" title="Voice input">
            <Mic size={14} />
          </button>
          {isStreaming ? (
            <button
              className="action-btn send-btn stop-btn"
              onClick={handleStop}
              title="Stop generation"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              className={`action-btn send-btn ${value.trim() ? 'active' : ''}`}
              onClick={handleSend}
              title="Send (Enter)"
              disabled={!value.trim()}
            >
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
