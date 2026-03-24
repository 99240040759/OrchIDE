import './styles/global.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './layouts/Sidebar/Sidebar';
import { RightSidebar } from './layouts/RightSidebar/RightSidebar';
import { ChatPanel } from './panels/ChatPanel/ChatPanel';
import { EditorPanel } from './panels/EditorPanel/EditorPanel';
import { TitleBar } from './layouts/TitleBar/TitleBar';
import { SettingsWindow } from './views/SettingsWindow/SettingsWindow';

const platform = window.electron?.platform || 'unknown';
document.body.classList.add(`platform-${platform}`);

if ('windowControlsOverlay' in navigator) {
  navigator.windowControlsOverlay.addEventListener('geometrychange', (e: any) => {
    console.log('Title bar geometry changed', e.titlebarAreaRect);
  });
}

import { useLayoutStore } from './store/layoutStore';

const App = () => {
  const { isLeftSidebarOpen, isRightSidebarOpen, isEditorOpen } = useLayoutStore();

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

console.log('OrchIDE Initialized');
