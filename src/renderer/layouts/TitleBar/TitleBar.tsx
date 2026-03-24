import React from 'react';
import { PanelLeft, PanelRight, MoreHorizontal, CodeXml, Settings } from 'lucide-react';
import { useLayoutStore } from '../../store/layoutStore';
import './TitleBar.css';

export const TitleBar: React.FC = () => {
  const { 
    isLeftSidebarOpen, 
    isRightSidebarOpen, 
    isEditorOpen, 
    toggleLeftSidebar, 
    toggleRightSidebar, 
    toggleEditor 
  } = useLayoutStore();

  const handleOpenSettings = () => {
    if ((window as any).electron?.openSettings) {
      (window as any).electron.openSettings();
    }
  };
  return (
    <div id="title-bar">
      <div className="titlebar-actions left">
        <button className="toggle-sidebar-btn" onClick={toggleLeftSidebar} title="Toggle Left Sidebar">
          <PanelLeft size={16} opacity={isLeftSidebarOpen ? 1 : 0.6} />
        </button>
      </div>
      
      <div id="title">
        OrchIDE <span className="title-muted">/ Researching VS Code Iconography</span>
      </div>

      <div className="titlebar-actions right">
        <button className="toggle-sidebar-btn icon-only" onClick={handleOpenSettings} title="Settings">
          <Settings size={16} />
        </button>
        <button className="toggle-sidebar-btn icon-only">
          <MoreHorizontal size={16} />
        </button>
        <button className="toggle-sidebar-btn" onClick={toggleEditor} title="Toggle Editor">
          <CodeXml size={16} opacity={isEditorOpen ? 1 : 0.6} />
        </button>
        <button className="toggle-sidebar-btn" onClick={toggleRightSidebar} title="Toggle Right Sidebar">
          <PanelRight size={16} opacity={isRightSidebarOpen ? 1 : 0.6} />
        </button>
      </div>
    </div>
  );
};
