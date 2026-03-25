import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  openSettings: () => ipcRenderer.send('open-settings'),
  closeWindow: () => ipcRenderer.send('close-window'),
});

contextBridge.exposeInMainWorld('orchide', {
  // File System
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    listDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
    createFile: (filePath: string) => ipcRenderer.invoke('fs:createFile', filePath),
    createDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
    delete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    exists: (targetPath: string) => ipcRenderer.invoke('fs:exists', targetPath),
    openDialog: () => ipcRenderer.invoke('fs:openDialog'),
  },

  // File Watcher
  watcher: {
    start: (workspacePath: string) => ipcRenderer.invoke('watcher:start', workspacePath),
    stop: () => ipcRenderer.invoke('watcher:stop'),
    onEvent: (callback: (event: { type: string; path: string }) => void) => {
      ipcRenderer.on('watcher:event', (_e, data) => callback(data));
    },
    offEvent: () => ipcRenderer.removeAllListeners('watcher:event'),
  },

  // Agent
  agent: {
    send: (params: {
      sessionId: string;
      message: string;
      mode: 'chat' | 'agentic';
      workspacePath?: string;
      workspaceName?: string;
    }) => ipcRenderer.invoke('agent:send', params),
    getSession: (sessionId: string) => ipcRenderer.invoke('agent:getSession', sessionId),
    onStreamStart: (cb: (data: any) => void) => ipcRenderer.on('agent:stream-start', (_e, d) => cb(d)),
    onStreamChunk: (cb: (data: { sessionId: string; chunk: string }) => void) => ipcRenderer.on('agent:stream-chunk', (_e, d) => cb(d)),
    onStreamEnd: (cb: (data: any) => void) => ipcRenderer.on('agent:stream-end', (_e, d) => cb(d)),
    onStreamError: (cb: (data: { sessionId: string; error: string }) => void) => ipcRenderer.on('agent:stream-error', (_e, d) => cb(d)),
    onTaskUpdate: (cb: (data: { sessionId: string; checklistMd: string }) => void) => ipcRenderer.on('agent:task-update', (_e, d) => cb(d)),
    onArtifactCreated: (cb: (data: any) => void) => ipcRenderer.on('agent:artifact-created', (_e, d) => cb(d)),
    onFileChanged: (cb: (data: any) => void) => ipcRenderer.on('agent:file-changed', (_e, d) => cb(d)),
    onSessionTitled: (cb: (data: { sessionId: string; title: string }) => void) => ipcRenderer.on('agent:session-titled', (_e, d) => cb(d)),
    removeAllListeners: () => {
      ['agent:stream-start','agent:stream-chunk','agent:stream-end','agent:stream-error',
       'agent:task-update','agent:artifact-created','agent:file-changed','agent:session-titled'].forEach(ch => {
        ipcRenderer.removeAllListeners(ch);
      });
    },
  },

  // History
  history: {
    getChats: () => ipcRenderer.invoke('history:getChats'),
    getWorkspaceSessions: (workspacePath: string) => ipcRenderer.invoke('history:getWorkspaceSessions', workspacePath),
    getMessages: (sessionId: string) => ipcRenderer.invoke('history:getMessages', sessionId),
    getArtifacts: (sessionId: string) => ipcRenderer.invoke('history:getArtifacts', sessionId),
    getTaskProgress: (sessionId: string) => ipcRenderer.invoke('history:getTaskProgress', sessionId),
    getFilesChanged: (sessionId: string) => ipcRenderer.invoke('history:getFilesChanged', sessionId),
    deleteSession: (sessionId: string) => ipcRenderer.invoke('history:deleteSession', sessionId),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: Record<string, string>) => ipcRenderer.invoke('settings:save', settings),
  },
});
