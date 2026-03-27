/**
 * Agent Session — Antigravity-Level Orchestrator
 *
 * Main orchestrator for an agent conversation session.
 * Manages state, tool execution, streaming responses, and task boundary lifecycle.
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
import { ContextManager } from './context';
import { buildSystemPrompt } from './systemPrompt';
import { getSessionDir } from '../../appdata';
import { loadSettings } from '../../appdata';
import { KnowledgeItemManager } from './knowledgeItems';
import { ModeEnforcer, type AgentMode, type ToolPermissionResult } from './modeEnforcement';

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

export type SessionState = 'idle' | 'generating' | 'awaiting_tool_approval' | 'awaiting_plan_approval' | 'awaiting_user_notify' | 'executing_tools' | 'error';

// System prompt is now in ./systemPrompt.ts (3650+ lines)

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
  private contextManager: ContextManager;
  private kiManager: KnowledgeItemManager;
  private modeEnforcer: ModeEnforcer;
  
  private config: AgentConfig;
  private state: SessionState = 'idle';
  private abortController: AbortController | null = null;
  private currentPlan: Plan | null = null;
  private pendingToolApprovals: ToolCallState[] = [];
  
  // Notify user gate: resolve this to unblock the tool loop
  private notifyResolve: (() => void) | null = null;

  constructor(sessionConfig: AgentSessionConfig) {
    super();
    
    this.sessionId = sessionConfig.sessionId;
    this.workspacePath = sessionConfig.workspacePath;
    
    // Merge with default config
    this.config = {
      ...DEFAULT_AGENT_CONFIG,
      ...sessionConfig.agentConfig,
    };
    
    // Initialize LLM client
    this.llmClient = new LLMClient(sessionConfig.llmConfig);
    
    // Initialize KI (Knowledge Item) Manager for persistent workspace memory
    this.kiManager = new KnowledgeItemManager({
      workspacePath: this.workspacePath,
      maxContextTokens: 6000,
      enableAutoDiscovery: true,
    });
    
    // Initialize Mode Enforcer for execution boundaries
    this.modeEnforcer = new ModeEnforcer();
    
    // Build the full Antigravity-level system prompt with KI context
    const sessionDir = getSessionDir(this.sessionId);
    
    // Load knowledge items for context injection (sync for now, will be empty on first load)
    const kiContext = this.kiManager.selectForContext(6000).items
      .map(ki => `### ${ki.name}\n${ki.content}`)
      .join('\n\n');
    
    const systemPrompt = sessionConfig.systemPrompt || buildSystemPrompt({
      workspacePath: this.workspacePath,
      workspaceName: sessionConfig.agentConfig?.workspaceName || '',
      sessionId: this.sessionId,
      platform: process.platform,
      sessionStoragePath: sessionDir,
      knowledgeContext: kiContext, // Inject KI context
      currentMode: this.modeEnforcer.getCurrentMode(), // Inject current mode
    });
    this.history = new ChatHistory(systemPrompt);
    
    // Initialize tool registry with all 21 tools
    this.toolRegistry = new ToolRegistry();
    Object.entries(ALL_TOOLS).forEach(([_name, tool]) => {
      this.toolRegistry.register(tool);
    });
    
    // Initialize context manager
    this.contextManager = new ContextManager(this.history, this.config);
    
    // Initialize tool loop with mode enforcer
    this.toolLoop = new ToolLoop({
      session: this,
      llmClient: this.llmClient,
      history: this.history,
      toolRegistry: this.toolRegistry,
      config: this.config,
      contextManager: this.contextManager,
      modeEnforcer: this.modeEnforcer,
      onStream: (event) => this.emit('stream', event),
      onAgentEvent: (event) => this.emit('agent_event', event),
      onToolApprovalRequired: (calls) => this.handleToolApprovalRequired(calls),
    });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Send a message and get a response
   */
  async chat(userMessage: string): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'error') {
      throw new Error(`Cannot send message in state: ${this.state}`);
    }

    this.state = 'generating';
    this.abortController = new AbortController();

    try {
      this.history.addUserMessage(userMessage);
      await this.contextManager.checkAndCompact();
      await this.toolLoop.run(this.abortController.signal);
      this.state = 'idle';
      this.emit('complete');
    } catch (error) {
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
    
    // Plans are now tracked via taskBoundary system — 
    // resume the tool loop so the agent can execute based on the approved plan
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
   * Get tool context for tool execution — FIXED: passes settings for web search
   */
  getToolContext(): ToolContext {
    let settings: Record<string, string> | undefined;
    try {
      settings = loadSettings();
    } catch {
      settings = undefined;
    }

    return {
      config: this.config,
      workspacePath: this.workspacePath,
      workspaceName: this.config.workspaceName,
      sessionId: this.sessionId,
      sessionPath: getSessionDir(this.sessionId),
      settings,  // ← FIX: Tavily key is now accessible
      signal: this.abortController?.signal,
      sendEvent: (event: unknown) => this.emit('agent_event', event),
    };
  }

  /**
   * Resume from a notifyUser block (called from IPC when user responds)
   */
  resumeFromNotify(): void {
    if (this.state === 'awaiting_user_notify' && this.notifyResolve) {
      this.notifyResolve();
      this.notifyResolve = null;
      this.state = 'generating';
    }
  }

  /**
   * Set state to awaiting_user_notify and return a promise that resolves
   * when resumeFromNotify() is called. Used by notifyUser tool.
   */
  waitForUserNotify(): Promise<void> {
    this.state = 'awaiting_user_notify';
    return new Promise<void>((resolve) => {
      this.notifyResolve = resolve;
    });
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
  // Mode Control API
  // ==========================================================================

  /**
   * Get the current agent mode
   */
  getMode(): AgentMode {
    return this.modeEnforcer.getCurrentMode();
  }

  /**
   * Set the agent mode (planning, execution, verification)
   */
  setMode(mode: AgentMode, reason: string = 'User request'): void {
    this.modeEnforcer.transitionTo(mode, reason);
    this.emit('agent_event', {
      type: 'mode_changed',
      mode,
      timestamp: Date.now(),
    });
  }

  /**
   * Validate if a tool is allowed in the current mode
   */
  validateToolForMode(toolName: string): ToolPermissionResult {
    return this.modeEnforcer.checkToolPermission(toolName);
  }

  // ==========================================================================
  // Knowledge Item API
  // ==========================================================================

  /**
   * Get the KI manager for external access
   */
  getKIManager(): KnowledgeItemManager {
    return this.kiManager;
  }

  /**
   * Refresh knowledge items from disk
   */
  async refreshKnowledgeItems(): Promise<void> {
    await this.kiManager.scanKnowledgeItems();
  }

  /**
   * Create a new knowledge item
   */
  async createKnowledgeItem(
    id: string,
    content: string,
    metadata?: { category?: string; priority?: number; tags?: string[] }
  ): Promise<void> {
    await this.kiManager.save(id, content, {
      category: metadata?.category as any,
      priority: metadata?.priority,
      tags: metadata?.tags,
    });
  }

  /**
   * Update an existing knowledge item
   */
  async updateKnowledgeItem(id: string, content: string): Promise<void> {
    await this.kiManager.save(id, content);
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  private async handleToolApprovalRequired(toolCalls: ToolCallState[]): Promise<void> {
    this.state = 'awaiting_tool_approval';
    this.pendingToolApprovals = toolCalls;
    this.emit('tool_approval_required', toolCalls);
  }

  /** Handle plan creation (legacy — kept for compatibility) */
  handlePlanCreated(plan: Plan): void {
    this.currentPlan = plan;
    
    if (this.config.requirePlanApproval) {
      this.state = 'awaiting_plan_approval';
      this.emit('plan_approval_required', plan);
    } else {
      plan.status = 'approved';
    }
  }
}

// Re-export for convenience
export { ToolLoop } from './toolLoop';
export { ContextManager } from './context';
export { buildSystemPrompt } from './systemPrompt';
