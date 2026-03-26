/**
 * TypeScript declarations for Electron and OrchIDE APIs
 * These types provide autocomplete and type safety for the preload-exposed APIs
 */

import type {
  FileEntry,
  FileOperationResult,
  WatcherEvent,
  AgentRunParams,
  Message,
  Artifact,
  FileChange,
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
  onTaskUpdate?: (data: { sessionId: string; checklistMd: string }) => void;
  onArtifactCreated?: (data: { sessionId: string; artifact: Artifact }) => void;
  onFileChanged?: (data: { sessionId: string; change: FileChange }) => void;
  onSessionTitled?: (data: { sessionId: string; title: string }) => void;
}

export interface OrchideAgentAPI {
  send: (params: AgentRunParams) => Promise<{ started: boolean; error?: string }>;
  cancel: (sessionId: string) => Promise<{ cancelled: boolean }>;
  getSession: (sessionId: string) => Promise<{ messages: Message[] }>;

  // Tool and Plan approval methods
  approveToolCalls: (params: { sessionId: string; toolCallIds: string[] }) => Promise<{ success: boolean }>;
  rejectToolCalls: (params: { sessionId: string; toolCallIds: string[]; reason?: string }) => Promise<{ success: boolean }>;
  planApproval: (params: { sessionId: string; planId: string; approved: boolean; reason?: string }) => Promise<{ success: boolean }>;

  subscribeAll: (handlers: AgentEventHandlers) => () => void;

  onStreamStart: (cb: (data: { sessionId: string }) => void) => () => void;
  onStreamChunk: (cb: (data: { sessionId: string; chunk: string }) => void) => () => void;
  onStreamEnd: (cb: (data: { sessionId: string }) => void) => () => void;
  onStreamError: (cb: (data: { sessionId: string; error: string }) => void) => () => void;
  onTaskUpdate: (cb: (data: { sessionId: string; checklistMd: string }) => void) => () => void;
  onArtifactCreated: (cb: (data: { sessionId: string; artifact: Artifact }) => void) => () => void;
  onFileChanged: (cb: (data: { sessionId: string; change: FileChange }) => void) => () => void;
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
  getFilesChanged: (sessionId: string) => Promise<FileChange[]>;
  deleteSession: (sessionId: string) => Promise<void>;
}

// ============================================================================
// OrchIDE Settings API
// ============================================================================

export interface OrchideSettingsAPI {
  get: () => Promise<Record<string, string>>;
  save: (settings: Record<string, string>) => Promise<{ success: boolean }>;
}

// ============================================================================
// Combined OrchIDE API
// ============================================================================

export interface OrchideAPI {
  fs: OrchideFileSystemAPI;
  watcher: OrchideWatcherAPI;
  agent: OrchideAgentAPI;
  history: OrchideHistoryAPI;
  settings: OrchideSettingsAPI;
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
