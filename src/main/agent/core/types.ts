/**
 * Core Type Definitions for OrchIDE Agent Framework
 * 
 * This is the foundation of the entire agentic system.
 * All types are designed to be compatible with OpenAI's API format
 * while supporting our custom features like tool approval and plans.
 */

// ============================================================================
// Message Types (OpenAI-compatible)
// ============================================================================

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export interface FunctionCall {
  name: string;
  arguments: string; // JSON string
}

export interface ToolCallFunction {
  name: string;
  arguments: string; // JSON string
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

export interface ToolCallDelta {
  index?: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

// Base message interface
export interface BaseMessage {
  role: MessageRole;
  content: string | MessageContent[] | null;
}

export interface SystemMessage extends BaseMessage {
  role: 'system';
  content: string;
}

export interface UserMessage extends BaseMessage {
  role: 'user';
  content: string | MessageContent[];
}

export interface AssistantMessage extends BaseMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
  reasoning?: string; // For reasoning models
}

export interface ToolMessage extends BaseMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ============================================================================
// Tool Call State (for tracking tool execution)
// ============================================================================

export type ToolCallStatus =
  | 'generating'     // Tool call being streamed
  | 'generated'      // Tool call complete, waiting for execution
  | 'pending_approval' // Waiting for user approval
  | 'calling'        // Currently executing
  | 'done'           // Completed successfully
  | 'errored'        // Failed with error
  | 'canceled';      // User rejected/canceled

export interface ToolCallState {
  toolCallId: string;
  toolCall: ToolCall;
  status: ToolCallStatus;
  parsedArgs?: Record<string, unknown>;
  output?: ContextItem[];
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// ============================================================================
// Context Items (tool outputs, file contents, etc.)
// ============================================================================

export interface ContextItem {
  name: string;
  description: string;
  content: string;
  icon?: string;
  uri?: {
    type: 'file' | 'url' | 'other';
    value: string;
  };
  hidden?: boolean;
}

export interface ContextItemWithId extends ContextItem {
  id: string;
}

// ============================================================================
// Chat History Item (message + metadata)
// ============================================================================

export interface ChatHistoryItem {
  message: ChatMessage;
  contextItems: ContextItem[];
  toolCallStates?: ToolCallState[];
  promptLogs?: PromptLog[];
  reasoning?: {
    active: boolean;
    content: string;
    startAt?: number;
    endAt?: number;
  };
  editorState?: unknown; // For TipTap editor state
  isGatheringContext?: boolean;
  appliedRules?: RuleMetadata[];
}

export interface ChatHistoryItemWithId extends ChatHistoryItem {
  id: string;
  message: ChatMessage & { id: string };
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session modes
 * - 'chat': Simple conversational mode without tool usage
 * - 'agentic': Full agent mode with tool access and planning
 */
export type SessionMode = 'chat' | 'agentic';

export interface SessionMetadata {
  id: string;
  title: string;
  mode: SessionMode;
  workspacePath?: string;
  workspaceName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Session extends SessionMetadata {
  history: ChatHistoryItemWithId[];
  plan?: Plan;
  streamAborter?: AbortController;
  isStreaming: boolean;
}

// ============================================================================
// Plan Types (for large projects)
// ============================================================================

export type PlanStatus =
  | 'draft'          // Being generated
  | 'pending_approval' // Waiting for user approval
  | 'approved'       // User approved, ready to execute
  | 'in_progress'    // Currently executing
  | 'completed'      // All steps done
  | 'paused'         // User paused execution
  | 'failed'         // Execution failed
  | 'rejected';      // User rejected the plan

export type PlanStepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: PlanStepStatus;
  substeps?: PlanStep[];
  dependencies?: string[]; // IDs of steps that must complete first
  output?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Plan {
  id: string;
  title: string;
  description: string;
  status: PlanStatus;
  steps: PlanStep[];
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  completedAt?: number;
  estimatedDuration?: string; // Human-readable estimate
}

// ============================================================================
// Tool Policy Types
// ============================================================================

export type ToolPolicy =
  | 'allowedWithoutPermission'  // Auto-execute
  | 'allowedWithPermission'     // Require user approval
  | 'disabled';                 // Never execute

export interface ToolPolicyOverride {
  toolName: string;
  policy: ToolPolicy;
}

export interface ToolSettings {
  defaults: Record<string, ToolPolicy>;
  overrides: ToolPolicyOverride[];
}

// ============================================================================
// LLM Types
// ============================================================================

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  reasoning?: boolean;
  reasoningBudgetTokens?: number;
}

export interface PromptLog {
  modelTitle: string;
  modelProvider: string;
  prompt: string;
  completion: string;
  completionOptions: CompletionOptions;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ============================================================================
// Tool Definition Types
// ============================================================================

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: ToolParameterProperty;
  default?: unknown;
}

export interface ToolParameters {
  type: 'object';
  required?: string[];
  properties: Record<string, ToolParameterProperty>;
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: ToolParameters;
}

export interface ToolDefinition {
  type: 'function';
  function: ToolFunction;
}

// ============================================================================
// Task Status Type
// ============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

// ============================================================================
// Task Boundary Types (Antigravity-level orchestration)
// ============================================================================

export type TaskBoundaryMode = 'PLANNING' | 'EXECUTION' | 'VERIFICATION';

export interface TaskBoundaryData {
  taskName: string;
  mode: TaskBoundaryMode;
  taskStatus: string;
  taskSummary: string;
  predictedTaskSize?: number;
}

export interface NotifyUserData {
  message: string;
  pathsToReview?: string[];
  blockedOnUser: boolean;
  shouldAutoProceed?: boolean;
}

// ============================================================================
// Agent Event Types
// ============================================================================

export type AgentEventType =
  | 'task_progress'
  | 'artifact_created'

  | 'plan_created'
  | 'plan_updated'
  | 'plan_step_updated'
  | 'task_boundary'
  | 'notify_user';

export interface AgentEvent {
  type: AgentEventType;
  timestamp: number;
  taskId?: string;
  status?: TaskStatus;
  progress?: number;
  message?: string;
  artifact?: Artifact;
  filePath?: string;
  changeType?: FileChangeStatus;
  summary?: string;
  plan?: Plan;
  planId?: string;
  stepId?: string;
  output?: string;
  error?: string;
  // Task boundary & notify user
  taskBoundary?: TaskBoundaryData;
  notifyUser?: NotifyUserData;
  checklistMarkdown?: string;
}

// ============================================================================
// Streaming Event Types (Extended for tool loop)
// ============================================================================

export type StreamEventType =
  | 'stream_start'
  | 'text_delta'
  | 'tool_call_start'
  | 'tool_call_delta'
  | 'tool_call_complete'
  | 'tool_result'
  | 'reasoning_start'
  | 'reasoning_delta'
  | 'reasoning_end'
  | 'step_complete'
  | 'plan_generated'
  | 'plan_step_start'
  | 'plan_step_complete'
  | 'approval_required'
  | 'task_boundary'
  | 'notify_user'
  | 'stream_end'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  sessionId: string;
  data: StreamEventData;
}

export interface StreamEventData {
  // Text streaming
  text?: string;

  // Tool call events
  toolCall?: ToolCall;
  toolCallDelta?: ToolCallDelta;
  toolCallState?: ToolCallState;

  // Reasoning
  reasoning?: string;

  // Plan events
  plan?: Plan;
  planStep?: PlanStep;

  // Approval
  approvalRequest?: ApprovalRequest;

  // Task boundary
  taskBoundary?: TaskBoundaryData;

  // Notify user
  notifyUser?: NotifyUserData;

  // Completion
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage?: Usage;

  // Error
  error?: string;
}

// ============================================================================
// Approval Types
// ============================================================================

export type ApprovalType = 'tool_call' | 'plan';

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  toolCallId?: string;
  toolCall?: ToolCall;
  plan?: Plan;
  message: string;
  createdAt: number;
}

export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  message?: string;
}

// ============================================================================
// Rule Types
// ============================================================================

export interface RuleMetadata {
  id: string;
  slug?: string;
  name: string;
  source: 'workspace' | 'global' | 'user';
  content: string;
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
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// File Change Types
// ============================================================================

export type FileChangeStatus = 'added' | 'modified' | 'deleted';

export interface FileChange {
  id: string;
  sessionId: string;
  filePath: string;
  status: FileChangeStatus;
  timestamp: number;
}

// ============================================================================
// Task Progress Types
// ============================================================================

export interface TaskItem {
  id: string;
  text: string;
  status: 'todo' | 'in_progress' | 'done';
  depth: number;
}

export interface TaskProgress {
  sessionId: string;
  title: string;
  items: TaskItem[];
  rawMarkdown: string;
  updatedAt: number;
}

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  // LLM settings
  model: string;
  apiKey: string;
  apiBase: string;
  temperature: number;
  maxTokens: number;

  // Workspace
  workspaceName?: string;

  // Agent behavior
  maxToolCalls: number;
  maxToolIterations: number; // For tool loop
  maxRecursionDepth: number;
  maxConcurrentToolCalls: number;

  // Plan behavior
  requirePlanApproval: boolean; // Whether to require user approval for plans

  // Loop detection
  maxIdenticalToolCalls: number;
  maxIdenticalToolResults: number;

  // Context management
  contextWindowSize: number;
  compactionThreshold: number; // Percentage of context before compaction

  // Timeouts
  toolTimeoutMs: number;
  llmTimeoutMs: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  model: 'moonshotai/kimi-k2-thinking',
  apiKey: '',
  apiBase: 'https://integrate.api.nvidia.com/v1',
  temperature: 0.6,
  maxTokens: 32768, // Massive budget for <think> chains
  maxToolCalls: 500,
  maxToolIterations: 25,
  maxRecursionDepth: 150,
  maxConcurrentToolCalls: 4,
  requirePlanApproval: true,
  maxIdenticalToolCalls: 5,
  maxIdenticalToolResults: 3,
  contextWindowSize: 128000,
  compactionThreshold: 0.8,
  toolTimeoutMs: 60000,
  llmTimeoutMs: 120000,
};

// ============================================================================
// IPC Types
// ============================================================================

export interface AgentSendParams {
  sessionId: string;
  message: string;
  mode: SessionMode;
  workspacePath?: string;
  workspaceName?: string;
  contextItems?: ContextItem[];
}

export interface AgentResponse {
  success: boolean;
  error?: string;
}

export interface ToolApprovalParams {
  sessionId: string;
  requestId: string;
  approved: boolean;
  message?: string;
}

export interface PlanApprovalParams {
  sessionId: string;
  planId: string;
  approved: boolean;
  modifications?: Partial<Plan>;
}
