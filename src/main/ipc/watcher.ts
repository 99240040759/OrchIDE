import { ipcMain, BrowserWindow } from 'electron';
import chokidar, { FSWatcher } from 'chokidar';

let activeWatcher: FSWatcher | null = null;
let watcherWindowId: number | null = null;

export function registerWatcherIPC(): void {
  ipcMain.handle('watcher:start', async (event, workspacePath: string) => {
    if (activeWatcher) {
      await activeWatcher.close();
      activeWatcher = null;
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    watcherWindowId = win.id;

    activeWatcher = chokidar.watch(workspacePath, {
      ignored: /(^|[\/\\])(\.git|node_modules|__pycache__|\.DS_Store)/,
      persistent: true,
      ignoreInitial: true,
      depth: 8,
    });

    const sendEvent = (type: string, filePath: string) => {
      const w = BrowserWindow.fromId(watcherWindowId!);
      if (w && !w.isDestroyed()) {
        w.webContents.send('watcher:event', { type, path: filePath });
      }
    };

    activeWatcher.on('add', p => sendEvent('add', p));
    activeWatcher.on('change', p => sendEvent('change', p));
    activeWatcher.on('unlink', p => sendEvent('unlink', p));
    activeWatcher.on('addDir', p => sendEvent('addDir', p));
    activeWatcher.on('unlinkDir', p => sendEvent('unlinkDir', p));

    return { started: true };
  });

  ipcMain.handle('watcher:stop', async () => {
    if (activeWatcher) {
      await activeWatcher.close();
      activeWatcher = null;
    }
    return { stopped: true };
  });
}
