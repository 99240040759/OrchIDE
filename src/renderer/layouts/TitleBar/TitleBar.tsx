import React from 'react';
import { Icon } from '../../components/ui/Icon';
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
    const electron = (window as { electron?: { openSettings?: () => void } }).electron;
    if (electron?.openSettings) {
      electron.openSettings();
    }
  };

  const titleCenter = activeWorkspace
    ? <>OrchIDE <span className="title-sep">/</span> <span className="title-workspace">{activeWorkspace.name}</span>{taskTitle && <><span className="title-sep"> / </span><span className="title-task">{taskTitle}</span></>}</>
    : <><span className="title-orch">OrchIDE</span></>;

  const isMac = navigator.userAgent.toLowerCase().includes('mac');
  const isWin = navigator.userAgent.toLowerCase().includes('win');

  return (
    <div id="title-bar">
      <div className={`titlebar-actions left ${isMac ? 'mac' : ''}`}>
        <button className={`toggle-sidebar-btn ${isLeftSidebarOpen ? 'active' : ''}`} onClick={toggleLeftSidebar} title="Toggle Left Sidebar">
          <Icon name="layout-sidebar-left" size={16} />
        </button>
      </div>

      <div id="title">{titleCenter}</div>

      <div className={`titlebar-actions right ${isWin ? 'win' : ''}`}>
        <button className={`toggle-sidebar-btn text-btn ${isEditorOpen ? 'active' : ''}`} onClick={toggleEditor} title="Toggle Editor">
          <Icon name="code" size={14} />
          <span>Editor</span>
        </button>
        <button className={`toggle-sidebar-btn ${isRightSidebarOpen ? 'active' : ''}`} onClick={toggleRightSidebar} title="Toggle Right Sidebar">
          <Icon name="layout-sidebar-right" size={16} />
        </button>
        <button className="toggle-sidebar-btn icon-only" onClick={handleOpenSettings} title="Settings">
          <Icon name="settings-gear" size={16} />
        </button>
      </div>
    </div>
  );
};
