/**
 * Agent Framework Index
 *
 * Main entry point for the OrchIDE agent framework.
 * Exports all public APIs.
 */

// Core types
export type {
  ChatMessage,
  ToolCall,
  ToolCallState,
  Session,
  Plan,
  PlanStep,
  TaskStatus,
  StreamEvent,
  AgentEvent,
  AgentConfig,
  ContextItem,
  ToolCallStatus,
  SessionMode,
} from './core/types';

export { DEFAULT_AGENT_CONFIG } from './core/types';

// LLM client
export { LLMClient } from './core/llm';

// Chat history
export { ChatHistory } from './core/history';

// Token utilities
export { estimateTokens } from './core/tokens';

// Tool system
export type {
  Tool,
  ToolContext,
  ToolResult,
} from './tools/types';

export { ToolRegistry } from './tools/registry';
export { evaluateToolPolicy, DEFAULT_TOOL_POLICIES } from './tools/policies';
export { ALL_TOOLS, TOOL_GROUPS, getToolDefinitionsForLLM, getToolsForPurpose } from './tools/implementations';

// Orchestrator
export { AgentSession } from './orchestrator';
export type { AgentSessionConfig, SessionState } from './orchestrator';

export { ToolLoop } from './orchestrator/toolLoop';
export { ContextManager } from './orchestrator/context';

// ============================================================================
// Factory Functions
// ============================================================================

import { AgentSession, AgentSessionConfig } from './orchestrator';
import { loadSettings } from '../appdata';

/**
 * Create a new agent session with default configuration
 */
export function createAgentSession(
  sessionId: string,
  workspacePath: string,
  options?: Partial<AgentSessionConfig>
): AgentSession {
  const settings = loadSettings();

  const config: AgentSessionConfig = {
    sessionId,
    workspacePath,
    llmConfig: {
      apiBase: settings.nimBaseUrl || 'http://localhost:8000/v1',
      apiKey: settings.nimApiKey || '',
      model: settings.nimModel || 'meta/llama-3.3-70b-instruct',
    },
    ...options,
  };

  return new AgentSession(config);
}
