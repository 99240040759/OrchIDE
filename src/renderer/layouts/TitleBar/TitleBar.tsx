import React from 'react';
import { Icon } from '../../components/ui/Icon';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAgentStore } from '../../store/agentStore';
import { cn } from '@/lib/utils';

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

  const isMac = navigator.userAgent.toLowerCase().includes('mac');
  const isWin = navigator.userAgent.toLowerCase().includes('win');

  const titleCenter = activeWorkspace ? (
    <>
      OrchIDE{' '}
      <span className="text-orch-fg2 mx-1">/</span>{' '}
      <span className="text-orch-fg font-semibold">{activeWorkspace.name}</span>
      {taskTitle && (
        <>
          <span className="text-orch-fg2 mx-1">/</span>
          <span className="text-orch-fg2 font-normal max-w-[200px] truncate inline-block align-middle">{taskTitle}</span>
        </>
      )}
    </>
  ) : (
    <span className="text-orch-fg tracking-[0.3px]">OrchIDE</span>
  );

  return (
    <div
      id="title-bar"
      className="flex items-center justify-between w-full bg-orch-surface border-b border-orch-border select-none flex-shrink-0 text-[13px] font-medium"
      style={{ height: 'var(--titlebar-height)', WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left actions */}
      <div
        className={cn('flex items-center gap-1 h-full', isMac ? 'pl-[88px]' : 'pl-3')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <TitleBarButton active={isLeftSidebarOpen} onClick={toggleLeftSidebar} title="Toggle Left Sidebar">
          <Icon name="layout-sidebar-left" size={16} />
        </TitleBarButton>
      </div>

      {/* Center title */}
      <div className="flex-1 text-center px-4 opacity-90 tracking-[0.2px] pointer-events-none text-orch-fg">
        {titleCenter}
      </div>

      {/* Right actions */}
      <div
        className={cn('flex items-center gap-1 h-full', isWin ? 'pr-[calc(env(titlebar-area-width,140px)+8px)]' : 'pr-3')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <TitleBarButton
          active={isEditorOpen}
          onClick={toggleEditor}
          title="Toggle Editor"
          textBtn
        >
          <Icon name="code" size={14} />
          <span>Editor</span>
        </TitleBarButton>
        <TitleBarButton active={isRightSidebarOpen} onClick={toggleRightSidebar} title="Toggle Right Sidebar">
          <Icon name="layout-sidebar-right" size={16} />
        </TitleBarButton>
        <TitleBarButton onClick={handleOpenSettings} title="Settings">
          <Icon name="settings-gear" size={16} />
        </TitleBarButton>
      </div>
    </div>
  );
};

const TitleBarButton: React.FC<{
  active?: boolean;
  onClick: () => void;
  title: string;
  textBtn?: boolean;
  children: React.ReactNode;
}> = ({ active, onClick, title, textBtn, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={cn(
      'flex items-center justify-center gap-1.5 h-[26px] rounded-[5px] border border-transparent',
      'text-orch-fg2 cursor-pointer transition-colors duration-100',
      'hover:text-orch-fg hover:bg-white/5',
      textBtn
        ? 'px-2.5 w-auto text-[12px] font-medium bg-white/[0.03] border-white/5 hover:bg-white/[0.08]'
        : 'w-[28px] px-0',
      active && (textBtn
        ? 'text-white bg-white/10 border-white/10'
        : 'text-white')
    )}
  >
    {children}
  </button>
);
