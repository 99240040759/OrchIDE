/**
 * Preload script - exposes secure APIs to renderer via contextBridge
 * Implements proper event listener management to prevent memory leaks
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// ============================================================================
// Event Listener Management
// ============================================================================

type EventCallback = (data: unknown) => void;
type IpcCallback = (event: IpcRendererEvent, data: unknown) => void;

/**
 * Listener registry - tracks callbacks for proper cleanup
 * Maps channel -> Map of (userCallback -> wrappedCallback)
 */
const listenerRegistry = new Map<string, Map<EventCallback, IpcCallback>>();

/**
 * Add a listener with tracking for proper removal
 */
function addListener(channel: string, callback: EventCallback): () => void {
  // Get or create the map for this channel
  let channelListeners = listenerRegistry.get(channel);
  if (!channelListeners) {
    channelListeners = new Map();
    listenerRegistry.set(channel, channelListeners);
  }

  // Create wrapped callback that extracts data
  const wrappedCallback: IpcCallback = (_event, data) => callback(data);

  // Store mapping and register with ipcRenderer
  channelListeners.set(callback, wrappedCallback);
  ipcRenderer.on(channel, wrappedCallback);

  // Return unsubscribe function
  return () => removeListener(channel, callback);
}

/**
 * Remove a specific listener
 */
function removeListener(channel: string, callback: EventCallback): void {
  const channelListeners = listenerRegistry.get(channel);
  if (!channelListeners) return;

  const wrappedCallback = channelListeners.get(callback);
  if (wrappedCallback) {
    ipcRenderer.removeListener(channel, wrappedCallback);
    channelListeners.delete(callback);
  }

  // Clean up empty maps
  if (channelListeners.size === 0) {
    listenerRegistry.delete(channel);
  }
}

/**
 * Remove all listeners for a specific channel
 */
function removeAllChannelListeners(channel: string): void {
  const channelListeners = listenerRegistry.get(channel);
  if (!channelListeners) return;

  for (const wrappedCallback of channelListeners.values()) {
    ipcRenderer.removeListener(channel, wrappedCallback);
  }

  listenerRegistry.delete(channel);
}

// ============================================================================
// Expose APIs
// ============================================================================

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  openSettings: () => ipcRenderer.send('open-settings'),
  closeWindow: () => ipcRenderer.send('close-window'),
});

contextBridge.exposeInMainWorld('orchide', {
  // ==========================================================================
  // File System API
  // ==========================================================================
  fs: {
    readFile: (filePath: string) =>
      ipcRenderer.invoke('fs:readFile', filePath),

    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content),

    listDir: (dirPath: string) =>
      ipcRenderer.invoke('fs:listDir', dirPath),

    createFile: (filePath: string) =>
      ipcRenderer.invoke('fs:createFile', filePath),

    createDir: (dirPath: string) =>
      ipcRenderer.invoke('fs:createDir', dirPath),

    delete: (targetPath: string) =>
      ipcRenderer.invoke('fs:delete', targetPath),

    rename: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke('fs:rename', oldPath, newPath),

    exists: (targetPath: string) =>
      ipcRenderer.invoke('fs:exists', targetPath),

    openDialog: () =>
      ipcRenderer.invoke('fs:openDialog'),
  },

  // ==========================================================================
  // File Watcher API
  // ==========================================================================
  watcher: {
    start: (workspacePath: string) =>
      ipcRenderer.invoke('watcher:start', workspacePath),

    stop: () =>
      ipcRenderer.invoke('watcher:stop'),

    /**
     * Subscribe to watcher events
     * Returns unsubscribe function for proper cleanup
     */
    subscribe: (callback: (event: { type: string; path: string }) => void): (() => void) => {
      return addListener('watcher:event', callback as EventCallback);
    },

    /**
     * @deprecated Use subscribe() instead - returns unsubscribe function
     */
    onEvent: (callback: (event: { type: string; path: string }) => void): void => {
      addListener('watcher:event', callback as EventCallback);
    },

    /**
     * @deprecated Remove all watcher listeners - prefer using unsubscribe from subscribe()
     */
    offEvent: (): void => {
      removeAllChannelListeners('watcher:event');
    },
  },

  // ==========================================================================
  // Agent API
  // ==========================================================================
  agent: {
    send: (params: {
      sessionId: string;
      message: string;
      mode: 'chat' | 'agentic';
      workspacePath?: string;
      workspaceName?: string;
    }) => ipcRenderer.invoke('agent:send', params),

    cancel: (sessionId: string) =>
      ipcRenderer.invoke('agent:cancel', sessionId),

    getSession: (sessionId: string) =>
      ipcRenderer.invoke('agent:getSession', sessionId),

    /**
     * Subscribe to all agent events
     * Returns a single cleanup function that removes all subscriptions
     */
    subscribeAll: (handlers: {
      onStreamStart?: (data: { sessionId: string }) => void;
      onStreamChunk?: (data: { sessionId: string; chunk: string }) => void;
      onStreamEnd?: (data: { sessionId: string }) => void;
      onStreamError?: (data: { sessionId: string; error: string }) => void;
      onStreamEvent?: (data: {
        sessionId: string;
        type: string;
        data: {
          text?: string;
          toolCall?: {
            id: string;
            toolName: string;
            args: Record<string, unknown>;
            status: 'pending' | 'running' | 'completed' | 'error';
            result?: unknown;
            error?: string;
          };
          stepType?: string;
          finishReason?: string;
        };
      }) => void;
      onTaskUpdate?: (data: { sessionId: string; checklistMd: string }) => void;
      onArtifactCreated?: (data: { sessionId: string; artifact: unknown }) => void;
      onFileChanged?: (data: { sessionId: string; change: unknown }) => void;
      onSessionTitled?: (data: { sessionId: string; title: string }) => void;
    }): (() => void) => {
      const unsubscribers: Array<() => void> = [];

      if (handlers.onStreamStart) {
        unsubscribers.push(addListener('agent:stream-start', handlers.onStreamStart as EventCallback));
      }
      if (handlers.onStreamChunk) {
        unsubscribers.push(addListener('agent:stream-chunk', handlers.onStreamChunk as EventCallback));
      }
      if (handlers.onStreamEnd) {
        unsubscribers.push(addListener('agent:stream-end', handlers.onStreamEnd as EventCallback));
      }
      if (handlers.onStreamError) {
        unsubscribers.push(addListener('agent:stream-error', handlers.onStreamError as EventCallback));
      }
      if (handlers.onStreamEvent) {
        unsubscribers.push(addListener('agent:stream-event', handlers.onStreamEvent as EventCallback));
      }
      if (handlers.onTaskUpdate) {
        unsubscribers.push(addListener('agent:task-update', handlers.onTaskUpdate as EventCallback));
      }
      if (handlers.onArtifactCreated) {
        unsubscribers.push(addListener('agent:artifact-created', handlers.onArtifactCreated as EventCallback));
      }
      if (handlers.onFileChanged) {
        unsubscribers.push(addListener('agent:file-changed', handlers.onFileChanged as EventCallback));
      }
      if (handlers.onSessionTitled) {
        unsubscribers.push(addListener('agent:session-titled', handlers.onSessionTitled as EventCallback));
      }

      // Return combined cleanup function
      return () => {
        unsubscribers.forEach(unsub => unsub());
      };
    },

    // Legacy individual subscription methods (deprecated but kept for compatibility)
    onStreamStart: (cb: (data: { sessionId: string }) => void) =>
      addListener('agent:stream-start', cb as EventCallback),

    onStreamChunk: (cb: (data: { sessionId: string; chunk: string }) => void) =>
      addListener('agent:stream-chunk', cb as EventCallback),

    onStreamEnd: (cb: (data: { sessionId: string }) => void) =>
      addListener('agent:stream-end', cb as EventCallback),

    onStreamError: (cb: (data: { sessionId: string; error: string }) => void) =>
      addListener('agent:stream-error', cb as EventCallback),

    onStreamEvent: (cb: (data: { sessionId: string; type: string; data: unknown }) => void) =>
      addListener('agent:stream-event', cb as EventCallback),

    onTaskUpdate: (cb: (data: { sessionId: string; checklistMd: string }) => void) =>
      addListener('agent:task-update', cb as EventCallback),

    onArtifactCreated: (cb: (data: { sessionId: string; artifact: unknown }) => void) =>
      addListener('agent:artifact-created', cb as EventCallback),

    onFileChanged: (cb: (data: { sessionId: string; change: unknown }) => void) =>
      addListener('agent:file-changed', cb as EventCallback),

    onSessionTitled: (cb: (data: { sessionId: string; title: string }) => void) =>
      addListener('agent:session-titled', cb as EventCallback),

    /**
     * Remove all agent event listeners
     */
    removeAllListeners: (): void => {
      const channels = [
        'agent:stream-start',
        'agent:stream-chunk',
        'agent:stream-end',
        'agent:stream-error',
        'agent:stream-event',
        'agent:task-update',
        'agent:artifact-created',
        'agent:file-changed',
        'agent:session-titled',
      ];
      channels.forEach(channel => removeAllChannelListeners(channel));
    },
  },

  // ==========================================================================
  // History API
  // ==========================================================================
  history: {
    getChats: () =>
      ipcRenderer.invoke('history:getChats'),

    getWorkspaceSessions: (workspacePath: string) =>
      ipcRenderer.invoke('history:getWorkspaceSessions', workspacePath),

    getMessages: (sessionId: string) =>
      ipcRenderer.invoke('history:getMessages', sessionId),

    getArtifacts: (sessionId: string) =>
      ipcRenderer.invoke('history:getArtifacts', sessionId),

    getTaskProgress: (sessionId: string) =>
      ipcRenderer.invoke('history:getTaskProgress', sessionId),

    getFilesChanged: (sessionId: string) =>
      ipcRenderer.invoke('history:getFilesChanged', sessionId),

    deleteSession: (sessionId: string) =>
      ipcRenderer.invoke('history:deleteSession', sessionId),
  },

  // ==========================================================================
  // Settings API
  // ==========================================================================
  settings: {
    get: () =>
      ipcRenderer.invoke('settings:get'),

    save: (settings: Record<string, string>) =>
      ipcRenderer.invoke('settings:save', settings),
  },
});
