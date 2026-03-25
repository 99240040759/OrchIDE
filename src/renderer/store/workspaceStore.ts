import { create } from 'zustand';

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  ext?: string;
  children?: FileEntry[];
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: string;
}

interface WorkspaceState {
  // Active workspace
  activeWorkspace: { path: string; name: string } | null;
  mode: 'chat' | 'agentic';
  // File tree
  fileTree: FileEntry[];
  // Open files in editor
  openFiles: OpenFile[];
  activeFilePath: string | null;
  // Actions
  setWorkspace: (workspace: { path: string; name: string } | null) => void;
  setFileTree: (tree: FileEntry[]) => void;
  openFile: (file: OpenFile) => void;
  closeFile: (filePath: string) => void;
  setActiveFile: (filePath: string) => void;
  updateFileContent: (filePath: string, content: string, isDirty?: boolean) => void;
  refreshFileTree: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeWorkspace: null,
  mode: 'chat',
  fileTree: [],
  openFiles: [],
  activeFilePath: null,

  setWorkspace: (workspace) => {
    set({ activeWorkspace: workspace, mode: workspace ? 'agentic' : 'chat', fileTree: [] });
    if (workspace) {
      get().refreshFileTree();
    }
  },

  setFileTree: (tree) => set({ fileTree: tree }),

  refreshFileTree: async () => {
    const ws = get().activeWorkspace;
    if (!ws) return;
    const result = await (window as any).orchide.fs.listDir(ws.path);
    if (result.entries) {
      set({ fileTree: result.entries });
    }
  },

  openFile: (file) => {
    const existing = get().openFiles.find(f => f.path === file.path);
    if (!existing) {
      set(state => ({ openFiles: [...state.openFiles, file] }));
    }
    set({ activeFilePath: file.path });
  },

  closeFile: (filePath) => {
    set(state => {
      const newFiles = state.openFiles.filter(f => f.path !== filePath);
      const newActive = state.activeFilePath === filePath
        ? (newFiles.length > 0 ? newFiles[newFiles.length - 1].path : null)
        : state.activeFilePath;
      return { openFiles: newFiles, activeFilePath: newActive };
    });
  },

  setActiveFile: (filePath) => set({ activeFilePath: filePath }),

  updateFileContent: (filePath, content, isDirty = true) => {
    set(state => ({
      openFiles: state.openFiles.map(f =>
        f.path === filePath ? { ...f, content, isDirty } : f
      ),
    }));
  },
}));
