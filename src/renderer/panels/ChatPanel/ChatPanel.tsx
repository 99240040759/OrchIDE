/**
 * ChatPanel — Uses shadcn ScrollArea + Collapsible + Spinner + Progress
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useChatStore, LivePart } from '../../store/chatStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { InputBar } from '../InputBar/InputBar';
import { Icon } from '../../components/ui/Icon';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Spinner } from '../../components/ui/spinner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '@/lib/utils';

type TimelineGroup =
  | { kind: 'text';    key: string; text: string }
  | { kind: 'thinking'; key: string; text: string }
  | { kind: 'tools';   key: string; tools: LivePart[] };

const TOOL_CONFIG: Record<string, { icon: string; running: string; completed: string }> = {
  webSearch:               { icon: 'globe',        running: 'Searching',  completed: 'Searched' },
  readFile:                { icon: 'file',          running: 'Reading',    completed: 'Read' },
  writeFile:               { icon: 'edit',          running: 'Writing',    completed: 'Wrote' },
  listDirectory:           { icon: 'folder-opened', running: 'Listing',    completed: 'Listed' },
  createFile:              { icon: 'new-file',      running: 'Creating',   completed: 'Created' },
  deleteFile:              { icon: 'trash',         running: 'Deleting',   completed: 'Deleted' },
  searchInFiles:           { icon: 'search',        running: 'Searching',  completed: 'Searched' },
  grepSearch:              { icon: 'search',        running: 'Searching',  completed: 'Searched' },
  globSearch:              { icon: 'folder-opened', running: 'Finding',    completed: 'Found' },
  runTerminalCommand:      { icon: 'terminal',      running: 'Running',    completed: 'Ran' },
  fetchUrl:                { icon: 'link',          running: 'Fetching',   completed: 'Fetched' },
  updateTaskProgress:      { icon: 'pass',          running: 'Updating',   completed: 'Updated' },
  createArtifact:          { icon: 'file',          running: 'Creating',   completed: 'Created' },
  replaceFileContent:      { icon: 'replace',       running: 'Editing',    completed: 'Edited' },
  multiReplaceFileContent: { icon: 'layers',        running: 'Editing',    completed: 'Edited' },
  startTerminalCommand:    { icon: 'play-circle',   running: 'Starting',   completed: 'Started' },
  getCommandStatus:        { icon: 'pulse',         running: 'Checking',   completed: 'Checked' },
  sendCommandInput:        { icon: 'send',          running: 'Sending',    completed: 'Sent' },
  taskBoundary:            { icon: 'eye',           running: 'Setting task', completed: 'Set task' },
  notifyUser:              { icon: 'bell',          running: 'Notifying',  completed: 'Notified' },
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
  } catch { return false; }
}

function stripRawToolCallArtifacts(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trimStart();
    const toolMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);
    if (!toolMatch) { kept.push(rawLine); continue; }
    const [, toolName, remainderRaw] = toolMatch;
    if (!KNOWN_TOOL_NAMES.has(toolName)) { kept.push(rawLine); continue; }
    const remainder = remainderRaw.trim();
    if (remainder.startsWith('{')) {
      const block = collectJsonBlock(lines, i, remainder);
      if ((block.depth === 0 && isValidJsonObject(block.jsonText)) || block.depth > 0) { i = block.endLine; continue; }
    }
    if (!remainder && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim();
      if (nextTrimmed.startsWith('{')) {
        const block = collectJsonBlock(lines, i + 1, nextTrimmed);
        if ((block.depth === 0 && isValidJsonObject(block.jsonText)) || block.depth > 0) { i = block.endLine; continue; }
      }
    }
    kept.push(rawLine);
  }
  return kept.join('\n');
}

function getVSCodeIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseUrl = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@master/icons';
  const iconMap: Record<string, string> = {
    ts: 'file_type_typescript.svg', tsx: 'file_type_reactts.svg',
    js: 'file_type_js.svg', jsx: 'file_type_reactjs.svg',
    css: 'file_type_css.svg', html: 'file_type_html.svg',
    json: 'file_type_json.svg', md: 'file_type_markdown.svg',
    py: 'file_type_python.svg', rs: 'file_type_rust.svg',
    go: 'file_type_go.svg', java: 'file_type_java.svg',
    c: 'file_type_c.svg', cpp: 'file_type_cpp.svg', h: 'file_type_c.svg',
    svg: 'file_type_svg.svg', png: 'file_type_image.svg',
    jpg: 'file_type_image.svg', jpeg: 'file_type_image.svg',
    txt: 'file_type_text.svg', yml: 'file_type_yaml.svg',
    yaml: 'file_type_yaml.svg', xml: 'file_type_xml.svg',
    sh: 'file_type_shell.svg', bash: 'file_type_shell.svg',
  };
  return `${baseUrl}/${iconMap[ext] || 'default_file.svg'}`;
}

function getToolIcon(toolName: string, fileName?: string) {
  if (fileName) return <img src={getVSCodeIcon(fileName)} alt="file-icon" className="w-[14px] h-[14px]" />;
  const config = TOOL_CONFIG[toolName];
  return config ? <Icon name={config.icon} size={14} /> : <Icon name="file" size={14} />;
}

function getToolAction(toolName: string, completed = false): string {
  const config = TOOL_CONFIG[toolName];
  if (config) return completed ? config.completed : config.running;
  return completed ? 'Ran' : 'Running';
}

function extractFileInfo(toolName: string, args: Record<string, unknown>): { fileName?: string; details?: string } {
  if (['readFile', 'writeFile', 'createFile', 'deleteFile', 'replaceFileContent', 'multiReplaceFileContent'].includes(toolName)) {
    const filePath = (args.filePath || args.targetPath || args.TargetFile) as string;
    if (filePath) return { fileName: filePath.split('/').pop() || filePath };
  }
  if (toolName === 'webSearch') { const q = args.query as string; if (q) return { details: `"${q}"` }; }
  if (toolName === 'listDirectory') return { details: ((args.dirPath || args.DirectoryPath) as string) || '.' };
  if (['searchInFiles', 'grepSearch'].includes(toolName)) return { details: `"${(args.pattern || args.Query) as string}"` };
  if (toolName === 'globSearch') return { details: (args.pattern || args.Pattern) as string };
  if (['runTerminalCommand', 'startTerminalCommand'].includes(toolName)) {
    const c = (args.command || args.CommandLine) as string;
    if (c) return { details: `$ ${c.length > 40 ? c.slice(0, 40) + '...' : c}` };
  }
  if (toolName === 'getCommandStatus') { const id = (args.commandId || args.CommandId) as string; if (id) return { details: id.slice(0, 12) }; }
  if (toolName === 'sendCommandInput') return { details: args.Terminate ? 'Terminate' : 'stdin' };
  if (toolName === 'fetchUrl') { const url = (args.url || args.Url) as string; if (url) { try { return { details: new URL(url).hostname }; } catch { return { details: url.slice(0, 30) }; } } }
  if (toolName === 'updateTaskProgress') return { details: (args.title as string) || 'Task progress' };
  if (toolName === 'createArtifact') {
    const name = args.name as string;
    const fn = (args.filename as string)?.split('/').pop();
    if (name && fn) return { fileName: fn, details: name };
    if (name) return { details: name };
    if (fn) return { fileName: fn };
    return { details: 'Artifact' };
  }
  if (toolName === 'taskBoundary') {
    const tn = args.TaskName as string;
    const mode = args.Mode as string;
    if (tn && mode) return { details: `${mode}: ${tn}` };
    if (tn) return { details: tn };
    return { details: 'Task boundary' };
  }
  if (toolName === 'notifyUser') { const m = args.Message as string; if (m) return { details: m.slice(0, 40) + (m.length > 40 ? '...' : '') }; return { details: 'User notification' }; }
  return {};
}

/* ─── Inline Tool Chip ────────────────────────────────────────────────────── */
const InlineToolChip: React.FC<{ part: LivePart }> = ({ part }) => {
  const { toolCall } = part;
  if (!toolCall) return null;

  const isCompleted = toolCall.status === 'completed';
  const isRunning   = toolCall.status === 'running';
  const isError     = toolCall.status === 'error';
  const action      = getToolAction(toolCall.toolName, isCompleted);
  const { fileName, details } = extractFileInfo(toolCall.toolName, toolCall.args);
  const icon = getToolIcon(toolCall.toolName, fileName);
  
  // Extract line range and diff stats
  const lineRange = toolCall.lineRange;
  const diffStats = toolCall.diffStats;
  
  // Determine what to show based on tool type
  const isReadTool = toolCall.toolName === 'readFile';
  const isCreateWriteTool = ['createFile', 'writeFile'].includes(toolCall.toolName);
  const isEditTool = ['replaceFileContent', 'multiReplaceFileContent'].includes(toolCall.toolName);

  return (
    <div className="inline-flex items-center gap-1.5 text-[13px] text-orch-fg2 bg-white/[0.02] border border-white/[0.04] px-2.5 py-1 rounded-md my-0.5 whitespace-nowrap">
      <span className="text-orch-fg2 font-normal">{action}</span>
      <span className="flex items-center flex-shrink-0">
        {isRunning ? <Spinner size={13} /> : icon}
      </span>
      {fileName && <span className="text-orch-fg font-medium">{fileName}</span>}
      {details  && <span className="text-orch-fg2 italic text-[12px]">{details}</span>}
      
      {/* Read: Show line range only (#L1-L150) */}
      {isReadTool && lineRange && isCompleted && (
        <span className="text-white font-medium text-[11px] ml-1">
          #{lineRange.start === lineRange.end 
            ? `L${lineRange.start}` 
            : `L${lineRange.start}-L${lineRange.end}`}
        </span>
      )}
      
      {/* Create/Write: Show +X in green */}
      {isCreateWriteTool && diffStats && isCompleted && diffStats.additions > 0 && (
        <span className="text-[11px] font-medium ml-1 text-green-500">
          +{diffStats.additions}
        </span>
      )}
      
      {/* Edit/Multi-Edit: Show +X -Y in green and red */}
      {isEditTool && diffStats && isCompleted && (diffStats.additions > 0 || diffStats.deletions > 0) && (
        <span className="text-[11px] font-medium ml-1">
          {diffStats.additions > 0 && (
            <span className="text-green-500">+{diffStats.additions}</span>
          )}
          {diffStats.additions > 0 && diffStats.deletions > 0 && (
            <span className="text-orch-fg3"> </span>
          )}
          {diffStats.deletions > 0 && (
            <span className="text-red-500">-{diffStats.deletions}</span>
          )}
        </span>
      )}
      
      {isError  && <span className="text-orch-red font-medium ml-0.5">[Failed] {toolCall.error}</span>}
    </div>
  );
};

/* ─── Thinking Block (uses shadcn Collapsible) ───────────────────────────── */
const ThinkingBlock: React.FC<{ content: string; isLive?: boolean }> = ({ content, isLive }) => {
  const [open, setOpen] = useState(!!isLive);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (isLive) setOpen(true); }, [isLive]);
  useEffect(() => {
    if (!isLive && content) {
      const t = setTimeout(() => setOpen(false), 200);
      return () => clearTimeout(t);
    }
  }, [isLive, content]);

  useEffect(() => {
    if (isLive && open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  if (!content) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3 mb-3 w-full">
      <CollapsibleTrigger className="flex items-center gap-2 text-[13px] text-orch-fg2 mb-1.5 font-medium bg-transparent border-none p-1 pr-0 cursor-pointer hover:text-orch-fg transition-colors w-full text-left">
        <span>{isLive ? 'Thinking...' : 'Thought process'}</span>
        <Icon
          name={open ? 'chevron-down' : 'chevron-right'}
          size={14}
          className="ml-auto opacity-50"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div ref={scrollRef} className="max-h-[120px] overflow-y-auto pl-0.5">
          <MarkdownRenderer content={content} className="text-[13px] text-orch-fg2 opacity-85" />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

function buildTimelineGroups(parts: LivePart[], keyPrefix: string): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  let pendingWhitespace = '';
  for (const part of parts) {
    if (part.type === 'thinking' && part.content) {
      const last = groups[groups.length - 1];
      if (last?.kind === 'thinking') { last.text += part.content; }
      else groups.push({ kind: 'thinking', key: `${keyPrefix}-thinking-${part.id}`, text: part.content });
      continue;
    }
    if (part.type === 'text' && part.content) {
      const chunk = part.content;
      const last  = groups[groups.length - 1];
      if (last?.kind === 'text') { last.text += chunk; }
      else {
        if (!/\S/.test(chunk)) { pendingWhitespace += chunk; continue; }
        groups.push({ kind: 'text', key: `${keyPrefix}-text-${part.id}`, text: `${pendingWhitespace}${chunk}` });
        pendingWhitespace = '';
      }
      continue;
    }
    if (part.type === 'tool-call' && part.toolCall) {
      pendingWhitespace = '';
      const last = groups[groups.length - 1];
      if (last?.kind === 'tools') last.tools.push(part);
      else groups.push({ kind: 'tools', key: `${keyPrefix}-tools-${part.id}`, tools: [part] });
    }
  }
  return groups;
}

const PartsTimeline: React.FC<{ parts: LivePart[]; keyPrefix: string; isLive?: boolean }> = ({ parts, keyPrefix, isLive }) => {
  const groups     = useMemo(() => buildTimelineGroups(parts, keyPrefix), [parts, keyPrefix]);
  const isThinking = useChatStore(state => state.isThinking);
  return (
    <>
      {groups.map((group, index) => {
        if (group.kind === 'thinking') {
          return (
            <div key={group.key} className="mt-1.5 first:mt-0">
              <ThinkingBlock content={group.text} isLive={isLive && isThinking && index === groups.length - 1} />
            </div>
          );
        }
        if (group.kind === 'tools') {
          return (
            <div key={group.key} className="flex flex-wrap gap-2 mb-1 mt-1.5 first:mt-0">
              {group.tools.map(part => <InlineToolChip key={part.id} part={part} />)}
            </div>
          );
        }
        const cleanedText = stripRawToolCallArtifacts(group.text);
        if (!cleanedText.trim()) return null;
        return (
          <MarkdownRenderer
            key={group.key}
            content={cleanedText}
            className="mt-1 first:mt-0 text-[14px] leading-[1.65] text-[#FAFAFA]"
          />
        );
      })}
    </>
  );
};

/* ─── Live streaming ──────────────────────────────────────────────────────── */
const LiveStreamContent: React.FC = () => {
  const liveParts  = useChatStore(state => state.liveParts);
  const isStreaming = useChatStore(state => state.isStreaming);
  const isThinking  = useChatStore(state => state.isThinking);

  if (!isStreaming) return null;

  if (liveParts.length === 0) {
    return (
      <div className="flex gap-3 items-start max-w-[680px] mx-auto w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[13px] text-orch-fg2 opacity-70 p-1">
            <Spinner size={14} />
            <span>Thinking...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-start max-w-[680px] mx-auto w-full">
      <div className="flex-1 min-w-0 pt-1 flex flex-col gap-[3px]">
        <PartsTimeline parts={liveParts} keyPrefix="live" isLive={true} />
        {isStreaming && !isThinking && liveParts.some(p => p.type === 'text') && (
          <span className="inline-block w-[2px] h-[16px] bg-orch-accent ml-0.5 align-text-bottom animate-cursor-blink" />
        )}
      </div>
    </div>
  );
};

/* ─── Main ChatPanel ──────────────────────────────────────────────────────── */
export const ChatPanel: React.FC = () => {
  const messages        = useChatStore(state => state.messages);
  const isStreaming     = useChatStore(state => state.isStreaming);
  const activeWorkspace = useWorkspaceStore(state => state.activeWorkspace);

  const scrollViewportRef        = useRef<HTMLDivElement>(null);
  const innerContentRef          = useRef<HTMLDivElement>(null);
  const messagesEndRef           = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef      = useRef(true);
  const isProgrammaticScrollRef  = useRef(false);

  useEffect(() => {
    const container = scrollViewportRef.current;
    if (!container) return;
    const onScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldAutoScrollRef.current = dist <= 150;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const content = innerContentRef.current;
    if (!content) return;
    const scrollToBottom = () => {
      if (!shouldAutoScrollRef.current) return;
      isProgrammaticScrollRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth', block: 'end' });
      requestAnimationFrame(() => { isProgrammaticScrollRef.current = false; });
    };
    requestAnimationFrame(scrollToBottom);
    const observer = new ResizeObserver(() => requestAnimationFrame(scrollToBottom));
    observer.observe(content);
    return () => observer.disconnect();
  }, [isStreaming]);

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        {isEmpty ? (
          /* ── Home state ──────────────────────────────────────────── */
          <div className="flex flex-col justify-center items-center flex-1 p-6">
            <div className="w-full max-w-[680px] flex flex-col items-center" style={{ transform: 'translateY(-8vh)' }}>
              <div className="text-[36px] mb-4 opacity-60 text-orch-accent">✦</div>
              <h1 className="text-[22px] font-medium mb-5 text-orch-fg text-center">
                {activeWorkspace ? (
                  <><span className="text-orch-fg2">Workspace: </span><span>{activeWorkspace.name}</span></>
                ) : 'What can I help you with?'}
              </h1>
              {activeWorkspace && (
                <p className="text-[13px] text-orch-fg2 mb-4 text-center">
                  Agentic mode — I can read, write, and manage files in your workspace.
                </p>
              )}
              <InputBar />
            </div>
          </div>
        ) : (
          /* ── Thread state ────────────────────────────────────────── */
          <div className="flex flex-col flex-1 h-full overflow-hidden relative">
            <ScrollArea className="flex-1">
              <div className="px-6 pt-6 flex flex-col gap-6">
                <div className="flex flex-col gap-5 pb-[160px]" ref={innerContentRef}>
                  {messages.map(msg => (
                    <div 
                      key={msg.id} 
                      className={cn(
                        "relative w-full",
                        msg.role === 'user' ? "sticky top-0 z-10 py-3 -my-3" : "flex gap-3 items-start max-w-[680px] mx-auto"
                      )}
                    >
                      {msg.role === 'user' && (
                        <div className="absolute inset-0 -mx-6 px-6 bg-orch-bg/85 backdrop-blur-[12px] pointer-events-none" />
                      )}
                      
                      <div className={cn("relative flex gap-3 items-start max-w-[680px] mx-auto w-full")}>
                        <div className="flex-1 min-w-0">
                          {msg.role === 'user' ? (
                            <div className="bg-orch-input border border-orch-border2 shadow-sm rounded-[10px] px-4 py-3 text-[14px] leading-[1.6] text-orch-fg break-words">
                              {msg.content}
                            </div>
                          ) : (
                          <div className="pt-1 flex flex-col gap-[3px]">
                            {msg.parts && msg.parts.length > 0 ? (
                              <PartsTimeline parts={msg.parts} keyPrefix={`msg-${msg.id}`} />
                            ) : (
                              <>
                                {msg.thinking && <ThinkingBlock content={msg.thinking} />}
                                {msg.toolCalls && msg.toolCalls.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mb-0.5">
                                    {msg.toolCalls.map(tc => (
                                      <InlineToolChip key={tc.id} part={{ type: 'tool-call', id: tc.id, toolCall: tc, timestamp: msg.timestamp }} />
                                    ))}
                                  </div>
                                )}
                                {msg.content && (
                                  <MarkdownRenderer
                                    content={stripRawToolCallArtifacts(msg.content)}
                                    className="text-[14px] leading-[1.65] text-orch-fg"
                                  />
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  ))}

                  <LiveStreamContent />
                  
                  {/* Important empty block for scrolling dynamic padding to prevent overlapping InputBar */}
                  <div ref={messagesEndRef} className="h-[180px] w-full shrink-0" />
                </div>
              </div>
            </ScrollArea>

            <div className="absolute bottom-0 left-0 right-0 px-6 py-4 pb-5 flex justify-center bg-gradient-to-t from-orch-bg via-orch-bg/90 to-transparent pt-12 pointer-events-none z-20">
              <div className="w-full max-w-[680px] shadow-[0_0_40px_rgba(0,0,0,0.4)] rounded-[10px] pointer-events-auto">
                <InputBar />
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
