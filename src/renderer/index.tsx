/**
 * Main renderer entry point
 * Handles app initialization, routing, and global event subscriptions
 */

import './styles/global.css';
import React, { useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './layouts/Sidebar/Sidebar';
import { RightSidebar } from './layouts/RightSidebar/RightSidebar';
import { ChatPanel } from './panels/ChatPanel/ChatPanel';
import { EditorPanel } from './panels/EditorPanel/EditorPanel';
import { TitleBar } from './layouts/TitleBar/TitleBar';
import { SettingsWindow } from './views/SettingsWindow/SettingsWindow';
import { useLayoutStore } from './store/layoutStore';
import { useChatStore } from './store/chatStore';
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
  const openFiles = useWorkspaceStore(state => state.openFiles);

  // Initialize session ID on first mount
  useEffect(() => {
    if (!sessionId) {
      setSessionId(uuidv4());
    }
  }, [sessionId, setSessionId]);

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
            // Only reload if the file isn't dirty (user hasn't made changes)
            const result = await orchide.fs.readFile(event.path);
            if (result?.content != null) {
              useWorkspaceStore.getState().updateFileContent(event.path, result.content, false);
            }
          }
        }
      }
    );

    return unsubscribe;
  }, [activeWorkspace?.path]); // Only re-subscribe when workspace path changes

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

console.log('[OrchIDE] Initialized');
