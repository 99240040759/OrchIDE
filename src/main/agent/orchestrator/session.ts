/**
 * Agent Session
 * 
 * Main orchestrator for an agent conversation session.
 * Manages state, tool execution, plans, and streaming responses.
 */

import { EventEmitter } from 'events';
import type {
  AgentConfig,
  ChatMessage,
  Session,
  SessionMode,
  Plan,
  PlanStatus,
  ToolCall,
  ToolCallState,
  StreamEvent,
  AgentEvent,
} from '../core/types';
import { DEFAULT_AGENT_CONFIG } from '../core/types';
import { LLMClient, type LLMConfig } from '../core/llm';
import { ChatHistory } from '../core/history';
import { ToolRegistry } from '../tools/registry';
import { ALL_TOOLS } from '../tools/implementations';
import type { ToolContext, ToolResult } from '../tools/types';
import { ToolLoop } from './toolLoop';
import { PlanManager } from './plan';
import { ContextManager } from './context';
import { getSessionDir } from '../../appdata';

// ============================================================================
// Types
// ============================================================================

export interface AgentSessionConfig {
  sessionId: string;
  workspacePath: string;
  llmConfig: LLMConfig;
  agentConfig?: Partial<AgentConfig>;
  systemPrompt?: string;
}

export interface AgentSessionEvents {
  'stream': (event: StreamEvent) => void;
  'agent_event': (event: AgentEvent) => void;
  'tool_approval_required': (toolCalls: ToolCallState[]) => void;
  'plan_approval_required': (plan: Plan) => void;
  'error': (error: Error) => void;
  'complete': () => void;
}

export type SessionState = 'idle' | 'generating' | 'awaiting_tool_approval' | 'awaiting_plan_approval' | 'executing_tools' | 'error';

// ============================================================================
// Default System Prompt
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = `You are OrchIDE, an intelligent coding assistant integrated into an IDE.

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
5. **Report progress** - Use the updateTaskProgress tool heavily to maintain an active checklist. NEVER create a literal "TASKS.md" or "task_tracker.md" file in the workspace; you must EXCLUSIVELY use the updateTaskProgress tool to track tasks!
6. **Create Artifacts** - When creating deep analysis documents, reference materials, or walkthroughs, use the createArtifact tool instead of writing them out as raw console text or saving them in the user's workspace.
7. **Be safe** - Don't execute dangerous commands without explicit approval

## Response Style
- Be conversational for simple questions
- Be structured and detailed for complex tasks
- Always explain what you're doing and why
- If something fails, explain why and suggest alternatives`;

// ============================================================================
// AgentSession Class
// ============================================================================

export class AgentSession extends EventEmitter {
  readonly sessionId: string;
  readonly workspacePath: string;
  
  private llmClient: LLMClient;
  private history: ChatHistory;
  private toolRegistry: ToolRegistry;
  private toolLoop: ToolLoop;
  private planManager: PlanManager;
  private contextManager: ContextManager;
  
  private config: AgentConfig;
  private state: SessionState = 'idle';
  private abortController: AbortController | null = null;
  private currentPlan: Plan | null = null;
  private pendingToolApprovals: ToolCallState[] = [];

  constructor(sessionConfig: AgentSessionConfig) {
    super();
    
    console.log('[AgentSession] Constructor called with:', {
      sessionId: sessionConfig.sessionId,
      workspacePath: sessionConfig.workspacePath,
      hasLLMConfig: !!sessionConfig.llmConfig
    });
    
    this.sessionId = sessionConfig.sessionId;
    this.workspacePath = sessionConfig.workspacePath;
    
    console.log('[AgentSession] Step 1: Basic properties set');
    
    // Merge with default config
    this.config = {
      ...DEFAULT_AGENT_CONFIG,
      ...sessionConfig.agentConfig,
    };
    
    console.log('[AgentSession] Step 2: Config merged');
    
    // Initialize LLM client
    this.llmClient = new LLMClient(sessionConfig.llmConfig);
    
    console.log('[AgentSession] Step 3: LLM client created');
    
    // Initialize history with system prompt
    const systemPrompt = sessionConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    this.history = new ChatHistory(systemPrompt);
    
    console.log('[AgentSession] Step 4: Chat history created');
    
    // Initialize tool registry with all tools
    this.toolRegistry = new ToolRegistry();
    console.log('[AgentSession] Step 5: Tool registry created');
    
    Object.entries(ALL_TOOLS).forEach(([name, tool]) => {
      this.toolRegistry.register(tool);
    });
    
    console.log('[AgentSession] Step 6: Tools registered:', Object.keys(ALL_TOOLS).length);
    
    // Initialize managers
    this.planManager = new PlanManager(this);
    console.log('[AgentSession] Step 7: Plan manager created');
    
    this.contextManager = new ContextManager(this.history, this.config);
    console.log('[AgentSession] Step 8: Context manager created');
    
    // Initialize tool loop
    this.toolLoop = new ToolLoop({
      session: this,
      llmClient: this.llmClient,
      history: this.history,
      toolRegistry: this.toolRegistry,
      config: this.config,
      onStream: (event) => this.emit('stream', event),
      onAgentEvent: (event) => this.emit('agent_event', event),
      onToolApprovalRequired: (calls) => this.handleToolApprovalRequired(calls),
    });
    
    console.log('[AgentSession] Step 9: Tool loop created - CONSTRUCTOR COMPLETE');
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Send a message and get a response
   */
  async chat(userMessage: string): Promise<void> {
    console.log('[AgentSession] chat() called with message:', userMessage.substring(0, 100) + '...');
    
    if (this.state !== 'idle' && this.state !== 'error') {
      const error = `Cannot send message in state: ${this.state}`;
      console.error('[AgentSession]', error);
      throw new Error(error);
    }

    console.log('[AgentSession] Setting state to generating...');
    this.state = 'generating';
    this.abortController = new AbortController();

    try {
      // Add user message to history
      console.log('[AgentSession] Adding user message to history...');
      this.history.addUserMessage(userMessage);
      
      console.log('[AgentSession] History length after adding user message:', this.history.length);
      console.log('[AgentSession] Last message:', this.history.getLast()?.message);
      
      // Check if we need context compaction
      console.log('[AgentSession] Checking context compaction...');
      await this.contextManager.checkAndCompact();
      
      console.log('[AgentSession] Starting tool loop...');
      // Run the tool loop
      await this.toolLoop.run(this.abortController.signal);
      
      console.log('[AgentSession] Tool loop completed, setting state to idle');
      this.state = 'idle';
      this.emit('complete');
    } catch (error) {
      console.error('[AgentSession] Error in chat():', error);
      console.error('[AgentSession] Error stack:', error instanceof Error ? error.stack : 'No stack');
      this.state = 'error';
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Abort the current operation
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Approve pending tool calls
   */
  async approveToolCalls(toolCallIds: string[]): Promise<void> {
    if (this.state !== 'awaiting_tool_approval') {
      throw new Error('No tool calls pending approval');
    }

    const approved = this.pendingToolApprovals.filter(tc => toolCallIds.includes(tc.toolCallId));
    const rejected = this.pendingToolApprovals.filter(tc => !toolCallIds.includes(tc.toolCallId));

    // Mark rejected as errored
    for (const tc of rejected) {
      this.history.updateToolCallStatus(tc.toolCallId, 'errored');
    }

    // Clear pending approvals
    this.pendingToolApprovals = [];
    
    if (approved.length > 0) {
      // Mark approved tool calls as ready to execute
      for (const tc of approved) {
        this.history.updateToolCallStatus(tc.toolCallId, 'generated');
      }
      
      // Continue the tool loop - it will pick up the approved tools
      this.state = 'generating';
      this.abortController = new AbortController();
      
      try {
        await this.toolLoop.run(this.abortController.signal);
        this.state = 'idle';
        this.emit('complete');
      } catch (error) {
        this.state = 'error';
        const err = error instanceof Error ? error : new Error(String(error));
        this.emit('error', err);
        throw err;
      }
    } else {
      // All rejected - add rejection message and continue
      this.history.addAssistantMessage('I understand. I won\'t proceed with those actions.');
      this.state = 'idle';
      this.emit('complete');
    }
  }

  /**
   * Reject all pending tool calls
   */
  async rejectToolCalls(): Promise<void> {
    return this.approveToolCalls([]);
  }

  /**
   * Approve a plan for execution
   */
  async approvePlan(planId: string): Promise<void> {
    if (this.state !== 'awaiting_plan_approval') {
      throw new Error('No plan pending approval');
    }

    if (!this.currentPlan || this.currentPlan.id !== planId) {
      throw new Error('Plan not found');
    }

    this.currentPlan.status = 'approved';
    this.state = 'generating';
    
    // Continue execution with the plan
    await this.planManager.executePlan(this.currentPlan);
    
    this.state = 'idle';
    this.emit('complete');
  }

  /**
   * Reject a plan
   */
  async rejectPlan(planId: string, reason?: string): Promise<void> {
    if (this.state !== 'awaiting_plan_approval') {
      throw new Error('No plan pending approval');
    }

    if (!this.currentPlan || this.currentPlan.id !== planId) {
      throw new Error('Plan not found');
    }

    this.currentPlan.status = 'failed'; // No 'rejected' status in PlanStatus
    this.currentPlan = null;
    this.state = 'idle';
    
    // Add rejection message
    const msg = reason 
      ? `I understand. I won't proceed with that plan. You mentioned: "${reason}". Let me know if you'd like me to adjust the approach.`
      : `I understand. I won't proceed with that plan. Let me know if you'd like to try a different approach.`;
    
    this.history.addAssistantMessage(msg);
    this.emit('complete');
  }

  /**
   * Get current state
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Get conversation history
   */
  getHistory(): ChatMessage[] {
    return this.history.toMessages();
  }

  /**
   * Get current plan if any
   */
  getCurrentPlan(): Plan | null {
    return this.currentPlan;
  }

  /**
   * Get tool context for tool execution
   */
  getToolContext(): ToolContext {
    return {
      config: this.config,
      workspacePath: this.workspacePath,
      sessionId: this.sessionId,
      sessionPath: getSessionDir(this.sessionId),
      signal: this.abortController?.signal,
      sendEvent: (event: unknown) => this.emit('agent_event', event),
    };
  }

  /**
   * Export session for persistence
   */
  export(): Session {
    return {
      id: this.sessionId,
      title: 'Agent Session', // Would need to generate or track this
      mode: 'agent' as SessionMode,
      workspacePath: this.workspacePath,
      history: [], // Would need to convert ChatMessage[] to ChatHistoryItemWithId[]
      plan: this.currentPlan ?? undefined,
      isStreaming: this.state === 'generating',
      createdAt: Date.now(), // Would need to track this properly
      updatedAt: Date.now(),
    };
  }

  /**
   * Restore session from persisted state
   */
  restore(session: Session): void {
    // Restore chat history (simplified - would need proper conversion)
    // The Session.history is ChatHistoryItemWithId[], but our ChatHistory works with ChatMessage[]
    // For now, we'll skip the full restoration implementation
    
    // Restore plan
    if (session.plan) {
      this.currentPlan = session.plan;
    }
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  private async handleToolApprovalRequired(toolCalls: ToolCallState[]): Promise<void> {
    this.state = 'awaiting_tool_approval';
    this.pendingToolApprovals = toolCalls;
    this.emit('tool_approval_required', toolCalls);
  }

  /** Called by PlanManager when a plan needs approval */
  handlePlanCreated(plan: Plan): void {
    this.currentPlan = plan;
    
    if (this.config.requirePlanApproval) {
      this.state = 'awaiting_plan_approval';
      this.emit('plan_approval_required', plan);
    } else {
      // Auto-approve
      plan.status = 'approved';
    }
  }
}

// Re-export for convenience
export { ToolLoop } from './toolLoop';
export { PlanManager } from './plan';
export { ContextManager } from './context';
