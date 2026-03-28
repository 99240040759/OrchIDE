/**
 * Mode-Based Execution Boundaries
 *
 * Implements strict mode enforcement for the agentic orchestrator.
 * Each mode defines which tools are available, preventing impulsive actions.
 *
 * Modes:
 * - PLANNING:     Read tools + artifact writes. No code modifications.
 * - EXECUTION:    All tools unlocked. Implementation phase.
 * - VERIFICATION: Read + test tools. Proves implementation works.
 * - RESEARCH:     Read + web tools. Information gathering.
 *
 * Mode transitions are explicit and logged for debugging.
 */

// ============================================================================
// Types
// ============================================================================

export type AgentMode = 'planning' | 'execution' | 'verification' | 'research';

export interface ModeConfig {
  /** Human-readable name */
  name: string;
  /** Description of what this mode is for */
  description: string;
  /** Tools allowed in this mode */
  allowedTools: Set<string>;
  /** Tools explicitly forbidden (overrides allowed) */
  forbiddenTools: Set<string>;
  /** Whether to allow artifact creation */
  allowArtifacts: boolean;
  /** Whether to require explicit approval for mode transition */
  requireApprovalToExit: boolean;
  /** Color for UI display */
  color: string;
}

export interface ModeTransition {
  from: AgentMode;
  to: AgentMode;
  timestamp: number;
  reason: string;
}

export interface ModeState {
  current: AgentMode;
  history: ModeTransition[];
  startedAt: number;
  toolCallCount: number;
}

export interface ToolPermissionResult {
  allowed: boolean;
  reason: string;
  suggestedMode?: AgentMode;
}

// ============================================================================
// Tool Categories
// ============================================================================

/** Read-only tools that don't modify anything */
export const READ_TOOLS = new Set([
  'readFile',
  'listDirectory',
  'searchInFiles',
  'grepSearch',
  'globSearch',
  'getCommandStatus',
]);

/** Tools that modify files */
export const WRITE_TOOLS = new Set([
  'writeFile',
  'createFile',
  'deleteFile',
  'replaceFileContent',
  'multiReplaceFileContent',
]);

/** Tools for running commands */
export const TERMINAL_TOOLS = new Set([
  'runTerminalCommand',
  'startTerminalCommand',
  'sendCommandInput',
]);

/** Web/research tools */
export const WEB_TOOLS = new Set([
  'webSearch',
  'fetchUrl',
]);

/** Agent coordination tools */
export const AGENT_TOOLS = new Set([
  'taskBoundary',
  'updateTaskProgress',
  'createArtifact',
  'notifyUser',
]);

/** Testing-related terminal commands (patterns) */
export const TEST_COMMAND_PATTERNS = [
  /^npm\s+(run\s+)?test/i,
  /^yarn\s+test/i,
  /^pnpm\s+test/i,
  /^pytest/i,
  /^jest/i,
  /^vitest/i,
  /^cargo\s+test/i,
  /^go\s+test/i,
  /^dotnet\s+test/i,
  /^make\s+test/i,
  /^rspec/i,
  /^mocha/i,
];

/** Build commands (allowed in verification) */
export const BUILD_COMMAND_PATTERNS = [
  /^npm\s+(run\s+)?build/i,
  /^yarn\s+build/i,
  /^pnpm\s+build/i,
  /^cargo\s+build/i,
  /^go\s+build/i,
  /^make(\s+build)?$/i,
  /^tsc/i,
  /^webpack/i,
  /^vite\s+build/i,
];

// ============================================================================
// Mode Configurations
// ============================================================================

export const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
  planning: {
    name: 'Planning',
    description: 'Analyze codebase, create plans, write artifacts. No code modifications.',
    allowedTools: new Set([
      ...READ_TOOLS,
      ...AGENT_TOOLS,
    ]),
    forbiddenTools: new Set([
      ...WRITE_TOOLS,
      'runTerminalCommand',
      'startTerminalCommand',
      'sendCommandInput',
    ]),
    allowArtifacts: true,
    requireApprovalToExit: true,
    color: '#3b82f6', // blue
  },

  execution: {
    name: 'Execution',
    description: 'Full access to all tools. Implementation phase.',
    allowedTools: new Set([
      ...READ_TOOLS,
      ...WRITE_TOOLS,
      ...TERMINAL_TOOLS,
      ...WEB_TOOLS,
      ...AGENT_TOOLS,
    ]),
    forbiddenTools: new Set(), // Nothing forbidden
    allowArtifacts: true,
    requireApprovalToExit: false,
    color: '#22c55e', // green
  },

  verification: {
    name: 'Verification',
    description: 'Run tests, validate changes. Limited modifications.',
    allowedTools: new Set([
      ...READ_TOOLS,
      ...AGENT_TOOLS,
      'runTerminalCommand',
      'startTerminalCommand',
      'getCommandStatus',
    ]),
    forbiddenTools: new Set([
      ...WRITE_TOOLS,
      'sendCommandInput', // Can't interact with running processes
    ]),
    allowArtifacts: true,
    requireApprovalToExit: false,
    color: '#f59e0b', // amber
  },

  research: {
    name: 'Research',
    description: 'Information gathering. Read and web tools only.',
    allowedTools: new Set([
      ...READ_TOOLS,
      ...WEB_TOOLS,
      ...AGENT_TOOLS,
    ]),
    forbiddenTools: new Set([
      ...WRITE_TOOLS,
      ...TERMINAL_TOOLS,
    ]),
    allowArtifacts: true,
    requireApprovalToExit: false,
    color: '#8b5cf6', // purple
  },
};

// ============================================================================
// Mode Enforcer Class
// ============================================================================

export class ModeEnforcer {
  private state: ModeState;
  private onModeChange?: (transition: ModeTransition) => void;

  constructor(
    initialMode: AgentMode = 'execution',
    onModeChange?: (transition: ModeTransition) => void
  ) {
    this.state = {
      current: initialMode,
      history: [],
      startedAt: Date.now(),
      toolCallCount: 0,
    };
    this.onModeChange = onModeChange;
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  /**
   * Get the current mode.
   */
  getCurrentMode(): AgentMode {
    return this.state.current;
  }

  /**
   * Get the current mode configuration.
   */
  getModeConfig(): ModeConfig {
    return MODE_CONFIGS[this.state.current];
  }

  /**
   * Get the full mode state.
   */
  getState(): Readonly<ModeState> {
    return { ...this.state };
  }

  /**
   * Get mode history.
   */
  getHistory(): ModeTransition[] {
    return [...this.state.history];
  }

  // ==========================================================================
  // Mode Transitions
  // ==========================================================================

  /**
   * Transition to a new mode.
   */
  transitionTo(newMode: AgentMode, reason: string): boolean {
    if (newMode === this.state.current) {
      return true; // Already in this mode
    }

    const currentConfig = MODE_CONFIGS[this.state.current];

    // Check if approval is required to exit current mode
    if (currentConfig.requireApprovalToExit) {
      console.log(`[Mode] Transition from ${this.state.current} requires approval`);
      // In a full implementation, this would pause and wait for user approval
      // For now, we log and proceed
    }

    const transition: ModeTransition = {
      from: this.state.current,
      to: newMode,
      timestamp: Date.now(),
      reason,
    };

    this.state.history.push(transition);
    this.state.current = newMode;
    this.state.toolCallCount = 0;

    console.log(`[Mode] Transitioned: ${transition.from} → ${transition.to} (${reason})`);

    if (this.onModeChange) {
      this.onModeChange(transition);
    }

    return true;
  }

  /**
   * Suggest a mode based on the task description.
   */
  suggestMode(taskDescription: string): AgentMode {
    const lower = taskDescription.toLowerCase();

    // Planning indicators
    if (
      lower.includes('plan') ||
      lower.includes('design') ||
      lower.includes('architect') ||
      lower.includes('outline') ||
      lower.includes('proposal')
    ) {
      return 'planning';
    }

    // Research indicators
    if (
      lower.includes('research') ||
      lower.includes('investigate') ||
      lower.includes('find out') ||
      lower.includes('what is') ||
      lower.includes('how does')
    ) {
      return 'research';
    }

    // Verification indicators
    if (
      lower.includes('test') ||
      lower.includes('verify') ||
      lower.includes('validate') ||
      lower.includes('check if') ||
      lower.includes('confirm')
    ) {
      return 'verification';
    }

    // Default to execution
    return 'execution';
  }

  // ==========================================================================
  // Tool Permission Checking
  // ==========================================================================

  /**
   * Check if a tool is allowed in the current mode.
   */
  checkToolPermission(toolName: string, args?: Record<string, unknown>): ToolPermissionResult {
    const config = MODE_CONFIGS[this.state.current];

    // Explicitly forbidden always blocks
    if (config.forbiddenTools.has(toolName)) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' is forbidden in ${config.name} mode.`,
        suggestedMode: this.suggestModeForTool(toolName),
      };
    }

    // Check if explicitly allowed
    if (config.allowedTools.has(toolName)) {
      // Special handling for terminal commands in verification mode
      if (this.state.current === 'verification' && 
          (toolName === 'runTerminalCommand' || toolName === 'startTerminalCommand')) {
        return this.checkVerificationTerminalCommand(args);
      }

      return { allowed: true, reason: 'Tool is allowed in current mode.' };
    }

    // Tool not in allowed list
    return {
      allowed: false,
      reason: `Tool '${toolName}' is not available in ${config.name} mode.`,
      suggestedMode: this.suggestModeForTool(toolName),
    };
  }

  /**
   * Check if a terminal command is allowed in verification mode.
   * Only test and build commands are permitted.
   */
  private checkVerificationTerminalCommand(args?: Record<string, unknown>): ToolPermissionResult {
    const command = (args?.command as string) || '';

    // Security check: reject chaining or background operators
    if (/[&|;]/.test(command)) {
      return {
        allowed: false,
        reason: 'Command chaining or background execution (&, |, ;) is not allowed in Verification mode.',
        suggestedMode: 'execution',
      };
    }

    const cmdLower = command.toLowerCase().trim();

    // Check if it's a test command
    for (const pattern of TEST_COMMAND_PATTERNS) {
      if (pattern.test(cmdLower)) {
        return { allowed: true, reason: 'Test command allowed in Verification mode.' };
      }
    }

    // Check if it's a build command
    for (const pattern of BUILD_COMMAND_PATTERNS) {
      if (pattern.test(cmdLower)) {
        return { allowed: true, reason: 'Build command allowed in Verification mode.' };
      }
    }

    // Not a test/build command
    return {
      allowed: false,
      reason: `Command '${command}' is not a recognized test or build command. ` +
              `Only test/build commands are allowed in Verification mode.`,
      suggestedMode: 'execution',
    };
  }

  /**
   * Suggest the appropriate mode for a tool.
   */
  private suggestModeForTool(toolName: string): AgentMode {
    if (WRITE_TOOLS.has(toolName)) {
      return 'execution';
    }
    if (WEB_TOOLS.has(toolName)) {
      return 'research';
    }
    if (TERMINAL_TOOLS.has(toolName)) {
      return 'execution';
    }
    return 'execution';
  }

  // ==========================================================================
  // Tool Call Tracking
  // ==========================================================================

  /**
   * Record a tool call (for statistics).
   */
  recordToolCall(): void {
    this.state.toolCallCount++;
  }

  /**
   * Get tool call count for current mode session.
   */
  getToolCallCount(): number {
    return this.state.toolCallCount;
  }

  // ==========================================================================
  // Mode-Specific Tool Lists
  // ==========================================================================

  /**
   * Get list of allowed tools for current mode.
   */
  getAllowedTools(): string[] {
    const config = MODE_CONFIGS[this.state.current];
    return Array.from(config.allowedTools).filter(t => !config.forbiddenTools.has(t));
  }

  /**
   * Get list of forbidden tools for current mode.
   */
  getForbiddenTools(): string[] {
    const config = MODE_CONFIGS[this.state.current];
    return Array.from(config.forbiddenTools);
  }

  /**
   * Filter a tool registry to only include allowed tools.
   */
  filterTools<T extends { definition: { function: { name: string } } }>(
    tools: Record<string, T>
  ): Record<string, T> {
    const config = MODE_CONFIGS[this.state.current];
    const filtered: Record<string, T> = {};

    for (const [name, tool] of Object.entries(tools)) {
      if (config.allowedTools.has(name) && !config.forbiddenTools.has(name)) {
        filtered[name] = tool;
      }
    }

    return filtered;
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Export state for persistence.
   */
  export(): ModeState {
    return { ...this.state, history: [...this.state.history] };
  }

  /**
   * Import state from persistence.
   */
  import(state: ModeState): void {
    this.state = { ...state, history: [...state.history] };
  }

  /**
   * Reset to initial state.
   */
  reset(initialMode: AgentMode = 'execution'): void {
    this.state = {
      current: initialMode,
      history: [],
      startedAt: Date.now(),
      toolCallCount: 0,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a mode enforcer with default settings.
 */
export function createModeEnforcer(
  initialMode: AgentMode = 'execution',
  onModeChange?: (transition: ModeTransition) => void
): ModeEnforcer {
  return new ModeEnforcer(initialMode, onModeChange);
}

/**
 * Get mode configuration by name.
 */
export function getModeConfig(mode: AgentMode): ModeConfig {
  return MODE_CONFIGS[mode];
}

/**
 * Get all mode names.
 */
export function getAllModes(): AgentMode[] {
  return Object.keys(MODE_CONFIGS) as AgentMode[];
}

/**
 * Check if a tool is a write tool.
 */
export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName);
}

/**
 * Check if a tool is a read-only tool.
 */
export function isReadTool(toolName: string): boolean {
  return READ_TOOLS.has(toolName);
}

/**
 * Format mode for display in system prompt.
 */
export function formatModeForPrompt(mode: AgentMode): string {
  const config = MODE_CONFIGS[mode];
  const allowed = Array.from(config.allowedTools).join(', ');
  const forbidden = config.forbiddenTools.size > 0
    ? `\nForbidden: ${Array.from(config.forbiddenTools).join(', ')}`
    : '';

  return `
## Current Mode: ${config.name}

${config.description}

**Allowed Tools:** ${allowed}${forbidden}

**Artifacts:** ${config.allowArtifacts ? 'Enabled' : 'Disabled'}
`.trim();
}

export default ModeEnforcer;
