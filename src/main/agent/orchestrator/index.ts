/**
 * Orchestrator Index
 *
 * Exports all orchestrator components for the Antigravity-level agentic framework.
 */

// Core session management
export { AgentSession } from './session';
export type { AgentSessionConfig, AgentSessionEvents, SessionState } from './session';

// Tool execution loop
export { ToolLoop } from './toolLoop';
export type { ToolLoopConfig } from './toolLoop';

// Context and memory management
export { ContextManager } from './context';

// Knowledge Item (KI) System - persistent workspace memory
export { KnowledgeItemManager } from './knowledgeItems';
export type { KnowledgeItem, KICategory, KIManagerConfig, KIContextSelection } from './knowledgeItems';

// Mode-based execution boundaries
export { ModeEnforcer, READ_TOOLS, WRITE_TOOLS, TERMINAL_TOOLS, WEB_TOOLS, AGENT_TOOLS, MODE_CONFIGS } from './modeEnforcement';
export type { AgentMode, ModeConfig, ModeState, ModeTransition, ToolPermissionResult } from './modeEnforcement';

// Intelligent truncation utilities
export { 
  truncateHeadTail, 
  truncateToolResult, 
  truncateTerminalOutput, 
  truncateJSON, 
  truncateDiff,
  DEFAULT_TRUNCATION_CONFIG,
  TERMINAL_TRUNCATION_CONFIG,
} from './truncation';
export type { TruncationConfig } from './truncation';

// System prompt builder
export { buildSystemPrompt } from './systemPrompt';
export type { SystemPromptParams } from './systemPrompt';
