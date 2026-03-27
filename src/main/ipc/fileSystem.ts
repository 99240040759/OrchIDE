/**
 * File System IPC handlers
 * Provides file operations for the renderer process
 * Uses async operations to prevent blocking
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFileTree } from '../../shared/utils/fileUtils';

/**
 * Register all file system IPC handlers
 */
export function registerFileSystemIPC(): void {
  // Read file
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { content, error: null };
    } catch (e: unknown) {
      return { content: null, error: (e as Error).message };
    }
  });

  // Write file
  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return { error: null };
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
  });

  // List directory
  ipcMain.handle('fs:listDir', async (_event, dirPath: string) => {
    try {
      const entries = await buildFileTree(dirPath);
      return { entries, error: null };
    } catch (e: unknown) {
      return { entries: [], error: (e as Error).message };
    }
  });

  // Create file
  ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      // Check if exists using access, create if not
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, '', 'utf-8');
      }
      return { error: null };
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
  });

  // Create directory
  ipcMain.handle('fs:createDir', async (_event, dirPath: string) => {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return { error: null };
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
  });

  // Delete file or directory
  ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);
      }
      return { error: null };
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
  });

  // Rename file or directory
  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      await fs.rename(oldPath, newPath);
      return { error: null };
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
  });

  // Check if path exists
  ipcMain.handle('fs:exists', async (_event, targetPath: string) => {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  });

  // Open folder dialog
  ipcMain.handle('fs:openDialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    // If no window found, show dialog without parent (less ideal but works)
    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      title: 'Open Workspace Folder',
    };

    const result = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
}
