/**
 * Agent Store — Cognitive Architecture State
 *
 * Tracks the agent's live cognitive state: task progress, artifacts,
 * file changes, and current lifecycle phase.
 * All data flows from IPC events emitted by the main-process AgentSession.
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface TaskItem {
  id: string;
  text: string;
  status: 'todo' | 'in-progress' | 'done';
  depth: number;
}

export interface Artifact {
  id: string;
  name: string;
  type: 'implementation_plan' | 'walkthrough' | 'task' | 'other';
  filePath: string;
  icon: string;
  sessionId: string;
}

export interface FileChange {
  id: string;
  filePath: string;
  status: 'added' | 'modified' | 'deleted';
}

/** Agent lifecycle phase — drives UI indicators */
export type AgentState = 'idle' | 'generating' | 'error';

interface AgentStoreState {
  // Task tracking
  taskTitle: string;
  taskItems: TaskItem[];
  rawTaskMd: string;

  // Artifacts and files
  artifacts: Artifact[];
  filesChanged: FileChange[];

  // Agent state
  agentState: AgentState;

  // Actions - Task
  updateTaskMd: (md: string) => void;

  // Actions - Artifacts
  addArtifact: (artifact: Artifact) => void;
  setArtifacts: (artifacts: Artifact[]) => void;

  // Actions - Files
  addFileChange: (change: FileChange) => void;
  setFilesChanged: (changes: FileChange[]) => void;

  // Actions - Agent state
  setAgentState: (state: AgentState) => void;

  // Actions - Session lifecycle
  clearForSession: () => void;
}

// ============================================================================
// Markdown → TaskItem parser
// ============================================================================

function parseTaskMd(md: string): { title: string; items: TaskItem[] } {
  const cleaned = md
    .replace(/^\s*```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');

  const lines = cleaned.split('\n');
  let title = 'Task Progress';
  const items: TaskItem[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^\s*#{1,6}\s+(.+)$/);
    if (headingMatch && headingMatch[1]) {
      title = headingMatch[1].trim();
      continue;
    }

    // [x] done, [/] in-progress, [ ] todo
    const checkboxMatch = line.match(/^(\s*)(?:[-*+]\s+|\d+\.\s+)?\[\s*([xX/\- ])\s*\]\s+(.+)$/);
    if (checkboxMatch) {
      const indent = checkboxMatch[1].replace(/\t/g, '  ').length;
      const statusChar = checkboxMatch[2];
      const text = checkboxMatch[3].trim();
      const status: TaskItem['status'] =
        statusChar.toLowerCase() === 'x' ? 'done' :
        statusChar === '/' ? 'in-progress' : 'todo';

      items.push({
        id: `${items.length}`,
        text,
        status,
        depth: Math.floor(indent / 2),
      });
      continue;
    }

    // Plain list items → todo
    const plainListMatch = line.match(/^(\s*)(?:[-*+]\s+|\d+\.\s+)(.+)$/);
    if (plainListMatch) {
      const indent = plainListMatch[1].replace(/\t/g, '  ').length;
      const text = plainListMatch[2].trim();
      if (!text) continue;

      items.push({
        id: `${items.length}`,
        text,
        status: 'todo',
        depth: Math.floor(indent / 2),
      });
    }
  }

  if (items.length === 0) {
    const fallback = lines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))[0];

    if (fallback) {
      items.push({ id: '0', text: fallback, status: 'in-progress', depth: 0 });
    } else {
      items.push({ id: '0', text: `Working on ${title}`, status: 'in-progress', depth: 0 });
    }
  }

  return { title, items };
}

// ============================================================================
// Store
// ============================================================================

export const useAgentStore = create<AgentStoreState>((set) => ({
  taskTitle: '',
  taskItems: [],
  rawTaskMd: '',
  artifacts: [],
  filesChanged: [],
  agentState: 'idle',

  updateTaskMd: (md) => {
    const { title, items } = parseTaskMd(md);
    set({ rawTaskMd: md, taskTitle: title, taskItems: items });
  },

  addArtifact: (artifact) => {
    set(state => {
      const existing = state.artifacts.findIndex(a => a.id === artifact.id);
      if (existing >= 0) {
        const updated = [...state.artifacts];
        updated[existing] = artifact;
        return { artifacts: updated };
      }
      return { artifacts: [...state.artifacts, artifact] };
    });
  },

  setArtifacts: (artifacts) => set({ artifacts }),

  addFileChange: (change) => {
    set(state => {
      const existing = state.filesChanged.findIndex(f => f.filePath === change.filePath);
      if (existing >= 0) {
        const updated = [...state.filesChanged];
        updated[existing] = change;
        return { filesChanged: updated };
      }
      return { filesChanged: [...state.filesChanged, change] };
    });
  },

  setFilesChanged: (changes) => set({ filesChanged: changes }),

  setAgentState: (agentState) => set({ agentState }),

  clearForSession: () => set({
    taskTitle: '',
    taskItems: [],
    rawTaskMd: '',
    artifacts: [],
    filesChanged: [],
    agentState: 'idle',
  }),
}));
