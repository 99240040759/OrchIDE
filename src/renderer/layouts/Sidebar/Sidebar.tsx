/**
 * Sidebar — Uses shadcn ScrollArea + Collapsible + Skeleton + Tooltip
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/ui/Icon';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible';
import { Skeleton } from '../../components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Separator } from '../../components/ui/separator';
import { useChatStore } from '../../store/chatStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAgentStore } from '../../store/agentStore';
import { v4 as uuidv4 } from 'uuid';
import { FileExplorer } from '../../components/FileExplorer/FileExplorer';
import { getFilename } from '../../../shared/utils/pathUtils';
import { getOrchideAPI } from '../../utils/orchide';
import type { Session } from '../../../types/electron.d';
import { cn } from '@/lib/utils';

const orchide = getOrchideAPI();

export const Sidebar: React.FC = () => {
  const setSessionId = useChatStore(state => state.setSessionId);
  const setMessages  = useChatStore(state => state.setMessages);
  const sessionId    = useChatStore(state => state.sessionId);

  const activeWorkspace = useWorkspaceStore(state => state.activeWorkspace);
  const setWorkspace    = useWorkspaceStore(state => state.setWorkspace);

  const clearForSession = useAgentStore(state => state.clearForSession);

  const [chatSessions,     setChatSessions]     = useState<Session[]>([]);
  const [historyLoading,   setHistoryLoading]   = useState(true);
  const [showChatHistory,  setShowChatHistory]  = useState(false);

  useEffect(() => { loadChatHistory(); }, []);

  const loadChatHistory = useCallback(async () => {
    if (!orchide) return;
    setHistoryLoading(true);
    const sessions = await orchide.history.getChats();
    setChatSessions(sessions || []);
    setHistoryLoading(false);
  }, []);

  const startNewChat = useCallback(() => {
    const newId = uuidv4();
    setSessionId(newId);
    setMessages([]);
    clearForSession();
    loadChatHistory();
  }, [setSessionId, setMessages, clearForSession, loadChatHistory]);

  const openWorkspace = useCallback(async () => {
    if (!orchide) return;
    const folderPath = await orchide.fs.openDialog();
    if (!folderPath) return;
    const name = getFilename(folderPath) || folderPath;
    setWorkspace({ path: folderPath, name });
    await orchide.watcher.start(folderPath);
    setSessionId(uuidv4());
    setMessages([]);
    clearForSession();
  }, [setWorkspace, setSessionId, setMessages, clearForSession]);

  const closeWorkspace = useCallback(async () => {
    await orchide?.watcher.stop();
    setWorkspace(null);
    startNewChat();
  }, [setWorkspace, startNewChat]);

  const openHistorySession = useCallback(async (sessId: string) => {
    setSessionId(sessId);
    clearForSession();
    if (!orchide) return;
    const msgs = await orchide.history.getMessages(sessId);
    setMessages((msgs || []).map((m: any) => ({
      id: m.id, role: m.role, content: m.content, timestamp: m.timestamp,
      thinking: m.thinking, toolCalls: m.toolCalls, parts: m.parts 
    })));
  }, [setSessionId, clearForSession, setMessages]);

  const deleteSession = useCallback(async (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!orchide) return;
    await orchide.history.deleteSession(sessId);
    if (sessId === sessionId) startNewChat();
    loadChatHistory();
  }, [sessionId, startNewChat, loadChatHistory]);

  const formatTime = (ts: any): string => {
    const t = Number(ts);
    if (!t || isNaN(t)) return '';
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col flex-1 overflow-hidden text-orch-fg text-[13px]">
        <ScrollArea className="flex-1 px-2 pt-2">
          {!activeWorkspace ? (
            /* ── No workspace mode ─────────────────────────────────── */
            <div className="flex flex-col gap-1">
              {/* New Chat */}
              <button
                onClick={startNewChat}
                className="w-full flex items-center gap-2 px-3 py-1.5 mb-1 bg-orch-hover border border-orch-border rounded-md text-left font-medium text-[13px] text-orch-fg cursor-pointer transition-colors hover:bg-orch-input"
              >
                <Icon name="add" size={14} /> Start new conversation
              </button>

              {/* Chat History Collapsible */}
              <Collapsible open={showChatHistory} onOpenChange={setShowChatHistory}>
                <CollapsibleTrigger className="flex items-center gap-2 px-3 py-1.5 w-full text-orch-fg2 cursor-pointer text-[13px] rounded-md hover:text-orch-fg hover:bg-orch-hover transition-colors">
                  <Icon name="history" size={14} className="flex-shrink-0" />
                  <span className="flex-1 truncate text-left">Chat History</span>
                  <Icon
                    name="chevron-down"
                    size={12}
                    className={cn('flex-shrink-0 transition-transform duration-200', showChatHistory && 'rotate-180')}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="py-1">
                    {historyLoading ? (
                      <div className="flex flex-col gap-1.5 px-3 py-2">
                        <Skeleton className="h-[18px] w-[85%] bg-orch-hover" />
                        <Skeleton className="h-[18px] w-[70%] bg-orch-hover" />
                        <Skeleton className="h-[18px] w-[80%] bg-orch-hover" />
                      </div>
                    ) : chatSessions.length === 0 ? (
                      <div className="px-4 py-1.5 text-orch-fg2 text-[12px] italic">No chats yet</div>
                    ) : (
                      chatSessions.map(s => (
                        <SessionItem
                          key={s.id}
                          session={s}
                          isActive={s.id === sessionId}
                          onSelect={() => openHistorySession(s.id)}
                          onDelete={e => deleteSession(s.id, e)}
                          formatTime={formatTime}
                        />
                      ))
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Separator className="my-2" />

              {/* Workspaces */}
              <div>
                <div className="flex items-center px-3 py-1 text-[11px] text-orch-fg font-semibold uppercase tracking-[0.4px] opacity-80">
                  <span className="flex-1 truncate">Workspaces</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="flex-shrink-0 ml-auto p-0.5 rounded-md text-orch-fg2 hover:text-orch-fg hover:bg-orch-hover" onClick={openWorkspace}>
                        <Icon name="add" size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Open Folder</TooltipContent>
                  </Tooltip>
                </div>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 mt-1 text-orch-fg2 text-[12px] font-medium cursor-pointer rounded-md hover:bg-orch-hover transition-colors"
                  onClick={openWorkspace}
                >
                  <Icon name="folder-opened" size={14} className="flex-shrink-0" />
                  <span>Open a Folder...</span>
                </div>
              </div>
            </div>
          ) : (
            /* ── Workspace mode ────────────────────────────────────── */
            <div className="flex flex-col gap-2">
              {/* Workspace header — min-w-0 allows the name to shrink and truncate */}
              <div className="group flex items-center gap-2 h-[34px] px-2 mx-1.5 mb-1 bg-primary/10 rounded-md border border-primary/20 min-w-0">
                <Icon name="folder-opened" size={14} className="text-orch-accent flex-shrink-0" />
                <span className="flex-1 min-w-0 font-semibold text-[12px] truncate" title={activeWorkspace.path}>
                  {activeWorkspace.name}
                </span>
                <button
                  onClick={closeWorkspace}
                  title="Close Workspace"
                  className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-orch-fg2 hover:text-orch-red hover:bg-orch-red/10 transition-all opacity-0 group-hover:opacity-100"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>

              <button
                onClick={startNewChat}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-orch-hover border border-orch-border rounded-md text-left font-medium text-[12px] text-orch-fg cursor-pointer transition-colors hover:bg-orch-input"
              >
                <Icon name="add" size={14} /> New Agentic Chat
              </button>

              <Separator />

              {/* File Explorer */}
              <div className="mt-1">
                <div className="px-3 py-1 text-[11px] text-orch-fg font-semibold uppercase tracking-[0.4px] opacity-80">
                  Explorer
                </div>
                <FileExplorer />
              </div>

              <Separator />

              {/* Workspace session history */}
              <div className="mt-1">
                <div className="px-3 py-1 text-[11px] text-orch-fg font-semibold uppercase tracking-[0.4px] opacity-80">
                  Workspace History
                </div>
                <WorkspaceSessionList
                  workspacePath={activeWorkspace.path}
                  currentSessionId={sessionId}
                  onSelect={openHistorySession}
                  onDelete={deleteSession}
                  formatTime={formatTime}
                />
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Bottom links */}
        <Separator />
        <div className="px-2 py-1.5 flex flex-col gap-0.5">
          <button
            className="flex items-center gap-2.5 px-3 py-1.5 text-orch-fg2 text-[13px] rounded-md cursor-pointer bg-transparent border-none w-full text-left hover:bg-orch-hover hover:text-orch-fg transition-colors"
            onClick={() => (window as any).electron?.openSettings?.()}
          >
            <Icon name="settings-gear" size={14} /> Settings
          </button>
          <button className="flex items-center gap-2.5 px-3 py-1.5 text-orch-fg2 text-[13px] rounded-md cursor-pointer bg-transparent border-none w-full text-left hover:bg-orch-hover hover:text-orch-fg transition-colors">
            <Icon name="comment" size={14} /> Provide Feedback
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
};

/* ─── Session Item ────────────────────────────────────────────────────────── */
const SessionItem: React.FC<{
  session: Session; isActive: boolean;
  onSelect: () => void; onDelete: (e: React.MouseEvent) => void;
  formatTime: (ts: number) => string;
}> = ({ session, isActive, onSelect, onDelete, formatTime }) => {
  const timeStr = formatTime(session.updated_at);
  return (
    <div
      className={cn(
        'group flex items-center gap-1 h-[32px] px-2 text-orch-fg2 cursor-pointer rounded-md mb-px mx-1 transition-colors min-w-0',
        'hover:bg-orch-hover hover:text-orch-fg',
        isActive && 'bg-primary/20 text-orch-fg font-medium',
      )}
      onClick={onSelect}
    >
      {/* Title takes all available space and truncates */}
      <span className="flex-1 min-w-0 truncate text-[12px]">{session.title || 'Untitled'}</span>

      {/* Right side: time + delete — never shrink */}
      <div className="flex-shrink-0 flex items-center gap-1">
        {timeStr && (
          <span className="text-[10px] text-orch-fg2 opacity-60 whitespace-nowrap group-hover:hidden">
            {timeStr}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(e); }}
          title="Delete"
          className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-orch-fg2 hover:text-orch-red hover:bg-orch-red/10 transition-all"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    </div>
  );
};

/* ─── Workspace Session List ──────────────────────────────────────────────── */
const WorkspaceSessionList: React.FC<{
  workspacePath: string; currentSessionId: string;
  onSelect: (id: string) => void; onDelete: (id: string, e: React.MouseEvent) => void;
  formatTime: (ts: number) => string;
}> = ({ workspacePath, currentSessionId, onSelect, onDelete, formatTime }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!orchide || !workspacePath) return;
    setLoading(true);
    orchide.history.getWorkspaceSessions(workspacePath).then((s: Session[]) => {
      setSessions(s || []);
      setLoading(false);
    });
  }, [workspacePath, currentSessionId]);

  if (loading) return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <Skeleton className="h-[18px] w-[75%] bg-orch-hover" />
      <Skeleton className="h-[18px] w-[60%] bg-orch-hover" />
    </div>
  );

  if (sessions.length === 0) {
    return <div className="px-4 py-1.5 text-orch-fg2 text-[12px] italic">No sessions yet</div>;
  }

  return (
    <>
      {sessions.map(s => (
        <SessionItem
          key={s.id}
          session={s}
          isActive={s.id === currentSessionId}
          onSelect={() => onSelect(s.id)}
          onDelete={e => onDelete(s.id, e)}
          formatTime={formatTime}
        />
      ))}
    </>
  );
};
