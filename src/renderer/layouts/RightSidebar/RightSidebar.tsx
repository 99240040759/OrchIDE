/**
 * RightSidebar component - Task progress, artifacts, and file changes
 * Uses shared utilities for language detection
 */

import React, { useCallback } from 'react';
import { Icon } from '../../components/ui/Icon';
import { useAgentStore } from '../../store/agentStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { getOrchideAPI } from '../../utils/orchide';
import './RightSidebar.css';

const ARTIFACT_ICONS: Record<string, React.ReactNode> = {
  Map: <Icon name="git-pull-request" size={14} />,
  BookOpen: <Icon name="book" size={14} />,
  ListTodo: <Icon name="checklist" size={14} />,
  FileText: <Icon name="file" size={14} />,
};

const orchide = getOrchideAPI();

export const RightSidebar: React.FC = () => {
  const taskTitle = useAgentStore(state => state.taskTitle);
  const taskItems = useAgentStore(state => state.taskItems);
  const artifacts = useAgentStore(state => state.artifacts);
  const agentState = useAgentStore(state => state.agentState);

  const openFile = useWorkspaceStore(state => state.openFile);

  const completedCount = taskItems.filter(t => t.status === 'done').length;
  const totalCount = taskItems.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Open an artifact file
  const openArtifact = useCallback(async (filePath: string, name: string) => {
    if (!orchide) return;

    const result = await orchide.fs.readFile(filePath);
    if (result?.content != null) {
      openFile({
        path: filePath,
        name,
        content: result.content,
        isDirty: false,
        language: 'markdown',
      });
      useLayoutStore.getState().setEditorOpen(true);
    }
  }, [openFile]);

  return (
    <div className="right-sidebar-container">

      {/* AGENT STATE INDICATOR */}
      {agentState !== 'idle' && (
        <div className={`rs-agent-state ${agentState}`}>
          {agentState === 'generating' && (
            <>
              <Icon name="loading" size={13} spin className="spin" />
              <span>Agent working…</span>
            </>
          )}
          {agentState === 'error' && (
            <>
              <span className="error-dot">●</span>
              <span>Agent error</span>
            </>
          )}
        </div>
      )}

      {/* TASK PROGRESS */}
      <div className="rs-section">
        <div className="rs-header">
          <span>{taskTitle || 'Progress'}</span>
          <Icon name="link-external" size={12} className="header-icon" />
        </div>
        {taskItems.length === 0 ? (
          <div className="rs-empty">No active task</div>
        ) : (
          <>
            {totalCount > 0 && (
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                <span className="progress-label">{completedCount}/{totalCount}</span>
              </div>
            )}
            <div className="task-list">
              {taskItems.map(item => (
                <div
                  key={item.id}
                  className={`rs-item text-muted task-item-entry depth-${Math.min(item.depth, 2)}`}
                >
                  {item.status === 'done' && <Icon name="pass" size={13} className="item-icon accent check" />}
                  {item.status === 'in-progress' && <Icon name="loading" spin size={13} className="item-icon accent spin" />}
                  {item.status === 'todo' && <Icon name="circle-outline" size={13} className="item-icon" />}
                  <span className={`item-text ${item.status === 'done' ? 'done' : ''}`}>{item.text}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ARTIFACTS */}
      <div className="rs-section">
        <div className="rs-header">
          <span>Artifacts</span>
          <Icon name="info" size={12} className="header-icon" />
        </div>
        {artifacts.length === 0 ? (
          <div className="rs-empty">No artifacts yet</div>
        ) : (
          artifacts.map(artifact => (
            <div
              key={artifact.id}
              className="rs-item artifact-item"
              onClick={() => openArtifact(artifact.filePath, artifact.name)}
              title={artifact.filePath}
            >
              <span className="artifact-icon">
                {ARTIFACT_ICONS[artifact.icon] || <Icon name="file" size={14} />}
              </span>
              <div className="artifact-info">
                <span className="item-text bold">{artifact.name}</span>
                <span className="artifact-type">{artifact.type.replace('_', ' ')}</span>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
