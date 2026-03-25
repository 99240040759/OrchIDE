import { create } from 'zustand';

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

interface AgentState {
  taskTitle: string;
  taskItems: TaskItem[];
  rawTaskMd: string;
  artifacts: Artifact[];
  filesChanged: FileChange[];
  // Actions
  updateTaskMd: (md: string) => void;
  addArtifact: (artifact: Artifact) => void;
  setArtifacts: (artifacts: Artifact[]) => void;
  addFileChange: (change: FileChange) => void;
  setFilesChanged: (changes: FileChange[]) => void;
  clearForSession: () => void;
}

function parseTaskMd(md: string): { title: string; items: TaskItem[] } {
  const lines = md.split('\n');
  let title = 'Task Progress';
  const items: TaskItem[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    // Match: [x], [ ], [/] checklist items at any indent level
    const match = line.match(/^(\s*)[-*]\s+\[([ x/])\]\s+(.+)$/);
    if (match) {
      const indent = match[1].length;
      const statusChar = match[2];
      const text = match[3].trim();
      const status: TaskItem['status'] =
        statusChar === 'x' ? 'done' :
        statusChar === '/' ? 'in-progress' : 'todo';
      items.push({
        id: `${items.length}`,
        text,
        status,
        depth: Math.floor(indent / 2),
      });
    }
  }

  return { title, items };
}

export const useAgentStore = create<AgentState>((set) => ({
  taskTitle: '',
  taskItems: [],
  rawTaskMd: '',
  artifacts: [],
  filesChanged: [],

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

  clearForSession: () => set({
    taskTitle: '', taskItems: [], rawTaskMd: '', artifacts: [], filesChanged: [],
  }),
}));
