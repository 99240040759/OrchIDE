import React from 'react';
import { PanelLeft, PanelRight, MoreHorizontal, CodeXml, Settings } from 'lucide-react';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAgentStore } from '../../store/agentStore';
import './TitleBar.css';

export const TitleBar: React.FC = () => {
  const {
    isLeftSidebarOpen, isRightSidebarOpen, isEditorOpen,
    toggleLeftSidebar, toggleRightSidebar, toggleEditor
  } = useLayoutStore();

  const { activeWorkspace } = useWorkspaceStore();
  const { taskTitle } = useAgentStore();

  const handleOpenSettings = () => {
    if ((window as any).electron?.openSettings) {
      (window as any).electron.openSettings();
    }
  };

  const titleCenter = activeWorkspace
    ? <>OrchIDE <span className="title-sep">/</span> <span className="title-workspace">{activeWorkspace.name}</span>{taskTitle && <><span className="title-sep"> / </span><span className="title-task">{taskTitle}</span></>}</>
    : <><span className="title-orch">OrchIDE</span></>;

  return (
    <div id="title-bar">
      <div className="titlebar-actions left">
        <button className="toggle-sidebar-btn" onClick={toggleLeftSidebar} title="Toggle Left Sidebar">
          <PanelLeft size={15} opacity={isLeftSidebarOpen ? 1 : 0.5} />
        </button>
      </div>

      <div id="title">{titleCenter}</div>

      <div className="titlebar-actions right">
        <button className="toggle-sidebar-btn icon-only" onClick={handleOpenSettings} title="Settings">
          <Settings size={15} />
        </button>
        <button className="toggle-sidebar-btn icon-only" title="More options">
          <MoreHorizontal size={15} />
        </button>
        <button className="toggle-sidebar-btn" onClick={toggleEditor} title="Toggle Editor">
          <CodeXml size={15} opacity={isEditorOpen ? 1 : 0.5} />
        </button>
        <button className="toggle-sidebar-btn" onClick={toggleRightSidebar} title="Toggle Right Sidebar">
          <PanelRight size={15} opacity={isRightSidebarOpen ? 1 : 0.5} />
        </button>
      </div>
    </div>
  );
};
