/**
 * Tool Type Definitions
 * 
 * Defines the interfaces for tools in the OrchIDE agent framework.
 * Separates tool definition (what the LLM sees) from implementation (how it runs).
 */

import type {
  ToolDefinition,
  ToolCall,
  ToolCallState,
  ToolPolicy,
  ContextItem,
  AgentConfig,
} from '../core/types';

// Re-export core types that are part of the public API
export type { ToolDefinition, ToolPolicy } from '../core/types';

// ============================================================================
// Tool Metadata
// ============================================================================

/**
 * Human-readable tool metadata for UI display
 */
export interface ToolDisplayInfo {
  /** Display name shown in UI */
  displayTitle: string;
  
  /** Template for "would like to" message, e.g. "read {{{ filepath }}}" */
  wouldLikeTo?: string;
  
  /** Template for "is currently" message, e.g. "reading {{{ filepath }}}" */
  isCurrently?: string;
  
  /** Template for "has already" message, e.g. "read {{{ filepath }}}" */
  hasAlready?: string;
  
  /** Icon name for the tool */
  icon?: string;
  
  /** Tool group for organization */
  group?: string;
}

// ============================================================================
// Tool Behavior
// ============================================================================

/**
 * Tool behavior configuration
 */
export interface ToolBehavior {
  /** Whether the tool only reads and doesn't modify anything */
  readonly: boolean;
  
  /** Whether the tool executes nearly instantly */
  isInstant: boolean;
  
  /** Default policy for this tool */
  defaultPolicy: ToolPolicy;
  
  /** Whether tool can run in parallel with others */
  allowsParallel: boolean;
  
  /** Timeout override for this tool (ms) */
  timeoutMs?: number;
}

// ============================================================================
// Tool Interface
// ============================================================================

/**
 * Context passed to tool implementations
 */
export interface ToolContext {
  /** Session ID */
  sessionId: string;
  
  /** Workspace path (if in agent mode) */
  workspacePath?: string;
  
  /** Workspace name */
  workspaceName?: string;
  
  /** Path to session-specific storage (for artifacts, etc.) */
  sessionPath?: string;
  
  /** Agent configuration */
  config: AgentConfig;
  
  /** Application settings */
  settings?: Record<string, string>;
  
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  
  /** Function to send events to UI */
  sendEvent?: (event: unknown) => void;
}

/**
 * Result from tool execution
 */
export interface ToolResult {
  /** Output context items */
  output: ContextItem[];
  
  /** Whether the tool execution was successful */
  success: boolean;
  
  /** Error message if failed */
  error?: string;
  
  /** Whether to continue the agent loop after this tool */
  continueLoop?: boolean;
  
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Function type for preprocessing tool arguments
 * Can transform, validate, or resolve arguments before execution
 */
export type ToolPreprocessor = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<{
  args: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}>;

/**
 * Function type for evaluating tool policy dynamically
 * Can override default policy based on arguments
 */
export type ToolPolicyEvaluator = (
  basePolicy: ToolPolicy,
  args: Record<string, unknown>,
  processedArgs?: Record<string, unknown>
) => ToolPolicy;

/**
 * Function type for tool implementation
 */
export type ToolImplementation = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>;

// ============================================================================
// Complete Tool Definition
// ============================================================================

/**
 * Complete tool definition with all metadata and implementation
 */
export interface Tool {
  /** Tool definition for the LLM */
  definition: ToolDefinition;
  
  /** Display information for UI */
  display: ToolDisplayInfo;
  
  /** Behavior configuration */
  behavior: ToolBehavior;
  
  /** Argument preprocessor (optional) */
  preprocessArgs?: ToolPreprocessor;
  
  /** Policy evaluator (optional) */
  evaluatePolicy?: ToolPolicyEvaluator;
  
  /** Tool implementation */
  execute: ToolImplementation;
}

// ============================================================================
// Tool Registry Types
// ============================================================================

/**
 * Tool group for organization
 */
export interface ToolGroup {
  name: string;
  displayName: string;
  description: string;
  tools: string[]; // Tool names
}

/**
 * Tool override configuration
 */
export interface ToolOverride {
  /** Tool name to override */
  toolName: string;
  
  /** Override display info */
  display?: Partial<ToolDisplayInfo>;
  
  /** Override behavior */
  behavior?: Partial<ToolBehavior>;
  
  /** Whether to disable this tool */
  disabled?: boolean;
}

/**
 * Tool registry configuration
 */
export interface ToolRegistryConfig {
  /** Default tools to enable */
  enabledTools?: string[];
  
  /** Tools to disable */
  disabledTools?: string[];
  
  /** Policy overrides */
  policyOverrides?: Record<string, ToolPolicy>;
  
  /** Tool overrides */
  toolOverrides?: ToolOverride[];
}

// ============================================================================
// Built-in Tool Names
// ============================================================================

export const BuiltInToolNames = {
  // File operations
  ReadFile: 'readFile',
  WriteFile: 'writeFile',
  CreateFile: 'createFile',
  DeleteFile: 'deleteFile',
  ListDirectory: 'listDirectory',
  ReplaceFileContent: 'replaceFileContent',
  MultiReplaceFileContent: 'multiReplaceFileContent',
  
  // Search
  GrepSearch: 'grepSearch',
  GlobSearch: 'globSearch',
  SearchInFiles: 'searchInFiles',
  
  // Terminal
  RunTerminalCommand: 'runTerminalCommand',
  StartTerminalCommand: 'startTerminalCommand',
  GetCommandStatus: 'getCommandStatus',
  SendCommandInput: 'sendCommandInput',
  
  // Web
  WebSearch: 'webSearch',
  FetchUrl: 'fetchUrl',
  
  // Agent
  UpdateTaskProgress: 'updateTaskProgress',
  CreateArtifact: 'createArtifact',

  TaskBoundary: 'taskBoundary',
  NotifyUser: 'notifyUser',
} as const;

export type BuiltInToolName = typeof BuiltInToolNames[keyof typeof BuiltInToolNames];

// ============================================================================
// Tool Call Helpers
// ============================================================================

/**
 * Robust JSON parsing rescue to extract key-values from broken strings like:
 * {"dirPath": "node_modules" | head}, "command": ...}
 */
function rescueJson(args: string): Record<string, unknown> {
  let repaired = args.replace(/:\\s*True/g, ': true').replace(/:\\s*False/g, ': false');
  repaired = repaired.replace(/,\\s*([}\\]])/g, '$1');
  try {
    return JSON.parse(repaired);
  } catch {
    // Dirty fallback regex to extract anything resembling "key": "value"
    const result: Record<string, unknown> = {};
    const regex = /"([^"]+)"\\s*:\\s*(?:"((?:\\\\"|[^"])*)"|([^\n,}]+))/g;
    let match;
    while ((match = regex.exec(args)) !== null) {
      const key = match[1];
      const stringVal = match[2];
      const otherVal = match[3];
      if (stringVal !== undefined) {
        // Unescape escaped quotes if any inside
        result[key] = stringVal.replace(/\\"/g, '"');
      } else if (otherVal !== undefined) {
        const v = otherVal.trim();
        if (v === 'true') result[key] = true;
        else if (v === 'false') result[key] = false;
        else if (v === 'null') result[key] = null;
        else if (!isNaN(Number(v)) && v !== '') result[key] = Number(v);
        else result[key] = v; // raw string fallback
      }
    }
    return result;
  }
}

/**
 * Parse tool call arguments from JSON string, with robust rescue and rewrite
 * to ensure that history passed to LLM does not contain invalid JSON, 
 * which crashes some downstream APIs (e.g. NVIDIA NIM / Llama jinja templating).
 */
export function parseToolCallArgs(toolCall: ToolCall): Record<string, unknown> {
  let args = toolCall.function.arguments;
  if (!args || args.trim() === '') {
    toolCall.function.arguments = '{}';
    return {};
  }
  
  try {
    const parsed = JSON.parse(args);
    return parsed;
  } catch {
    // Common case: LLM outputs double-encoded JSON
    if (args.startsWith('"') && args.endsWith('"')) {
      try {
        const parsed = JSON.parse(JSON.parse(args));
        toolCall.function.arguments = JSON.stringify(parsed);
        return parsed;
      } catch {
        // Fall through to rescue
      }
    }
    
    console.warn(`[Agent] Failed to parse tool call args cleanly, attempting rescue: ${args}`);
    const rescued = rescueJson(args);
    
    // CRITICAL: Rewrite the invalid string in the toolCall immediately!
    // This prevents API 500 crashes on the next iteration when history is serialized.
    toolCall.function.arguments = JSON.stringify(rescued);
    
    return rescued;
  }
}

/**
 * Create a tool call state from a tool call
 */
export function createToolCallState(
  toolCall: ToolCall,
  status: ToolCallState['status'] = 'generated'
): ToolCallState {
  return {
    toolCallId: toolCall.id,
    toolCall,
    status,
    parsedArgs: parseToolCallArgs(toolCall),
  };
}

/**
 * Check if a tool name is an edit tool (file modification)
 */
export function isEditTool(toolName: string): boolean {
  const editTools: string[] = [
    BuiltInToolNames.WriteFile,
    BuiltInToolNames.CreateFile,
    BuiltInToolNames.DeleteFile,
    BuiltInToolNames.ReplaceFileContent,
    BuiltInToolNames.MultiReplaceFileContent,
  ];
  return editTools.includes(toolName);
}

/**
 * Check if a tool name is a read-only tool
 */
export function isReadOnlyTool(toolName: string): boolean {
  const readOnlyTools: string[] = [
    BuiltInToolNames.ReadFile,
    BuiltInToolNames.ListDirectory,
    BuiltInToolNames.GrepSearch,
    BuiltInToolNames.GlobSearch,
    BuiltInToolNames.SearchInFiles,
    BuiltInToolNames.WebSearch,
    BuiltInToolNames.FetchUrl,
  ];
  return readOnlyTools.includes(toolName);
}

/**
 * Get display message for tool call status
 */
export function getToolStatusMessage(
  toolName: string,
  status: ToolCallState['status'],
  display?: ToolDisplayInfo
): string {
  const name = display?.displayTitle ?? toolName;
  
  switch (status) {
    case 'generating':
      return `Preparing ${name}...`;
    case 'generated':
      return `Ready to execute ${name}`;
    case 'pending_approval':
      return `Waiting for approval: ${name}`;
    case 'calling':
      return display?.isCurrently ?? `Running ${name}...`;
    case 'done':
      return display?.hasAlready ?? `Completed ${name}`;
    case 'errored':
      return `Error in ${name}`;
    case 'canceled':
      return `Canceled ${name}`;
    default:
      return name;
  }
}

// ============================================================================
// Tool Argument Validation
// ============================================================================

/**
 * Validate that required arguments are present
 */
export function validateRequiredArgs(
  args: Record<string, unknown>,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      missing.push(key);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Check if a value is a placeholder (undefined, null, etc.)
 */
export function isPlaceholderValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  
  const normalized = value.trim().toLowerCase();
  const placeholders = new Set([
    'undefined',
    'null',
    'none',
    'n/a',
    'na',
    'unknown',
    'todo',
    'tbd',
    'placeholder',
    'example',
    'sample',
  ]);
  
  return placeholders.has(normalized);
}

/**
 * Clean arguments by removing placeholder values
 */
export function cleanArgs(
  args: Record<string, unknown>
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(args)) {
    if (!isPlaceholderValue(value)) {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
}
