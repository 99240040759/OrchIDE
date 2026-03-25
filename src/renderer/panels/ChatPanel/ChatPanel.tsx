/**
 * ChatPanel - Live dynamic chat interface
 * Renders messages, streaming text, and tool calls in real-time
 */

import React, { useEffect, useRef } from 'react';
import { useChatStore, LivePart } from '../../store/chatStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { InputBar } from '../InputBar/InputBar';
import {
  Search,
  FileText,
  FolderOpen,
  Pencil,
  Trash2,
  CheckCircle,
  Loader,
  AlertCircle,
  Wrench,
} from 'lucide-react';
import './ChatPanel.css';

/**
 * Get icon for tool based on name
 */
function getToolIcon(toolName: string) {
  const iconMap: Record<string, React.ReactNode> = {
    webSearch: <Search size={14} />,
    readFile: <FileText size={14} />,
    writeFile: <Pencil size={14} />,
    listDirectory: <FolderOpen size={14} />,
    createFile: <FileText size={14} />,
    deleteFile: <Trash2 size={14} />,
    searchInFiles: <Search size={14} />,
    updateTaskProgress: <CheckCircle size={14} />,
    createArtifact: <FileText size={14} />,
    reportFileChanged: <FileText size={14} />,
  };
  return iconMap[toolName] || <Wrench size={14} />;
}

/**
 * Format tool name for display
 */
function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Render tool arguments in a readable format
 */
function formatToolArgs(args: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return '';

  const entries = Object.entries(args);
  if (entries.length === 1) {
    const [key, value] = entries[0];
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    // Truncate long values
    return strVal.length > 60 ? strVal.slice(0, 60) + '...' : strVal;
  }

  return entries
    .slice(0, 2)
    .map(([k, v]) => {
      const strVal = typeof v === 'string' ? v : JSON.stringify(v);
      const truncated = strVal.length > 30 ? strVal.slice(0, 30) + '...' : strVal;
      return `${k}: ${truncated}`;
    })
    .join(', ');
}

/**
 * Tool call card component
 */
const ToolCallCard: React.FC<{ part: LivePart }> = ({ part }) => {
  const { toolCall } = part;
  if (!toolCall) return null;

  const statusClass = toolCall.status;
  const icon = getToolIcon(toolCall.toolName);

  return (
    <div className={`tool-call-card ${statusClass}`}>
      <div className="tool-call-header">
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{formatToolName(toolCall.toolName)}</span>
        <span className="tool-status">
          {toolCall.status === 'running' && <Loader size={12} className="spinning" />}
          {toolCall.status === 'completed' && <CheckCircle size={12} />}
          {toolCall.status === 'error' && <AlertCircle size={12} />}
        </span>
      </div>
      {toolCall.args && Object.keys(toolCall.args).length > 0 && (
        <div className="tool-call-args">{formatToolArgs(toolCall.args)}</div>
      )}
      {toolCall.status === 'completed' && toolCall.result && (
        <div className="tool-call-result">
          {typeof toolCall.result === 'string'
            ? toolCall.result.slice(0, 200) + (toolCall.result.length > 200 ? '...' : '')
            : JSON.stringify(toolCall.result).slice(0, 200)}
        </div>
      )}
      {toolCall.status === 'error' && toolCall.error && (
        <div className="tool-call-error">{toolCall.error}</div>
      )}
    </div>
  );
};

/**
 * Simple markdown renderer
 */
function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="code-block" data-lang="$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- \[x\] (.+)$/gm, '<div class="task-item done">$1</div>')
    .replace(/^- \[\/\] (.+)$/gm, '<div class="task-item in-progress">$1</div>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="task-item todo">$1</div>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

/**
 * Live streaming content component
 */
const LiveStreamContent: React.FC = () => {
  const liveParts = useChatStore((state) => state.liveParts);
  const isStreaming = useChatStore((state) => state.isStreaming);

  if (!isStreaming) return null;

  // If no parts yet, show thinking indicator
  if (liveParts.length === 0) {
    return (
      <div className="message-row assistant">
        <div className="message-bubble streaming">
          <div className="thinking-indicator">
            <span className="thinking-dot"></span>
            <span className="thinking-dot"></span>
            <span className="thinking-dot"></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message-row assistant">
      <div className="message-bubble streaming live-content">
        {liveParts.map((part) => {
          if (part.type === 'text' && part.content) {
            return (
              <div
                key={part.id}
                className="message-content markdown"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(part.content) }}
              />
            );
          }
          if (part.type === 'tool-call') {
            return <ToolCallCard key={part.id} part={part} />;
          }
          return null;
        })}
        <span className="cursor-blink">|</span>
      </div>
    </div>
  );
};

/**
 * Main ChatPanel component
 */
export const ChatPanel: React.FC = () => {
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const liveParts = useChatStore((state) => state.liveParts);
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveParts, isStreaming]);

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="chatpanel-container">
      {isEmpty ? (
        <div className="chatpanel-home">
          <div className="chatpanel-content">
            <div className="orch-logo-mark">✦</div>
            <h1 className="chatpanel-title">
              {activeWorkspace ? (
                <>
                  <span className="workspace-label">Workspace:</span>{' '}
                  <span className="workspace-name">{activeWorkspace.name}</span>
                </>
              ) : (
                'What can I help you with?'
              )}
            </h1>
            {activeWorkspace && (
              <p className="workspace-hint">
                Agentic mode — I can read, write, and manage files in your workspace.
              </p>
            )}
            <InputBar />
            <div className="footer-links">
              {!activeWorkspace && <span className="footer-chip">Web Search</span>}
              {activeWorkspace && (
                <>
                  <span className="footer-chip">File Operations</span>
                  <span className="footer-chip">Web Search</span>
                  <span className="footer-chip">Task Tracking</span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="chatpanel-thread">
          <div className="thread-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message-row ${msg.role}`}>
                <div className="message-bubble">
                  {msg.role === 'assistant' ? (
                    <div
                      className="message-content markdown"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : (
                    <div className="message-content">{msg.content}</div>
                  )}
                </div>
              </div>
            ))}

            <LiveStreamContent />

            <div ref={bottomRef} />
          </div>
          <div className="thread-input-area">
            <InputBar />
          </div>
        </div>
      )}
    </div>
  );
};
