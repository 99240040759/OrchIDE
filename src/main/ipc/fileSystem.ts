import { ipcMain, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  ext?: string;
  children?: FileEntry[];
}

function buildTree(dirPath: string, depth = 0): FileEntry[] {
  if (depth > 6) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__')
      .map(e => {
        const fullPath = path.join(dirPath, e.name);
        const isDir = e.isDirectory();
        const entry: FileEntry = {
          name: e.name,
          path: fullPath,
          isDir,
          ext: isDir ? undefined : path.extname(e.name).slice(1),
        };
        if (isDir) {
          entry.children = buildTree(fullPath, depth + 1);
        }
        return entry;
      })
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}

export function registerFileSystemIPC(): void {
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      return { content: fs.readFileSync(filePath, 'utf-8'), error: null };
    } catch (e: any) {
      return { content: null, error: e.message };
    }
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('fs:listDir', async (_event, dirPath: string) => {
    try {
      return { entries: buildTree(dirPath), error: null };
    } catch (e: any) {
      return { entries: [], error: e.message };
    }
  });

  ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf-8');
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('fs:createDir', async (_event, dirPath: string) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
    try {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('fs:exists', async (_event, targetPath: string) => {
    return fs.existsSync(targetPath);
  });

  ipcMain.handle('fs:openDialog', async (event) => {
    const { BrowserWindow } = await import('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Open Workspace Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
