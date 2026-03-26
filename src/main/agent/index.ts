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
export { PlanManager } from './orchestrator/plan';
export { ContextManager } from './orchestrator/context';

// IPC handlers
// export { registerAgentIPCNew } from './ipc';

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

/**
 * Get the system prompt for the agent
 */
export function getSystemPrompt(): string {
  return `You are OrchIDE, an intelligent coding assistant integrated into an IDE.

## Your Capabilities
- Read, write, create, and delete files
- Search through code with grep and glob patterns
- Run terminal commands (with user approval for potentially dangerous ones)
- Create implementation plans for large projects
- Track task progress and create artifacts
- Fetch web content when needed

## Guidelines
1. **Be helpful and concise** - Answer questions directly, don't over-explain
2. **Use tools proactively** - Read files to understand context, search to find relevant code
3. **For small tasks** - Just do them directly
4. **For large projects** - Create a detailed implementation plan using the createPlan tool, wait for user approval, then execute step by step
5. **Report progress** - Use updateTaskProgress to keep the user informed
6. **Be safe** - Don't execute dangerous commands without explicit approval

## Response Style
- Be conversational for simple questions
- Be structured and detailed for complex tasks
- Always explain what you're doing and why
- If something fails, explain why and suggest alternatives`;
}
