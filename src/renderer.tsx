import './index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './components/Sidebar/Sidebar';
import { RightSidebar } from './components/RightSidebar/RightSidebar';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { EditorPanel } from './components/EditorPanel/EditorPanel';
import { TitleBar } from './components/TitleBar/TitleBar';
import { SettingsWindow } from './components/SettingsWindow/SettingsWindow';

const platform = window.electron?.platform || 'unknown';
document.body.classList.add(`platform-${platform}`);

if ('windowControlsOverlay' in navigator) {
  navigator.windowControlsOverlay.addEventListener('geometrychange', (e: any) => {
    console.log('Title bar geometry changed', e.titlebarAreaRect);
  });
}

const App = () => {
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  return (
    <>
      <TitleBar 
        isLeftSidebarOpen={isLeftSidebarOpen} 
        onToggleLeftSidebar={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)} 
        isRightSidebarOpen={isRightSidebarOpen}
        onToggleRightSidebar={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
        isEditorOpen={isEditorOpen}
        onToggleEditor={() => setIsEditorOpen(!isEditorOpen)}
        onOpenSettings={() => {
          if ((window as any).electron?.openSettings) {
            (window as any).electron.openSettings();
          }
        }}
      />
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

console.log('OrchIDE Initialized');
