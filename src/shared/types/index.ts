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
// Agent Types
// ============================================================================

export type AgentMode = 'chat' | 'agentic';

// ============================================================================
// Session & Message Types
// ============================================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  mode: AgentMode;
  workspacePath?: string;
  workspaceName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionItem {
  id: string;
  title: string;
  updatedAt: number;
}

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

export type ArtifactType = 'file' | 'diagram' | 'implementation_plan' | 'walkthrough' | 'task' | 'other';

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  filePath: string;
  icon: string;
  createdAt?: number;
}

// ============================================================================
// Settings Types
// ============================================================================

export interface AppSettings {
  NVIDIA_NIM_API_KEY?: string;
  NVIDIA_NIM_MODEL?: string;
  TAVILY_API_KEY?: string;
  AGENT_RECURSION_LIMIT?: string;
  AGENT_MAX_TOOL_CALLS?: string;
  AGENT_MAX_IDENTICAL_TOOL_CALLS?: string;
  AGENT_MAX_IDENTICAL_TOOL_RESULTS?: string;
  AGENT_MAX_CONCURRENCY?: string;
  AGENT_TEMPERATURE?: string;
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

export interface SessionTitledData {
  sessionId: string;
  title: string;
}

// ============================================================================
// Live Stream Event Types (for dynamic chat panel)
// ============================================================================

export type StreamEventType =
  | 'text-delta'
  | 'reasoning-delta'
  | 'tool-call-start'
  | 'tool-call-delta'
  | 'tool-call-args'
  | 'tool-result'
  | 'thinking'
  | 'step-finish'
  | 'finish';

export interface ToolCallEvent {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: unknown;
  error?: string;
}

export interface StreamEvent {
  sessionId: string;
  type: StreamEventType;
  data: {
    text?: string;
    toolCall?: ToolCallEvent;
    stepType?: string;
    finishReason?: string;
  };
}

// ============================================================================
// Enhanced Message Types (for live chat)
// ============================================================================

export interface LiveMessagePart {
  type: 'text' | 'tool-call' | 'tool-result' | 'thinking';
  id: string;
  content?: string;
  toolCall?: ToolCallEvent;
}
