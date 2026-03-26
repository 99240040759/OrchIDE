/**
 * RightSidebar component - Task progress, artifacts, and file changes
 * Uses shared utilities for language detection
 */

import React, { useCallback } from 'react';
import {
  ExternalLink, Info, CheckCircle2, Circle, Loader2,
  FileText, ListTodo, BookOpen, Map,
  Plus, Minus, Edit3
} from 'lucide-react';
import { useAgentStore } from '../../store/agentStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { getLanguageFromFilename } from '../../../shared/utils/languageUtils';
import { getFilename } from '../../../shared/utils/pathUtils';
import './RightSidebar.css';

const ARTIFACT_ICONS: Record<string, React.ReactNode> = {
  Map: <Map size={14} />,
  BookOpen: <BookOpen size={14} />,
  ListTodo: <ListTodo size={14} />,
  FileText: <FileText size={14} />,
};

const FILE_STATUS_ICONS: Record<string, React.ReactNode> = {
  added: <Plus size={11} className="status-icon added" />,
  modified: <Edit3 size={11} className="status-icon modified" />,
  deleted: <Minus size={11} className="status-icon deleted" />,
};

const orchide = (window as any).orchide;

export const RightSidebar: React.FC = () => {
  const taskTitle = useAgentStore(state => state.taskTitle);
  const taskItems = useAgentStore(state => state.taskItems);
  const artifacts = useAgentStore(state => state.artifacts);
  const filesChanged = useAgentStore(state => state.filesChanged);
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

  // Open a changed file
  const openChangedFile = useCallback(async (filePath: string) => {
    if (!orchide) return;

    const result = await orchide.fs.readFile(filePath);
    const name = getFilename(filePath);

    if (result?.content != null) {
      openFile({
        path: filePath,
        name,
        content: result.content,
        isDirty: false,
        language: getLanguageFromFilename(name),
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
              <Loader2 size={13} className="spin" />
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
          <ExternalLink size={12} className="header-icon" />
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
                  {item.status === 'done' && <CheckCircle2 size={13} className="item-icon accent check" />}
                  {item.status === 'in-progress' && <Loader2 size={13} className="item-icon accent spin" />}
                  {item.status === 'todo' && <Circle size={13} className="item-icon" />}
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
          <Info size={12} className="header-icon" />
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
                {ARTIFACT_ICONS[artifact.icon] || <FileText size={14} />}
              </span>
              <div className="artifact-info">
                <span className="item-text bold">{artifact.name}</span>
                <span className="artifact-type">{artifact.type.replace('_', ' ')}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* FILES CHANGED */}
      <div className="rs-section">
        <div className="rs-header">
          <span>Files Changed</span>
        </div>
        {filesChanged.length === 0 ? (
          <div className="rs-empty text-muted">No file changes</div>
        ) : (
          filesChanged.map(fc => {
            const name = getFilename(fc.filePath);
            return (
              <div
                key={fc.id}
                className="rs-item file-change-item"
                onClick={() => fc.status !== 'deleted' && openChangedFile(fc.filePath)}
                title={fc.filePath}
              >
                <span className="file-change-status">{FILE_STATUS_ICONS[fc.status]}</span>
                <span className={`item-text file-change-name ${fc.status}`}>{name}</span>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
