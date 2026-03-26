/**
 * File Watcher IPC handlers
 * Provides real-time file system change notifications using chokidar
 * Automatically cleans up when the watching window is closed
 */

import { ipcMain, BrowserWindow } from 'electron';
import chokidar, { FSWatcher } from 'chokidar';
import { shouldIgnore } from '../../shared/utils/pathUtils';

// Watcher state
let activeWatcher: FSWatcher | null = null;
let watcherWindowId: number | null = null;
let windowCloseHandler: (() => void) | null = null;

/**
 * Build ignore regex from shouldIgnore function
 * This ensures watcher ignores the same patterns as file operations
 */
function buildIgnoreFunction(): (path: string) => boolean {
  return (filePath: string) => {
    // Extract the filename from the path
    const parts = filePath.split(/[/\\]/);
    const name = parts[parts.length - 1];
    return shouldIgnore(name);
  };
}

/**
 * Clean up the active watcher
 */
async function cleanupWatcher(): Promise<void> {
  if (activeWatcher) {
    try {
      await activeWatcher.close();
    } catch (err) {
      console.error('[Watcher] Error closing watcher:', err);
    }
    activeWatcher = null;
  }

  // Remove window close listener if exists
  if (watcherWindowId !== null && windowCloseHandler) {
    const win = BrowserWindow.fromId(watcherWindowId);
    if (win && !win.isDestroyed()) {
      win.removeListener('closed', windowCloseHandler);
    }
  }

  watcherWindowId = null;
  windowCloseHandler = null;
}

/**
 * Register watcher IPC handlers
 */
export function registerWatcherIPC(): void {
  // Start watching a workspace
  ipcMain.handle('watcher:start', async (event, workspacePath: string) => {
    // Clean up any existing watcher
    await cleanupWatcher();

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      console.error('[Watcher] No window found for watcher start request');
      return { started: false, error: 'No window found' };
    }

    watcherWindowId = win.id;

    // Set up window close handler
    windowCloseHandler = () => {
      console.log('[Watcher] Window closed, cleaning up watcher');
      cleanupWatcher();
    };
    win.once('closed', windowCloseHandler);

    // Create the watcher with ignore function derived from canonical list
    try {
      activeWatcher = chokidar.watch(workspacePath, {
        ignored: buildIgnoreFunction(),
        persistent: true,
        ignoreInitial: true,
        depth: 10,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      // Helper to send events to the window
      const sendEvent = (type: string, filePath: string): void => {
        if (watcherWindowId === null) return;

        const w = BrowserWindow.fromId(watcherWindowId);
        if (w && !w.isDestroyed()) {
          w.webContents.send('watcher:event', { type, path: filePath });
        }
      };

      // Register event handlers
      activeWatcher.on('add', (p) => sendEvent('add', p));
      activeWatcher.on('change', (p) => sendEvent('change', p));
      activeWatcher.on('unlink', (p) => sendEvent('unlink', p));
      activeWatcher.on('addDir', (p) => sendEvent('addDir', p));
      activeWatcher.on('unlinkDir', (p) => sendEvent('unlinkDir', p));

      activeWatcher.on('error', (err) => {
        console.error('[Watcher] Error:', err);
      });

      console.log(`[Watcher] Started watching: ${workspacePath}`);
      return { started: true };
    } catch (err) {
      console.error('[Watcher] Failed to start:', err);
      return { started: false, error: (err as Error).message };
    }
  });

  // Stop watching
  ipcMain.handle('watcher:stop', async () => {
    await cleanupWatcher();
    console.log('[Watcher] Stopped');
    return { stopped: true };
  });
}
