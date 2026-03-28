/**
 * TypeScript declarations for Electron and OrchIDE APIs
 * These types provide autocomplete and type safety for the preload-exposed APIs
 */

import type {
  FileEntry,
  WatcherEvent,
  AgentRunParams,
  Message,
  Artifact,
} from '../shared/types';

// ============================================================================
// Electron API
// ============================================================================

export interface ElectronAPI {
  platform: string;
  openSettings: () => void;
  closeWindow: () => void;
}

// ============================================================================
// OrchIDE File System API
// ============================================================================

export interface OrchideFileSystemAPI {
  readFile: (filePath: string) => Promise<{ content: string | null; error: string | null }>;
  writeFile: (filePath: string, content: string) => Promise<{ error: string | null }>;
  listDir: (dirPath: string) => Promise<{ entries: FileEntry[]; error: string | null }>;
  createFile: (filePath: string) => Promise<{ error: string | null }>;
  createDir: (dirPath: string) => Promise<{ error: string | null }>;
  delete: (targetPath: string) => Promise<{ error: string | null }>;
  rename: (oldPath: string, newPath: string) => Promise<{ error: string | null }>;
  exists: (targetPath: string) => Promise<boolean>;
  openDialog: () => Promise<string | null>;
}

// ============================================================================
// OrchIDE Watcher API
// ============================================================================

export interface OrchideWatcherAPI {
  start: (workspacePath: string) => Promise<{ started: boolean; error?: string }>;
  stop: () => Promise<{ stopped: boolean }>;
  subscribe: (callback: (event: WatcherEvent) => void) => () => void;
  onEvent: (callback: (event: WatcherEvent) => void) => void;
  offEvent: () => void;
}

// ============================================================================
// OrchIDE Agent API
// ============================================================================

export interface AgentEventHandlers {
  onStreamStart?: (data: { sessionId: string }) => void;
  onStreamChunk?: (data: { sessionId: string; chunk: string }) => void;
  onStreamEnd?: (data: { sessionId: string }) => void;
  onStreamError?: (data: { sessionId: string; error: string }) => void;
  onStreamEvent?: (data: { sessionId: string; type: string; data: Record<string, unknown> }) => void;
  onTaskUpdate?: (data: { sessionId: string; checklistMd: string }) => void;
  onArtifactCreated?: (data: { sessionId: string; artifact: unknown }) => void;
  onSessionTitled?: (data: { sessionId: string; title: string }) => void;
  onTaskBoundary?: (data: {
    sessionId: string;
    taskName: string;
    mode: string;
    taskStatus: string;
    taskSummary: string;
    predictedTaskSize?: number;
  }) => void;
  onNotifyUser?: (data: {
    sessionId: string;
    message: string;
    pathsToReview?: string[];
    blockedOnUser: boolean;
    shouldAutoProceed?: boolean;
  }) => void;
}

export interface OrchideAgentAPI {
  send: (params: AgentRunParams) => Promise<{ started: boolean; error?: string }>;
  cancel: (sessionId: string) => Promise<{ cancelled: boolean }>;
  getSession: (sessionId: string) => Promise<{ messages: Message[] }>;

  subscribeAll: (handlers: AgentEventHandlers) => () => void;

  // Resume from notifyUser block
  resumeNotify: (sessionId: string) => Promise<{ resumed: boolean; error?: string }>;

  // Legacy individual subscription methods (deprecated - use subscribeAll)
  onStreamStart: (cb: (data: { sessionId: string }) => void) => () => void;
  onStreamChunk: (cb: (data: { sessionId: string; chunk: string }) => void) => () => void;
  onStreamEnd: (cb: (data: { sessionId: string }) => void) => () => void;
  onStreamError: (cb: (data: { sessionId: string; error: string }) => void) => () => void;
  onStreamEvent: (cb: (data: { sessionId: string; type: string; data: unknown }) => void) => () => void;
  onTaskUpdate: (cb: (data: { sessionId: string; checklistMd: string }) => void) => () => void;
  onArtifactCreated: (cb: (data: { sessionId: string; artifact: unknown }) => void) => () => void;
  onSessionTitled: (cb: (data: { sessionId: string; title: string }) => void) => () => void;

  removeAllListeners: () => void;
}

// ============================================================================
// OrchIDE History API
// ============================================================================

export interface Session {
  id: string;
  title: string;
  mode: 'chat' | 'agentic';
  workspace_path?: string;
  workspace_name?: string;
  created_at: number;
  updated_at: number;
}

export interface OrchideHistoryAPI {
  getChats: () => Promise<Session[]>;
  getWorkspaceSessions: (workspacePath: string) => Promise<Session[]>;
  getMessages: (sessionId: string) => Promise<Message[]>;
  getArtifacts: (sessionId: string) => Promise<Artifact[]>;
  getTaskProgress: (sessionId: string) => Promise<string | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateMessageExtras: (sessionId: string, toolCalls: string | null, parts: string | null) => Promise<{ success?: boolean; error?: string }>;
}

// ============================================================================
// OrchIDE Settings API
// ============================================================================

export interface OrchideSettingsAPI {
  get: () => Promise<Record<string, string>>;
  save: (settings: Record<string, string>) => Promise<{ success: boolean }>;
}

// ============================================================================
// OrchIDE Indexer API
// ============================================================================

export interface IndexerProgress {
  workspacePath: string;
  isIndexing: boolean;
  progress: number;
  completed: number;
  total: number;
}

export interface IndexerStatus {
  isIndexing: boolean;
  workspacePath?: string;
}

export interface OrchideIndexerAPI {
  connect: (workspacePath: string) => Promise<IndexerStatus>;
  start: (workspacePath: string) => Promise<{ success: boolean; error?: string }>;
  stop: () => Promise<{ success: boolean }>;
  reindex: (workspacePath: string) => Promise<{ success: boolean; error?: string }>;
  query: (query: string) => Promise<unknown[]>;
  getStatus: () => Promise<IndexerStatus>;
  subscribeProgress: (callback: (data: IndexerProgress) => void) => () => void;
}

// ============================================================================
// Combined OrchIDE API
// ============================================================================

export interface OrchideAPI {
  fs: OrchideFileSystemAPI;
  watcher: OrchideWatcherAPI & { getActiveWorkspace?: () => Promise<string | null> };
  agent: OrchideAgentAPI;
  history: OrchideHistoryAPI;
  settings: OrchideSettingsAPI;
  indexer?: OrchideIndexerAPI;
}

// ============================================================================
// Global Window Extensions
// ============================================================================

declare global {
  interface Window {
    electron: ElectronAPI;
    orchide: OrchideAPI;
  }
}

export {};
