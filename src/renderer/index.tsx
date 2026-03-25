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
import { useWorkspaceStore } from './store/workspaceStore';
import { useAgentStore } from './store/agentStore';
import { v4 as uuidv4 } from 'uuid';

const platform = (window as any).electron?.platform || 'unknown';
document.body.classList.add(`platform-${platform}`);

const orchide = (window as any).orchide;

const App = () => {
  const { isLeftSidebarOpen, isRightSidebarOpen, isEditorOpen } = useLayoutStore();
  const { setSessionId, sessionId } = useChatStore();
  const { activeWorkspace, refreshFileTree } = useWorkspaceStore();

  // Initialize session ID on first mount
  useEffect(() => {
    if (!sessionId) {
      setSessionId(uuidv4());
    }
  }, []);

  // File watcher events → refresh file tree
  useEffect(() => {
    if (!orchide || !activeWorkspace) return;
    orchide.watcher.onEvent((_event: any) => {
      refreshFileTree();
    });
    return () => orchide.watcher.offEvent();
  }, [activeWorkspace, refreshFileTree]);

  // Auto-open sidebars in workspace mode
  useEffect(() => {
    const { setLeftSidebarOpen, setRightSidebarOpen } = useLayoutStore.getState();
    if (activeWorkspace) {
      setLeftSidebarOpen(true);
      setRightSidebarOpen(true);
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

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  if (window.location.hash === '#/settings') {
    root.render(
      <SettingsWindow onClose={() => {
        if ((window as any).electron?.closeWindow) {
          (window as any).electron.closeWindow();
        } else {
          window.close();
        }
      }} />
    );
  } else {
    root.render(<App />);
  }
}

console.log('OrchIDE Initialized — Agentic Mode Active');
