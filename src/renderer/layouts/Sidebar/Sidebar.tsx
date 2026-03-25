import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, History, ChevronDown, ChevronRight, Info, BookOpen,
  Globe, Settings, MessageSquare, Folder, FolderOpen, Trash2, FileText
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAgentStore } from '../../store/agentStore';
import { v4 as uuidv4 } from 'uuid';
import { FileExplorer } from '../../components/FileExplorer/FileExplorer';
import './Sidebar.css';

interface SessionItem {
  id: string;
  title: string;
  updated_at: number;
}

interface WorkspaceHistory {
  path: string;
  name: string;
  sessions: SessionItem[];
  expanded: boolean;
}

const orchide = (window as any).orchide;

export const Sidebar = () => {
  const { setSessionId, setMessages, sessionId } = useChatStore();
  const { activeWorkspace, setWorkspace } = useWorkspaceStore();
  const { clearForSession, setArtifacts, setFilesChanged, updateTaskMd } = useAgentStore();

  const [chatSessions, setChatSessions] = useState<SessionItem[]>([]);
  const [workspaceHistories, setWorkspaceHistories] = useState<WorkspaceHistory[]>([]);
  const [activeSection, setActiveSection] = useState<'chat' | 'workspaces'>('chat');
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    loadChatHistory();
  }, []);

  const loadChatHistory = async () => {
    if (!orchide) return;
    const sessions = await orchide.history.getChats();
    setChatSessions(sessions || []);
  };

  const loadWorkspaceHistory = async (workspacePath: string) => {
    if (!orchide) return;
    const sessions = await orchide.history.getWorkspaceSessions(workspacePath);
    return sessions || [];
  };

  const startNewChat = () => {
    const newId = uuidv4();
    setSessionId(newId);
    setMessages([]);
    clearForSession();
    loadChatHistory();
  };

  const openWorkspace = async () => {
    if (!orchide) return;
    const folderPath = await orchide.fs.openDialog();
    if (!folderPath) return;
    const name = folderPath.split('/').pop() || folderPath.split('\\').pop() || folderPath;
    setWorkspace({ path: folderPath, name });
    // Start watcher
    await orchide.watcher.start(folderPath);
    // Start new agentic session
    const newId = uuidv4();
    setSessionId(newId);
    setMessages([]);
    clearForSession();
  };

  const openHistorySession = async (sessId: string) => {
    setSessionId(sessId);
    clearForSession();
    if (!orchide) return;
    const msgs = await orchide.history.getMessages(sessId);
    const mapped = (msgs || []).map((m: any) => ({
      id: m.id, role: m.role, content: m.content, timestamp: m.timestamp,
    }));
    setMessages(mapped);
    // Restore agent state
    const taskMd = await orchide.history.getTaskProgress(sessId);
    if (taskMd) updateTaskMd(taskMd);
    const artifacts = await orchide.history.getArtifacts(sessId);
    if (artifacts) setArtifacts(artifacts.map((a: any) => ({ ...a, sessionId: a.session_id })));
    const filesChanged = await orchide.history.getFilesChanged(sessId);
    if (filesChanged) setFilesChanged(filesChanged.map((f: any) => ({ id: f.id, filePath: f.file_path, status: f.status })));
  };

  const deleteSession = async (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!orchide) return;
    await orchide.history.deleteSession(sessId);
    if (sessId === sessionId) startNewChat();
    loadChatHistory();
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  const isWorkspaceMode = !!activeWorkspace;

  return (
    <div className="sidebar-container">
      <div className="sidebar-top">
        {!isWorkspaceMode ? (
          <>
            <button className="new-chat-btn" onClick={startNewChat}>
              <Plus size={14} /> Start new conversation
            </button>

            <div className="history-link" onClick={() => setShowChatHistory(!showChatHistory)}>
              <History size={14} />
              <span>Chat History</span>
              <ChevronDown size={12} className={`chevron-icon ${showChatHistory ? 'open' : ''}`} />
            </div>

            {showChatHistory && (
              <div className="history-list">
                {chatSessions.length === 0 ? (
                  <div className="empty-state">No chats yet</div>
                ) : (
                  chatSessions.map(s => (
                    <div
                      key={s.id}
                      className={`conversation-item ${s.id === sessionId ? 'active' : ''}`}
                      onClick={() => openHistorySession(s.id)}
                    >
                      <span className="title">{s.title || 'Untitled'}</span>
                      <div className="item-right">
                        <span className="time">{formatTime(s.updated_at)}</span>
                        <button className="delete-btn" onClick={(e) => deleteSession(s.id, e)}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="section">
              <div className="section-header">
                <span>Workspaces</span>
                <span className="action-icon" onClick={openWorkspace} title="Open Workspace Folder">
                  <Plus size={14} />
                </span>
              </div>
              <div
                className="workspace-item section-expandable open-workspace-hint"
                onClick={openWorkspace}
              >
                <FolderOpen size={14} className="folder-icon" />
                <span>Open a Folder...</span>
              </div>
            </div>

            <div className="section">
              <div className="section-header">
                <span className="playground-header">
                  Playground <span className="info-icon"><Info size={12} /></span>
                </span>
                <span className="action-icon"><Plus size={14} /></span>
              </div>
              <div className="empty-state">No chats yet</div>
            </div>
          </>
        ) : (
          <>
            {/* Workspace mode header */}
            <div className="workspace-header-section">
              <div className="workspace-active-header">
                <FolderOpen size={14} className="folder-icon accent" />
                <span className="workspace-active-name">{activeWorkspace.name}</span>
                <button
                  className="close-workspace-btn"
                  onClick={async () => {
                    await orchide?.watcher.stop();
                    setWorkspace(null);
                    startNewChat();
                  }}
                  title="Close Workspace"
                >
                  ✕
                </button>
              </div>
              <button className="new-chat-btn workspace-new-chat" onClick={startNewChat}>
                <Plus size={14} /> New Agentic Chat
              </button>
            </div>

            {/* File Explorer */}
            <div className="file-explorer-section">
              <div className="section-header">
                <span>Explorer</span>
              </div>
              <FileExplorer />
            </div>

            {/* Workspace Chat History */}
            <div className="section workspace-history-section">
              <div className="section-header">
                <span>Workspace History</span>
              </div>
              <WorkspaceSessionList
                workspacePath={activeWorkspace.path}
                currentSessionId={sessionId}
                onSelect={openHistorySession}
                onDelete={deleteSession}
                formatTime={formatTime}
              />
            </div>
          </>
        )}
      </div>

      <div className="sidebar-bottom">
        <a href="#" className="bottom-link"><BookOpen size={14} /> Knowledge</a>
        <a href="#" className="bottom-link"><Globe size={14} /> Browser</a>
        <a
          href="#"
          className="bottom-link"
          onClick={(e) => { e.preventDefault(); (window as any).electron?.openSettings(); }}
        >
          <Settings size={14} /> Settings
        </a>
        <a href="#" className="bottom-link"><MessageSquare size={14} /> Provide Feedback</a>
      </div>
    </div>
  );
};

const WorkspaceSessionList: React.FC<{
  workspacePath: string;
  currentSessionId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  formatTime: (ts: number) => string;
}> = ({ workspacePath, currentSessionId, onSelect, onDelete, formatTime }) => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  useEffect(() => {
    const orchide = (window as any).orchide;
    if (!orchide || !workspacePath) return;
    orchide.history.getWorkspaceSessions(workspacePath).then((s: any[]) => setSessions(s || []));
  }, [workspacePath, currentSessionId]);

  if (sessions.length === 0) return <div className="empty-state">No sessions yet</div>;

  return (
    <>
      {sessions.map(s => (
        <div
          key={s.id}
          className={`conversation-item ${s.id === currentSessionId ? 'active' : ''}`}
          onClick={() => onSelect(s.id)}
        >
          <span className="title">{s.title || 'Untitled'}</span>
          <div className="item-right">
            <span className="time">{formatTime(s.updated_at)}</span>
            <button className="delete-btn" onClick={(e) => onDelete(s.id, e)}>
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      ))}
    </>
  );
};
