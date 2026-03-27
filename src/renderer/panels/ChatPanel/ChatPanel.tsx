/**
 * ChatPanel - Live dynamic chat interface
 * Renders messages, streaming text, thinking dropdown, and inline tool chips
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  ChevronDown,
  ChevronRight,
  Brain,
  Replace,
  Layers,
  Send,
  Eye,
  PlayCircle,
  Activity,
  Bell,
} from 'lucide-react';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import './ChatPanel.css';

type TimelineGroup =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'thinking'; key: string; text: string }
  | { kind: 'tools'; key: string; tools: LivePart[] };

/**
 * Unified tool configuration - single source of truth for tool metadata
 */
const TOOL_CONFIG: Record<string, { icon: React.FC<{ size: number }>; running: string; completed: string }> = {
  webSearch: { icon: Globe, running: 'Searching', completed: 'Searched' },
  readFile: { icon: FileText, running: 'Reading', completed: 'Read' },
  writeFile: { icon: Pencil, running: 'Writing', completed: 'Wrote' },
  listDirectory: { icon: FolderOpen, running: 'Listing', completed: 'Listed' },
  createFile: { icon: FilePlus, running: 'Creating', completed: 'Created' },
  deleteFile: { icon: Trash2, running: 'Deleting', completed: 'Deleted' },
  searchInFiles: { icon: FileSearch, running: 'Searching', completed: 'Searched' },
  grepSearch: { icon: FileSearch, running: 'Searching', completed: 'Searched' },
  globSearch: { icon: FolderOpen, running: 'Finding', completed: 'Found' },
  runTerminalCommand: { icon: Terminal, running: 'Running', completed: 'Ran' },
  fetchUrl: { icon: Link, running: 'Fetching', completed: 'Fetched' },
  updateTaskProgress: { icon: CheckCircle, running: 'Updating', completed: 'Updated' },
  createArtifact: { icon: FileText, running: 'Creating', completed: 'Created' },
  replaceFileContent: { icon: Replace, running: 'Editing', completed: 'Edited' },
  multiReplaceFileContent: { icon: Layers, running: 'Editing', completed: 'Edited' },
  startTerminalCommand: { icon: PlayCircle, running: 'Starting', completed: 'Started' },
  getCommandStatus: { icon: Activity, running: 'Checking', completed: 'Checked' },
  sendCommandInput: { icon: Send, running: 'Sending', completed: 'Sent' },
  taskBoundary: { icon: Eye, running: 'Setting task', completed: 'Set task' },
  notifyUser: { icon: Bell, running: 'Notifying', completed: 'Notified' },
};

const KNOWN_TOOL_NAMES = new Set(Object.keys(TOOL_CONFIG));

function updateBraceDepth(input: string, initialDepth: number): number {
  let depth = initialDepth;
  for (const ch of input) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
  }
  return depth;
}

function collectJsonBlock(lines: string[], startLine: number, initialText: string): { endLine: number; jsonText: string; depth: number } {
  let text = initialText;
  let depth = updateBraceDepth(initialText, 0);
  let cursor = startLine;

  while (depth > 0 && cursor + 1 < lines.length) {
    cursor += 1;
    text += `\n${lines[cursor]}`;
    depth = updateBraceDepth(lines[cursor], depth);
  }

  return { endLine: cursor, jsonText: text, depth };
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
      if ((block.depth === 0 && isValidJsonObject(block.jsonText)) || block.depth > 0) {
        i = block.endLine;
        continue;
      }
    }

    if (!remainder && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim();
      if (nextTrimmed.startsWith('{')) {
        const block = collectJsonBlock(lines, i + 1, nextTrimmed);
        if ((block.depth === 0 && isValidJsonObject(block.jsonText)) || block.depth > 0) {
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
 * Get icon for tool based on name - uses unified TOOL_CONFIG
 */
function getToolIcon(toolName: string) {
  const config = TOOL_CONFIG[toolName];
  if (config) {
    const IconComponent = config.icon;
    return <IconComponent size={14} />;
  }
  return <FileText size={14} />;
}

/**
 * Get action verb for tool (past tense when completed) - uses unified TOOL_CONFIG
 */
function getToolAction(toolName: string, completed = false): string {
  const config = TOOL_CONFIG[toolName];
  if (config) {
    return completed ? config.completed : config.running;
  }
  return completed ? 'Ran' : 'Running';
}

/**
 * Extract file info from tool arguments
 */
function extractFileInfo(toolName: string, args: Record<string, unknown>): {
  fileName?: string;
  details?: string;
} {
  if (['readFile', 'writeFile', 'createFile', 'deleteFile', 'replaceFileContent', 'multiReplaceFileContent'].includes(toolName)) {
    const filePath = (args.filePath || args.targetPath || args.TargetFile) as string;
    if (filePath) {
      const fileName = filePath.split('/').pop() || filePath;
      return { fileName };
    }
  }

  if (toolName === 'webSearch') {
    const query = args.query as string;
    if (query) return { details: `"${query}"` };
  }

  if (toolName === 'listDirectory') {
    const dirPath = (args.dirPath || args.DirectoryPath) as string;
    return { details: dirPath || '.' };
  }

  if (toolName === 'searchInFiles' || toolName === 'grepSearch') {
    const pattern = (args.pattern || args.Query) as string;
    return { details: `"${pattern}"` };
  }

  if (toolName === 'globSearch') {
    const pattern = (args.pattern || args.Pattern) as string;
    return { details: pattern };
  }

  if (['runTerminalCommand', 'startTerminalCommand'].includes(toolName)) {
    const command = (args.command || args.CommandLine) as string;
    if (command) {
      const shortCmd = command.length > 40 ? command.slice(0, 40) + '...' : command;
      return { details: `$ ${shortCmd}` };
    }
  }

  if (toolName === 'getCommandStatus') {
    const cmdId = (args.commandId || args.CommandId) as string;
    if (cmdId) return { details: cmdId.slice(0, 12) };
  }

  if (toolName === 'sendCommandInput') {
    return { details: args.Terminate ? 'Terminate' : 'stdin' };
  }

  if (toolName === 'fetchUrl') {
    const url = (args.url || args.Url) as string;
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
    return { details: title || 'Task progress' };
  }

  if (toolName === 'createArtifact') {
    const artifactName = args.name as string;
    const filePath = args.filename as string;
    const fileName = filePath ? filePath.split('/').pop() || filePath : undefined;
    if (artifactName && fileName) return { fileName, details: artifactName };
    if (artifactName) return { details: artifactName };
    if (fileName) return { fileName };
    return { details: 'Artifact' };
  }

  if (toolName === 'taskBoundary') {
    const taskName = args.TaskName as string;
    const mode = args.Mode as string;
    if (taskName && mode) return { details: `${mode}: ${taskName}` };
    if (taskName) return { details: taskName };
    return { details: 'Task boundary' };
  }

  if (toolName === 'notifyUser') {
    const msg = args.Message as string;
    if (msg) return { details: msg.slice(0, 40) + (msg.length > 40 ? '...' : '') };
    return { details: 'User notification' };
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
        <span className="tool-chip-file">{fileName}</span>
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
 * Thinking/reasoning component (invisible block layout)
 */
const ThinkingBlock: React.FC<{ content: string; isLive?: boolean }> = ({ content, isLive }) => {
  const [isExpanded, setIsExpanded] = useState(!!isLive);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-expand when live
  useEffect(() => {
    if (isLive) setIsExpanded(true);
  }, [isLive]);

  // Auto-collapse when done
  useEffect(() => {
    if (!isLive && content) {
      const timer = setTimeout(() => setIsExpanded(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isLive, content]);

  // Auto-scroll to bottom of the thinking block when live
  useEffect(() => {
    if (isLive && isExpanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isLive, isExpanded]);

  if (!content) return null;

  return (
    <div className={`thinking-inline ${isLive ? 'live' : 'completed'} ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button className="thinking-inline-toggle" onClick={() => setIsExpanded(!isExpanded)}>
        <Brain size={12} className={isLive ? 'thinking-brain spinning' : 'thinking-brain'} />
        <span>{isLive ? 'Thinking...' : 'Thought process'}</span>
        {isExpanded ? <ChevronDown size={12} style={{marginLeft: 'auto', opacity: 0.5}}/> : <ChevronRight size={12} style={{marginLeft: 'auto', opacity: 0.5}}/>}
      </button>
      
      {isExpanded && (
        <div className="thinking-inline-content" ref={contentRef}>
          <MarkdownRenderer content={content} className="thinking-text-content" />
        </div>
      )}
    </div>
  );
};

function buildTimelineGroups(parts: LivePart[], keyPrefix: string): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  let pendingWhitespace = '';

  for (const part of parts) {
    if (part.type === 'thinking' && part.content) {
      const last = groups[groups.length - 1];
      if (last?.kind === 'thinking') {
        last.text += part.content;
      } else {
        groups.push({
          kind: 'thinking',
          key: `${keyPrefix}-thinking-${part.id}`,
          text: part.content,
        });
      }
      continue;
    }

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

const PartsTimeline: React.FC<{ parts: LivePart[]; keyPrefix: string; isLive?: boolean }> = ({ parts, keyPrefix, isLive }) => {
  // Memoize buildTimelineGroups to avoid expensive recalculation on every render
  const groups = useMemo(() => buildTimelineGroups(parts, keyPrefix), [parts, keyPrefix]);
  const isThinking = useChatStore(state => state.isThinking);

  return (
    <>
      {groups.map((group, index) => {
        if (group.kind === 'thinking') {
          const isLastGroup = index === groups.length - 1;
          return (
            <div key={group.key} className="message-part-group">
              <ThinkingBlock
                content={group.text}
                isLive={isLive && isThinking && isLastGroup}
              />
            </div>
          );
        }

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
 * Renders parts in chronological order (thinking → text → tools interleaved)
 */
const LiveStreamContent: React.FC = () => {
  const liveParts = useChatStore((state) => state.liveParts);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const isThinking = useChatStore((state) => state.isThinking);

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
        <PartsTimeline parts={liveParts} keyPrefix="live" isLive={true} />
        {/* Show cursor when actively streaming text (not just thinking) */}
        {isStreaming && !isThinking && liveParts.some(p => p.type === 'text') && (
          <span className="streaming-cursor" />
        )}
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
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);

  const threadMessagesRef = useRef<HTMLDivElement>(null);
  const innerContentRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Track whether user is near the bottom
  useEffect(() => {
    const container = threadMessagesRef.current;
    if (!container) return;

    const onScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < 250;
    };

    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // Industry-grade auto-scroll via ResizeObserver
  // Fires precisely when the text block logically wraps or new content is streamed natively.
  useEffect(() => {
    const container = threadMessagesRef.current;
    const content = innerContentRef.current;
    if (!container || !content) return;

    const scrollToBottom = () => {
      if (!shouldAutoScrollRef.current) return;
      
      const behavior: ScrollBehavior = isStreaming ? 'auto' : 'smooth';
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    };

    // Scroll immediately on setup
    requestAnimationFrame(scrollToBottom);

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(scrollToBottom);
    });

    observer.observe(content);

    return () => observer.disconnect();
  }, [isStreaming]);

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
            <div className="thread-messages-inner" ref={innerContentRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`message-row ${msg.role}`}>
                <div className="message-bubble">
                  {msg.role === 'assistant' ? (
                    <>
                      {msg.parts && msg.parts.length > 0 ? (
                        <PartsTimeline parts={msg.parts} keyPrefix={`msg-${msg.id}`} />
                      ) : (
                        <>
                          {msg.thinking && (
                            <ThinkingBlock content={msg.thinking} />
                          )}
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
          </div>

          <div className="thread-input-area">
            <InputBar />
          </div>
        </div>
      )}
    </div>
  );
};
