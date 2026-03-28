/**
 * Main renderer entry point
 * Handles app initialization, routing, and global event subscriptions
 *
 * THE EVENT BRIDGE:
 * This file is the single junction that connects IPC events from the main
 * process to the Zustand stores (chatStore, agentStore, workspaceStore).
 * Without the subscribeAll() call in the App's useEffect, NOTHING from the
 * agent's tools or streaming flows reaches the UI.
 */

import './styles/global.css';
import '@vscode/codicons/dist/codicon.css';
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './layouts/Sidebar/Sidebar';
import { RightSidebar } from './layouts/RightSidebar/RightSidebar';
import { ChatPanel } from './panels/ChatPanel/ChatPanel';
import { EditorPanel } from './panels/EditorPanel/EditorPanel';
import { TitleBar } from './layouts/TitleBar/TitleBar';
import { SettingsWindow } from './views/SettingsWindow/SettingsWindow';
import { useLayoutStore } from './store/layoutStore';
import { useChatStore } from './store/chatStore';
import { useAgentStore } from './store/agentStore';
import { useWorkspaceStore } from './store/workspaceStore';
import { v4 as uuidv4 } from 'uuid';
import { getOrchideAPI } from './utils/orchide';

// Set platform class on body for platform-specific styling
const platform = (window as { electron?: { platform?: string } }).electron?.platform || 'unknown';
document.body.classList.add(`platform-${platform}`);

const orchide = getOrchideAPI();

/**
 * Main application component
 */
const App: React.FC = () => {
  const isLeftSidebarOpen = useLayoutStore(state => state.isLeftSidebarOpen);
  const isRightSidebarOpen = useLayoutStore(state => state.isRightSidebarOpen);
  const isEditorOpen = useLayoutStore(state => state.isEditorOpen);

  const sessionId = useChatStore(state => state.sessionId);
  const setSessionId = useChatStore(state => state.setSessionId);

  const activeWorkspace = useWorkspaceStore(state => state.activeWorkspace);

  // Initialize session ID on first mount
  useEffect(() => {
    if (!sessionId) {
      setSessionId(uuidv4());
    }
  }, [sessionId, setSessionId]);

  // ========================================================================
  // AGENT EVENT BRIDGE — The critical connection layer
  //
  // Every IPC event from the main-process AgentSession is routed here
  // into the correct Zustand store. Without this, the right sidebar
  // (task progress, artifacts, files changed) stays permanently empty.
  // ========================================================================
  useEffect(() => {
    if (!orchide || !sessionId) return;

    const unsubscribe = orchide.agent.subscribeAll({
      // ---- Stream lifecycle --------------------------------------------------
      onStreamStart: (data: { sessionId: string }) => {
        if (data.sessionId !== sessionId) return;
        useChatStore.getState().startStreaming();
        useAgentStore.getState().setAgentState('generating');
      },

      // ---- Token-level text + tool events ------------------------------------
      onStreamEvent: (data: {
        sessionId: string;
        type: string;
        data: Record<string, unknown>;
      }) => {
        if (data.sessionId !== sessionId) return;
        useChatStore.getState().handleStreamEvent(data as any);
      },

      // ---- Stream chunk (legacy compatibility) --------------------------------
      // We ignore this to prevent double-printing since onStreamEvent handles text-deltas
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      onStreamChunk: () => {},

      // ---- Stream fully finished ---------------------------------------------
      onStreamEnd: (data: { sessionId: string }) => {
        if (data.sessionId !== sessionId) return;
        useChatStore.getState().finalizeStream();
        useAgentStore.getState().setAgentState('idle');
      },

      // ---- Stream error -------------------------------------------------------
      onStreamError: (data: { sessionId: string; error: string }) => {
        if (data.sessionId !== sessionId) return;
        console.error('[Event Bridge] Stream error:', data.error);
        useChatStore.getState().finalizeStream();
        useAgentStore.getState().setAgentState('error');
      },

      // ---- Task progress (from updateTaskProgress tool) ----------------------
      onTaskUpdate: (data: { sessionId: string; checklistMd: string }) => {
        if (data.sessionId !== sessionId) return;
        useAgentStore.getState().updateTaskMd(data.checklistMd);
      },

      // ---- Artifact created (from createArtifact tool) -----------------------
      onArtifactCreated: (data: { sessionId: string; artifact: any }) => {
        if (data.sessionId !== sessionId) return;
        const a = data.artifact;
        useAgentStore.getState().addArtifact({
          id: a.id,
          name: a.name,
          type: a.type,
          filePath: a.filePath,
          icon: a.icon || 'FileText',
          sessionId: data.sessionId,
        });
      },

      // ---- Session titled (auto-generated from first user message) -----------
      onSessionTitled: (data: { sessionId: string; title: string }) => {
        if (data.sessionId !== sessionId) return;
        // Could update left sidebar session list in the future
        console.log('[Event Bridge] Session titled:', data.title);
      },
    });

    return unsubscribe;
  }, [sessionId]);

  // ========================================================================
  // Load persisted sidebar state when session changes
  // (Artifacts, task progress, files from DB → sidebar on session restore)
  // Parallelized with Promise.all for faster loading
  // ========================================================================
  useEffect(() => {
    if (!orchide || !sessionId) return;

    const loadSessionState = async () => {
      try {
        // Clear old data first
        useAgentStore.getState().clearForSession();

        // Load artifacts and task progress in parallel
        const [artifacts, taskMd] = await Promise.all([
          orchide.history.getArtifacts(sessionId),
          orchide.history.getTaskProgress(sessionId),
        ]);

        if (artifacts && artifacts.length > 0) {
          useAgentStore.getState().setArtifacts(
            artifacts.map((a: any) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              filePath: a.filePath,
              icon: a.icon || 'FileText',
              sessionId,
            }))
          );
        }

        if (taskMd) {
          useAgentStore.getState().updateTaskMd(taskMd);
        }
      } catch (error) {
        console.error('[Event Bridge] Failed to load session state:', error);
      }
    };

    loadSessionState();
  }, [sessionId]);

  // File watcher subscription with proper cleanup and debouncing
  // Debounce prevents excessive refreshes during rapid file changes (e.g., git operations, builds)
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!orchide || !activeWorkspace) return;

    const DEBOUNCE_MS = 300; // 300ms debounce for file tree refresh

    const unsubscribe = orchide.watcher.subscribe(
      async (event: { type: string; path: string }) => {
        // Debounce file tree refresh to prevent thrashing
        if (refreshDebounceRef.current) {
          clearTimeout(refreshDebounceRef.current);
        }
        refreshDebounceRef.current = setTimeout(() => {
          useWorkspaceStore.getState().refreshFileTree();
          refreshDebounceRef.current = null;
        }, DEBOUNCE_MS);

        // If an open file changed externally, reload its content (no debounce needed)
        if (event.type === 'change') {
          const currentOpenFiles = useWorkspaceStore.getState().openFiles;
          const openFile = currentOpenFiles.find(f => f.path === event.path);

          if (openFile && !openFile.isDirty) {
            const result = await orchide.fs.readFile(event.path);
            if (result?.content != null) {
              useWorkspaceStore.getState().updateFileContent(event.path, result.content, false);
            }
          }
        }
      }
    );

    return () => {
      unsubscribe();
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
    };
  }, [activeWorkspace?.path]);

  // Auto-open sidebars when entering workspace mode
  useEffect(() => {
    if (activeWorkspace) {
      useLayoutStore.getState().setLeftSidebarOpen(true);
      useLayoutStore.getState().setRightSidebarOpen(true);
    }
  }, [activeWorkspace]);

  return (
    <>
      <TitleBar />
      <div className="app-body flex flex-1 overflow-hidden">
        {isLeftSidebarOpen && (
          <div id="left-sidebar" className="w-[260px] flex-shrink-0 bg-orch-surface border-r border-orch-border flex flex-col">
            <Sidebar />
          </div>
        )}
        <div id="main-content" className="flex-1 flex flex-col bg-orch-bg overflow-y-auto">
          <ChatPanel />
        </div>
        {isEditorOpen && (
          <div id="editor-panel" className="flex-1 flex flex-col bg-orch-bg border-l border-orch-border min-w-[300px]">
            <EditorPanel />
          </div>
        )}
        {isRightSidebarOpen && (
          <div id="right-sidebar" className="w-[280px] flex-shrink-0 bg-orch-surface border-l border-orch-border flex flex-col">
            <RightSidebar />
          </div>
        )}
      </div>
    </>
  );
};

// Mount application
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);

  // Route to settings window if hash is #/settings
  if (window.location.hash === '#/settings') {
    root.render(
      <SettingsWindow
        onClose={() => {
          (window as any).electron?.closeWindow?.() ?? window.close();
        }}
      />
    );
  } else {
    root.render(<App />);
  }
}

console.log('[OrchIDE] Initialized — Agent event bridge active');
