/**
 * Shared type definitions for OrchIDE
 * Single source of truth for types used across main and renderer processes
 */

// ============================================================================
// File System Types
// ============================================================================

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  ext?: string;
  children?: FileEntry[];
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: string;
}

export interface FileOperationResult {
  success?: boolean;
  content?: string | null;
  error?: string | null;
  entries?: FileEntry[];
  absolutePath?: string | null;
}

// ============================================================================
// Session & Message Types
// ============================================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  mode: 'chat' | 'agentic';
  workspace_path?: string;
  workspace_name?: string;
  created_at: number;
  updated_at: number;
}

export interface SessionItem {
  id: string;
  title: string;
  updated_at: number;
}

// ============================================================================
// Agent Types
// ============================================================================

export type AgentMode = 'chat' | 'agentic';

export interface AgentRunParams {
  sessionId: string;
  message: string;
  mode: AgentMode;
  workspacePath?: string;
  workspaceName?: string;
}

export interface StreamState {
  sessionId: string;
  isActive: boolean;
  abortController?: AbortController;
}

// ============================================================================
// Artifact Types
// ============================================================================

export type ArtifactType = 'implementation_plan' | 'walkthrough' | 'task' | 'other';

export interface Artifact {
  id: string;
  sessionId: string;
  name: string;
  type: ArtifactType;
  filePath: string;
  icon: string;
  created_at?: number;
}

// ============================================================================
// File Change Types
// ============================================================================

export type FileChangeStatus = 'added' | 'modified' | 'deleted';

export interface FileChange {
  id: string;
  filePath: string;
  status: FileChangeStatus;
}

// ============================================================================
// Settings Types
// ============================================================================

export interface AppSettings {
  NVIDIA_NIM_API_KEY?: string;
  NVIDIA_NIM_MODEL?: string;
  TAVILY_API_KEY?: string;
  [key: string]: string | undefined;
}

// ============================================================================
// Watcher Types
// ============================================================================

export type WatcherEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface WatcherEvent {
  type: WatcherEventType;
  path: string;
}

// ============================================================================
// IPC Event Types
// ============================================================================

export interface StreamChunkData {
  sessionId: string;
  chunk: string;
}

export interface StreamErrorData {
  sessionId: string;
  error: string;
}

export interface TaskUpdateData {
  sessionId: string;
  checklistMd: string;
}

export interface ArtifactCreatedData {
  sessionId: string;
  artifact: Artifact;
}

export interface FileChangedData {
  sessionId: string;
  change: FileChange;
}

export interface SessionTitledData {
  sessionId: string;
  title: string;
}
