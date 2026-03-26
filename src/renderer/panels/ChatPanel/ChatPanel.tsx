/**
 * ChatPanel - Live dynamic chat interface
 * Renders messages, streaming text, and inline tool chips
 */

import React, { useEffect, useRef } from 'react';
import { useChatStore, LivePart } from '../../store/chatStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { InputBar } from '../InputBar/InputBar';
import {
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
  Terminal,
  Link,
  ClipboardList,
  ListChecks,
} from 'lucide-react';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import './ChatPanel.css';

type TimelineGroup =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'tools'; key: string; tools: LivePart[] };

const KNOWN_TOOL_NAMES = new Set([
  'webSearch',
  'readFile',
  'writeFile',
  'listDirectory',
  'createFile',
  'deleteFile',
  'searchInFiles',
  'grepSearch',
  'globSearch',
  'runTerminalCommand',
  'fetchUrl',
  'updateTaskProgress',
  'createArtifact',
  'reportFileChanged',
  'createPlan',
  'updatePlanStep',
]);

function updateBraceDepth(input: string, initialDepth: number): number {
  let depth = initialDepth;
  for (const ch of input) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
  }
  return depth;
}

function collectJsonBlock(lines: string[], startLine: number, initialText: string): { endLine: number; jsonText: string } | null {
  let text = initialText;
  let depth = updateBraceDepth(initialText, 0);
  let cursor = startLine;

  while (depth > 0 && cursor + 1 < lines.length) {
    cursor += 1;
    text += `\n${lines[cursor]}`;
    depth = updateBraceDepth(lines[cursor], depth);
  }

  if (depth !== 0) return null;
  return { endLine: cursor, jsonText: text };
}

function isValidJsonObject(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

function stripRawToolCallArtifacts(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trimStart();
    const toolMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);

    if (!toolMatch) {
      kept.push(rawLine);
      continue;
    }

    const [, toolName, remainderRaw] = toolMatch;
    if (!KNOWN_TOOL_NAMES.has(toolName)) {
      kept.push(rawLine);
      continue;
    }

    const remainder = remainderRaw.trim();

    if (remainder.startsWith('{')) {
      const block = collectJsonBlock(lines, i, remainder);
      if (block && isValidJsonObject(block.jsonText)) {
        i = block.endLine;
        continue;
      }
    }

    if (!remainder && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim();
      if (nextTrimmed.startsWith('{')) {
        const block = collectJsonBlock(lines, i + 1, nextTrimmed);
        if (block && isValidJsonObject(block.jsonText)) {
          i = block.endLine;
          continue;
        }
      }
    }

    kept.push(rawLine);
  }

  return kept.join('\n');
}

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
    grepSearch: <FileSearch size={14} />,
    globSearch: <FolderOpen size={14} />,
    runTerminalCommand: <Terminal size={14} />,
    fetchUrl: <Link size={14} />,
    updateTaskProgress: <CheckCircle size={14} />,
    createArtifact: <FileText size={14} />,
    reportFileChanged: <FileText size={14} />,
    createPlan: <ClipboardList size={14} />,
    updatePlanStep: <ListChecks size={14} />,
  };
  return iconMap[toolName] || <FileText size={14} />;
}

/**
 * Get action verb for tool (past tense when completed)
 */
function getToolAction(toolName: string, completed = false): string {
  const actionMap: Record<string, { running: string; completed: string }> = {
    webSearch: { running: 'Searching', completed: 'Searched' },
    readFile: { running: 'Reading', completed: 'Read' },
    writeFile: { running: 'Writing', completed: 'Wrote' },
    listDirectory: { running: 'Listing', completed: 'Listed' },
    createFile: { running: 'Creating', completed: 'Created' },
    deleteFile: { running: 'Deleting', completed: 'Deleted' },
    searchInFiles: { running: 'Searching', completed: 'Searched' },
    grepSearch: { running: 'Searching', completed: 'Searched' },
    globSearch: { running: 'Finding', completed: 'Found' },
    runTerminalCommand: { running: 'Running', completed: 'Ran' },
    fetchUrl: { running: 'Fetching', completed: 'Fetched' },
    updateTaskProgress: { running: 'Updating', completed: 'Updated' },
    createArtifact: { running: 'Creating', completed: 'Created' },
    reportFileChanged: { running: 'Reporting', completed: 'Reported' },
    createPlan: { running: 'Creating plan', completed: 'Created plan' },
    updatePlanStep: { running: 'Updating step', completed: 'Updated step' },
  };
  
  const actions = actionMap[toolName] || { running: 'Running', completed: 'Ran' };
  return completed ? actions.completed : actions.running;
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
    const filePath = (args.filePath || args.targetPath) as string;
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

  if (toolName === 'searchInFiles' || toolName === 'grepSearch') {
    const pattern = args.pattern as string;
    return { details: `"${pattern}"` };
  }

  if (toolName === 'globSearch') {
    const pattern = args.pattern as string;
    return { details: pattern };
  }

  if (toolName === 'runTerminalCommand') {
    const command = args.command as string;
    if (command) {
      const shortCmd = command.length > 40 ? command.slice(0, 40) + '...' : command;
      return { details: `$ ${shortCmd}` };
    }
  }

  if (toolName === 'fetchUrl') {
    const url = args.url as string;
    if (url) {
      try {
        const parsed = new URL(url);
        return { details: parsed.hostname };
      } catch {
        return { details: url.slice(0, 30) };
      }
    }
  }

  if (toolName === 'updateTaskProgress') {
    const title = args.title as string;
    if (title) {
      return { details: `Task: ${title}` };
    }
    return { details: 'Task progress' };
  }

  if (toolName === 'createArtifact') {
    const artifactName = args.name as string;
    const filePath = args.filename as string;
    const fileName = filePath ? filePath.split('/').pop() || filePath : undefined;

    if (artifactName && fileName) {
      return { fileName, details: artifactName };
    }

    if (artifactName) {
      return { details: artifactName };
    }

    if (fileName) {
      return { fileName };
    }

    return { details: 'Artifact' };
  }

  if (toolName === 'reportFileChanged') {
    const filePath = (args.filePath || args.targetPath) as string;
    const status = args.status as string;
    const fileName = filePath ? filePath.split('/').pop() || filePath : undefined;

    if (fileName && status) {
      return { fileName, details: status };
    }

    if (fileName) {
      return { fileName };
    }

    if (status) {
      return { details: status };
    }
  }

  if (toolName === 'createPlan') {
    const title = args.title as string;
    return { details: title || 'Implementation plan' };
  }

  if (toolName === 'updatePlanStep') {
    const stepId = args.stepId as string;
    const status = args.status as string;
    return { details: `${stepId}: ${status}` };
  }

  return {};
}

/**
 * Inline tool chip component
 */
const InlineToolChip: React.FC<{ part: LivePart }> = ({ part }) => {
  const { toolCall } = part;
  if (!toolCall) return null;

  const isCompleted = toolCall.status === 'completed';
  const action = getToolAction(toolCall.toolName, isCompleted);
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

function buildTimelineGroups(parts: LivePart[], keyPrefix: string): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  let pendingWhitespace = '';

  for (const part of parts) {
    if (part.type === 'text' && part.content) {
      const chunk = part.content;
      const last = groups[groups.length - 1];

      if (last?.kind === 'text') {
        last.text += chunk;
      } else {
        if (!/\S/.test(chunk)) {
          pendingWhitespace += chunk;
          continue;
        }

        groups.push({
          kind: 'text',
          key: `${keyPrefix}-text-${part.id}`,
          text: `${pendingWhitespace}${chunk}`,
        });
        pendingWhitespace = '';
      }
      continue;
    }

    if (part.type === 'tool-call' && part.toolCall) {
      // Discard isolated whitespace if a tool block follows.
      pendingWhitespace = '';
      const last = groups[groups.length - 1];
      if (last?.kind === 'tools') {
        last.tools.push(part);
      } else {
        groups.push({
          kind: 'tools',
          key: `${keyPrefix}-tools-${part.id}`,
          tools: [part],
        });
      }
    }
  }

  return groups;
}

const PartsTimeline: React.FC<{ parts: LivePart[]; keyPrefix: string }> = ({ parts, keyPrefix }) => {
  const groups = buildTimelineGroups(parts, keyPrefix);

  return (
    <>
      {groups.map((group) => {
        if (group.kind === 'tools') {
          return (
            <div key={group.key} className="message-part-group tool-chips-inline">
              {group.tools.map((part) => (
                <InlineToolChip key={part.id} part={part} />
              ))}
            </div>
          );
        }

        const cleanedText = stripRawToolCallArtifacts(group.text);
        if (!cleanedText.trim()) {
          return null;
        }

        return (
          <MarkdownRenderer
            key={group.key}
            content={cleanedText}
            className="message-part-group message-content markdown"
          />
        );
      })}
    </>
  );
};

/**
 * Live streaming content component  
 * Renders parts in chronological order (text + tools interleaved)
 */
const LiveStreamContent: React.FC = () => {
  const liveParts = useChatStore((state) => state.liveParts);
  const isStreaming = useChatStore((state) => state.isStreaming);

  if (!isStreaming) return null;

  // If no parts yet, show shining "Thinking..." indicator
  if (liveParts.length === 0) {
    return (
      <div className="message-row assistant">
        <div className="message-bubble">
          <div className="thinking-container">
            <span className="thinking-text">Thinking...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message-row assistant">
      <div className="message-bubble">
        <PartsTimeline parts={liveParts} keyPrefix="live" />
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
  const streamingContent = useChatStore((state) => state.streamingContent);
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);

  const threadMessagesRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Track whether user is near the bottom; if not, don't yank scroll while reading.
  useEffect(() => {
    const container = threadMessagesRef.current;
    if (!container) return;

    const onScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < 96;
    };

    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll on new content, but avoid smooth animation during token streaming.
  useEffect(() => {
    const container = threadMessagesRef.current;
    if (!container || !shouldAutoScrollRef.current) return;

    const behavior: ScrollBehavior = isStreaming ? 'auto' : 'smooth';
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    });
  }, [messages.length, liveParts.length, streamingContent, isStreaming]);

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
          <div className="thread-messages" ref={threadMessagesRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`message-row ${msg.role}`}>
                <div className="message-bubble">
                  {msg.role === 'assistant' ? (
                    <>
                      {msg.parts && msg.parts.length > 0 ? (
                        <PartsTimeline parts={msg.parts} keyPrefix={`msg-${msg.id}`} />
                      ) : (
                        <>
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
                          {msg.content && (
                            <MarkdownRenderer
                              content={stripRawToolCallArtifacts(msg.content)}
                              className="message-content markdown"
                            />
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="message-content">{msg.content}</div>
                  )}
                </div>
              </div>
            ))}

            <LiveStreamContent />
          </div>

          <div className="thread-input-area">
            <InputBar />
          </div>
        </div>
      )}
    </div>
  );
};
