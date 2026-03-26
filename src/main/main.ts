import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { initAppData } from './appdata';
import { getDb } from './db';
import { registerFileSystemIPC } from './ipc/fileSystem';
import { registerWatcherIPC } from './ipc/watcher';
import { registerHistoryIPC } from './ipc/history';
import { registerAgentIPCNew, cleanupAllSessions } from './ipc/agent';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#1F1F1F',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#181818',
      symbolColor: '#e0e0e0',
      height: 32
    } : false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      additionalArguments: [
        '--content-security-policy',
        "default-src 'self'; img-src 'self' data: https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss: ws:;"
      ]
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
};

app.on('ready', () => {
  // Initialize AppData folder structure
  initAppData();

  // Initialize SQLite DB
  getDb();

  // Register all IPC handlers
  registerFileSystemIPC();
  registerWatcherIPC();
  registerHistoryIPC();
  registerAgentIPCNew();

  // Settings window
  ipcMain.on('open-settings', () => {
    const settingsWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      backgroundColor: '#1F1F1F',
      titleBarStyle: 'hidden',
      titleBarOverlay: process.platform === 'win32' ? {
        color: '#161616',
        symbolColor: '#e0e0e0',
        height: 32
      } : false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        additionalArguments: [
          '--content-security-policy',
          "default-src 'self'; img-src 'self' data: https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss: ws:;"
        ]
      },
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      settingsWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/settings`);
    } else {
      settingsWindow.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        { hash: 'settings' }
      );
    }

    settingsWindow.once('ready-to-show', () => {
      settingsWindow.show();
    });
  });

  ipcMain.on('close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  createWindow();
});

app.on('window-all-closed', () => {
  // Clean up agent sessions before quitting
  cleanupAllSessions();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
