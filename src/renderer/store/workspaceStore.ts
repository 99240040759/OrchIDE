/**
 * Workspace store - manages active workspace, file tree, and open files
 * Uses Zustand for state management
 */

import { create } from 'zustand';
import type { FileEntry, OpenFile, AgentMode } from '../../shared/types';
import type { OrchideAPI } from '../../types/electron.d';

// Re-export types for convenience
export type { FileEntry, OpenFile };

// Type-safe window accessor
function getOrchideAPI(): OrchideAPI | undefined {
  return (window as Window & { orchide?: OrchideAPI }).orchide;
}

interface WorkspaceState {
  // Active workspace
  activeWorkspace: { path: string; name: string } | null;
  mode: AgentMode;

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
    set({
      activeWorkspace: workspace,
      mode: workspace ? 'agentic' : 'chat',
      fileTree: [],
      openFiles: [],
      activeFilePath: null,
    });
    if (workspace) {
      get().refreshFileTree();
    }
  },

  setFileTree: (tree) => set({ fileTree: tree }),

  refreshFileTree: async () => {
    const ws = get().activeWorkspace;
    if (!ws) return;

    try {
      const orchide = getOrchideAPI();
      if (!orchide) return;

      const result = await orchide.fs.listDir(ws.path);
      if (result?.entries) {
        set({ fileTree: result.entries });
      }
    } catch (error) {
      console.error('[WorkspaceStore] Failed to refresh file tree:', error);
    }
  },

  openFile: (file) => {
    const { openFiles, activeFilePath } = get();
    const existing = openFiles.find(f => f.path === file.path);

    if (existing) {
      // File already open, just activate it
      if (file.path !== activeFilePath) {
        set({ activeFilePath: file.path });
      }
    } else {
      // Add new file to open files
      set({
        openFiles: [...openFiles, file],
        activeFilePath: file.path,
      });
    }
  },

  closeFile: (filePath) => {
    set((state) => {
      const newFiles = state.openFiles.filter(f => f.path !== filePath);
      let newActive = state.activeFilePath;

      // If we closed the active file, activate the last remaining file
      if (state.activeFilePath === filePath) {
        newActive = newFiles.length > 0 ? newFiles[newFiles.length - 1].path : null;
      }

      return { openFiles: newFiles, activeFilePath: newActive };
    });
  },

  setActiveFile: (filePath) => set({ activeFilePath: filePath }),

  updateFileContent: (filePath, content, isDirty = true) => {
    set((state) => ({
      openFiles: state.openFiles.map(f =>
        f.path === filePath ? { ...f, content, isDirty } : f
      ),
    }));
  },
}));
