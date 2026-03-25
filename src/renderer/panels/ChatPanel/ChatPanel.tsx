/**
 * ChatPanel - Live dynamic chat interface
 * Renders messages, streaming text, and inline tool chips
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
  Globe,
  FilePlus,
  FileSearch,
} from 'lucide-react';
import './ChatPanel.css';

/**
 * Get icon for tool based on name
 */
function getToolIcon(toolName: string) {
  const iconMap: Record<string, React.ReactNode> = {
    webSearch: <Globe size={14} />,
    readFile: <FileText size={14} />,
    writeFile: <Pencil size={14} />,
    listDirectory: <FolderOpen size={14} />,
    createFile: <FilePlus size={14} />,
    deleteFile: <Trash2 size={14} />,
    searchInFiles: <FileSearch size={14} />,
    updateTaskProgress: <CheckCircle size={14} />,
    createArtifact: <FileText size={14} />,
    reportFileChanged: <FileText size={14} />,
  };
  return iconMap[toolName] || <FileText size={14} />;
}

/**
 * Get action verb for tool (Cursor/Windsurf style)
 */
function getToolAction(toolName: string): string {
  const actionMap: Record<string, string> = {
    webSearch: 'Searching',
    readFile: 'Reading',
    writeFile: 'Writing',
    listDirectory: 'Listing',
    createFile: 'Creating',
    deleteFile: 'Deleting',
    searchInFiles: 'Searching',
    updateTaskProgress: 'Updating',
    createArtifact: 'Creating artifact',
    reportFileChanged: 'Reporting',
  };
  return actionMap[toolName] || 'Running';
}

/**
 * Get file extension icon URL from VS Code CDN
 */
function getVSCodeIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseUrl = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@master/icons';

  const iconMap: Record<string, string> = {
    ts: 'file_type_typescript.svg',
    tsx: 'file_type_reactts.svg',
    js: 'file_type_js.svg',
    jsx: 'file_type_reactjs.svg',
    css: 'file_type_css.svg',
    html: 'file_type_html.svg',
    json: 'file_type_json.svg',
    md: 'file_type_markdown.svg',
    py: 'file_type_python.svg',
    rs: 'file_type_rust.svg',
    go: 'file_type_go.svg',
    java: 'file_type_java.svg',
    c: 'file_type_c.svg',
    cpp: 'file_type_cpp.svg',
    h: 'file_type_c.svg',
    svg: 'file_type_svg.svg',
    png: 'file_type_image.svg',
    jpg: 'file_type_image.svg',
    jpeg: 'file_type_image.svg',
    gif: 'file_type_image.svg',
    txt: 'file_type_text.svg',
    yml: 'file_type_yaml.svg',
    yaml: 'file_type_yaml.svg',
    xml: 'file_type_xml.svg',
    sh: 'file_type_shell.svg',
    bash: 'file_type_shell.svg',
  };

  const iconFile = iconMap[ext] || 'default_file.svg';
  return `${baseUrl}/${iconFile}`;
}

/**
 * Extract file info from tool arguments
 */
function extractFileInfo(toolName: string, args: Record<string, unknown>): {
  fileName?: string;
  details?: string;
} {
  if (toolName === 'readFile' || toolName === 'writeFile' || toolName === 'createFile' || toolName === 'deleteFile') {
    const filePath = args.filePath as string;
    if (filePath) {
      const fileName = filePath.split('/').pop() || filePath;
      return { fileName };
    }
  }

  if (toolName === 'webSearch') {
    const query = args.query as string;
    if (query) {
      return { details: `"${query}"` };
    }
  }

  if (toolName === 'listDirectory') {
    const dirPath = args.dirPath as string;
    return { details: dirPath || '.' };
  }

  if (toolName === 'searchInFiles') {
    const pattern = args.pattern as string;
    return { details: `"${pattern}"` };
  }

  return {};
}

/**
 * Inline tool chip component
 */
const InlineToolChip: React.FC<{ part: LivePart }> = ({ part }) => {
  const { toolCall } = part;
  if (!toolCall) return null;

  const action = getToolAction(toolCall.toolName);
  const icon = getToolIcon(toolCall.toolName);
  const { fileName, details } = extractFileInfo(toolCall.toolName, toolCall.args);
  const isRunning = toolCall.status === 'running';
  const isError = toolCall.status === 'error';

  return (
    <div className={`tool-chip ${toolCall.status}`}>
      <span className="tool-chip-icon">{isRunning ? <Loader size={14} className="spinning" /> : icon}</span>
      <span className="tool-chip-action">{action}</span>

      {fileName && (
        <>
          <img
            src={getVSCodeIcon(fileName)}
            alt=""
            className="file-type-icon"
          />
          <span className="tool-chip-file">{fileName}</span>
        </>
      )}

      {details && <span className="tool-chip-details">{details}</span>}

      {toolCall.status === 'completed' && <CheckCircle size={12} className="tool-chip-status" />}
      {isError && (
        <>
          <AlertCircle size={12} className="tool-chip-status" />
          {toolCall.error && <span className="tool-chip-error">{toolCall.error}</span>}
        </>
      )}
    </div>
  );
};

/**
 * Simple markdown renderer with better code block handling
 */
function renderMarkdown(text: string): string {
  return text
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
      const language = lang || 'plaintext';
      return `<pre class="code-block"><code class="language-${language}">${code.trim()}</code></pre>`;
    })
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
    // Tables
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.slice(1, -1).split('|').map(c => c.trim());
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    })
    // Checkboxes
    .replace(/^- \[x\] (.+)$/gm, '<div class="task-item done"><span class="checkbox checked"></span>$1</div>')
    .replace(/^- \[\/\] (.+)$/gm, '<div class="task-item in-progress"><span class="checkbox progress"></span>$1</div>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="task-item todo"><span class="checkbox"></span>$1</div>')
    // Lists
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // HR
    .replace(/^---$/gm, '<hr/>')
    // Paragraphs
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
        <div className="message-bubble">
          <div className="thinking-indicator">
            <span className="thinking-dot"></span>
            <span className="thinking-dot"></span>
            <span className="thinking-dot"></span>
          </div>
        </div>
      </div>
    );
  }

  // Separate text content and tool calls
  const textParts = liveParts.filter(p => p.type === 'text');
  const toolParts = liveParts.filter(p => p.type === 'tool-call');
  const textContent = textParts.map(p => p.content || '').join('');

  return (
    <div className="message-row assistant">
      <div className="message-bubble">
        {/* Show tool calls inline like Cursor/Windsurf */}
        {toolParts.length > 0 && (
          <div className="tool-chips-inline">
            {toolParts.map((part) => (
              <InlineToolChip key={part.id} part={part} />
            ))}
          </div>
        )}

        {/* Text content */}
        {textContent && (
          <div
            className="message-content markdown"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(textContent) }}
          />
        )}

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
                    <>
                      {/* Show tool calls if any (these persist after streaming ends) */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="tool-chips-inline">
                          {msg.toolCalls.map((tc) => (
                            <InlineToolChip
                              key={tc.id}
                              part={{ type: 'tool-call', id: tc.id, toolCall: tc, timestamp: msg.timestamp }}
                            />
                          ))}
                        </div>
                      )}
                      {/* Show text content */}
                      {msg.content && (
                        <div
                          className="message-content markdown"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                      )}
                    </>
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
