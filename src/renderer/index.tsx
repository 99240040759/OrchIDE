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
import React, { useEffect } from 'react';
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

// Set platform class on body for platform-specific styling
const platform = (window as any).electron?.platform || 'unknown';
document.body.classList.add(`platform-${platform}`);

const orchide = (window as any).orchide;

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
  // ========================================================================
  useEffect(() => {
    if (!orchide || !sessionId) return;

    const loadSessionState = async () => {
      try {
        // Load artifacts from DB
        const artifacts = await orchide.history.getArtifacts(sessionId);
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

        // Load task progress from DB
        const taskMd = await orchide.history.getTaskProgress(sessionId);
        if (taskMd) {
          useAgentStore.getState().updateTaskMd(taskMd);
        }


      } catch (error) {
        console.error('[Event Bridge] Failed to load session state:', error);
      }
    };

    // Clear old data then load new
    useAgentStore.getState().clearForSession();
    loadSessionState();
  }, [sessionId]);

  // File watcher subscription with proper cleanup
  useEffect(() => {
    if (!orchide || !activeWorkspace) return;

    const unsubscribe = orchide.watcher.subscribe(
      async (event: { type: string; path: string }) => {
        // Refresh file tree for any file system change
        useWorkspaceStore.getState().refreshFileTree();

        // If an open file changed externally, reload its content
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

    return unsubscribe;
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
      <div className="app-body" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {isLeftSidebarOpen && (
          <div id="left-sidebar">
            <Sidebar />
          </div>
        )}
        <div id="main-content">
          <ChatPanel />
        </div>
        {isEditorOpen && (
          <div id="editor-panel">
            <EditorPanel />
          </div>
        )}
        {isRightSidebarOpen && (
          <div id="right-sidebar">
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
