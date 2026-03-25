import React, { useEffect, useRef } from 'react';
import { Bot, User, Loader2 } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { InputBar } from '../InputBar/InputBar';
import './ChatPanel.css';

function renderMarkdown(text: string): string {
  // Simple markdown → HTML (no external dep)
  return text
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="code-block" data-lang="$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Checkboxes
    .replace(/^- \[x\] (.+)$/gm, '<div class="task-item done">✅ $1</div>')
    .replace(/^- \[\/\] (.+)$/gm, '<div class="task-item in-progress">🔄 $1</div>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="task-item todo">⬜ $1</div>')
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Numbered list items
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Newlines
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

export const ChatPanel = () => {
  const { messages, isStreaming, streamingContent, sessionId } = useChatStore();
  const { activeWorkspace } = useWorkspaceStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

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
              {!activeWorkspace && (
                <span className="footer-chip">🌐 Web Search</span>
              )}
              {activeWorkspace && (
                <>
                  <span className="footer-chip">🗂 File Operations</span>
                  <span className="footer-chip">🌐 Web Search</span>
                  <span className="footer-chip">📋 Task Tracking</span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="chatpanel-thread">
          <div className="thread-messages">
            {messages.map(msg => (
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

            {isStreaming && (
              <div className="message-row assistant">
                <div className="message-bubble streaming">
                  {streamingContent ? (
                    <div
                      className="message-content markdown"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
                    />
                  ) : (
                    <div className="thinking-shine">
                      Thinking
                    </div>
                  )}
                </div>
              </div>
            )}
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
