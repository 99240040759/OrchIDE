import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, Mic, ArrowRight, Square, Globe, Cpu } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from '../../store/chatStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAgentStore } from '../../store/agentStore';
import './InputBar.css';

type AgentMode = 'auto' | 'plan' | 'act';

const orchide = (window as any).orchide;

export const InputBar = () => {
  const [value, setValue] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>('auto');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { sessionId, isStreaming, startStreaming, appendStreamChunk, finalizeStream, addMessage } = useChatStore();
  const { activeWorkspace, mode } = useWorkspaceStore();
  const { updateTaskMd, addArtifact, addFileChange } = useAgentStore();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [value]);

  // Setup IPC listeners once
  useEffect(() => {
    if (!orchide) return;

    orchide.agent.onStreamStart(() => startStreaming());
    orchide.agent.onStreamChunk(({ chunk }: any) => appendStreamChunk(chunk));
    orchide.agent.onStreamEnd(() => finalizeStream());
    orchide.agent.onStreamError(({ error }: any) => {
      finalizeStream();
      console.error('Agent error:', error);
    });
    orchide.agent.onTaskUpdate(({ checklistMd }: any) => updateTaskMd(checklistMd));
    orchide.agent.onArtifactCreated(({ artifact }: any) => {
      addArtifact({ ...artifact, sessionId: artifact.session_id || artifact.sessionId });
    });
    orchide.agent.onFileChanged(({ change }: any) => {
      addFileChange({ id: change.id, filePath: change.filePath, status: change.status });
    });

    return () => orchide.agent.removeAllListeners();
  }, []);

  const handleSend = useCallback(async () => {
    const msg = value.trim();
    if (!msg || isStreaming) return;

    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Add user message to UI immediately
    const userMsg = {
      id: uuidv4(), role: 'user' as const, content: msg, timestamp: Date.now(),
    };
    addMessage(userMsg);

    // Send to agent
    await orchide?.agent.send({
      sessionId,
      message: msg,
      mode: mode as 'chat' | 'agentic',
      workspacePath: activeWorkspace?.path,
      workspaceName: activeWorkspace?.name,
    });
  }, [value, isStreaming, sessionId, mode, activeWorkspace]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const modeLabels: Record<AgentMode, string> = {
    auto: 'Auto', plan: 'Planning', act: 'Act',
  };

  return (
    <div className="input-container" onClick={() => textareaRef.current?.focus()}>
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
        <button className="action-btn" title="Attach file"><Plus size={14} /></button>

        <div className="mode-selector-wrapper">
          <button
            className="action-btn pill"
            onClick={(e) => { e.stopPropagation(); setShowModeMenu(!showModeMenu); }}
          >
            <ChevronDown size={13} /> {modeLabels[agentMode]}
          </button>
          {showModeMenu && (
            <div className="mode-menu" onClick={e => e.stopPropagation()}>
              {(Object.entries(modeLabels) as [AgentMode, string][]).map(([k, v]) => (
                <button
                  key={k}
                  className={`mode-option ${agentMode === k ? 'active' : ''}`}
                  onClick={() => { setAgentMode(k); setShowModeMenu(false); }}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>

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
            <button className="action-btn send-btn stop-btn" onClick={() => finalizeStream()} title="Stop generation">
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
