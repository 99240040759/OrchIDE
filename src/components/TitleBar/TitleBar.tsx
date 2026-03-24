import React from 'react';
import { PanelLeft, PanelRight, MoreHorizontal, CodeXml, Settings } from 'lucide-react';
import './TitleBar.css';

interface TitleBarProps {
  onToggleLeftSidebar: () => void;
  isLeftSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  isRightSidebarOpen: boolean;
  onToggleEditor: () => void;
  isEditorOpen: boolean;
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ 
  onToggleLeftSidebar, 
  isLeftSidebarOpen,
  onToggleRightSidebar,
  isRightSidebarOpen,
  onToggleEditor,
  isEditorOpen,
  onOpenSettings
}) => {
  return (
    <div id="title-bar">
      <div className="titlebar-actions left">
        <button className="toggle-sidebar-btn" onClick={onToggleLeftSidebar} title="Toggle Left Sidebar">
          <PanelLeft size={16} opacity={isLeftSidebarOpen ? 1 : 0.6} />
        </button>
      </div>
      
      <div id="title">
        OrchIDE <span className="title-muted">/ Researching VS Code Iconography</span>
      </div>

      <div className="titlebar-actions right">
        <button className="toggle-sidebar-btn icon-only" onClick={onOpenSettings} title="Settings">
          <Settings size={16} />
        </button>
        <button className="toggle-sidebar-btn icon-only">
          <MoreHorizontal size={16} />
        </button>
        <button className="toggle-sidebar-btn" onClick={onToggleEditor} title="Toggle Editor">
          <CodeXml size={16} opacity={isEditorOpen ? 1 : 0.6} />
        </button>
        <button className="toggle-sidebar-btn" onClick={onToggleRightSidebar} title="Toggle Right Sidebar">
          <PanelRight size={16} opacity={isRightSidebarOpen ? 1 : 0.6} />
        </button>
      </div>
    </div>
  );
};
