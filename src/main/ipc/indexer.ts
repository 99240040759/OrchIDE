import { ipcMain } from 'electron';
import { WorkspaceIndexer } from '../agent/indexer/WorkspaceIndexer';
import { watcherEvents } from './watcher';

// Active indexers
const activeIndexers = new Map<string, WorkspaceIndexer>();

export function getWorkspaceIndexer(workspacePath: string): WorkspaceIndexer {
  if (!activeIndexers.has(workspacePath)) {
    const indexer = new WorkspaceIndexer(workspacePath);
    activeIndexers.set(workspacePath, indexer);
    // Auto start on creation
    indexer.startInitialIndex();
  }
  return activeIndexers.get(workspacePath)!;
}

export function registerIndexerIPC(): void {
  // Industrial Grade: Auto-start indexer when a workspace is opened in the file tree
  watcherEvents.on('watcher_started', (workspacePath: string) => {
    console.log(`[Indexer IPC] Auto-starting indexer for: ${workspacePath}`);
    getWorkspaceIndexer(workspacePath);
  });

  // Get indexer instance (starts and hooks up automatically if not existing)
  ipcMain.handle('indexer:connect', async (_event, workspacePath: string) => {
    try {
      const indexer = getWorkspaceIndexer(workspacePath);
      const status = indexer.getStatus();
      return { 
        connected: true,
        isIndexing: status.isIndexing,
        progress: status.progress,
        completed: status.completed,
        total: status.total
      };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Reindex explicitly
  ipcMain.handle('indexer:reindex', async (_event, workspacePath: string) => {
    try {
      const indexer = getWorkspaceIndexer(workspacePath);
      await indexer.reindexAll();
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Query Indexer status/state
  ipcMain.handle('indexer:status', async (_event, workspacePath: string) => {
    if (!activeIndexers.has(workspacePath)) {
      return { active: false };
    }
    // We can infer it's active
    return { active: true };
  });
}
