/**
 * Tool Registry
 * 
 * Manages tool definitions, implementations, and policies.
 * Central hub for all tool operations in the agent framework.
 */

import type {
  ToolDefinition,
  ToolCall,
  ToolPolicy,
  ToolSettings,
  ToolParameterProperty,
} from '../core/types';
import type {
  Tool,
  ToolContext,
  ToolResult,
  ToolRegistryConfig,
  ToolGroup,
  ToolOverride,
} from './types';
import { parseToolCallArgs } from './types';
import {
  getToolPolicy,
  evaluateToolPolicy,
  createDefaultToolSettings,
} from './policies';

// ============================================================================
// Tool Registry
// ============================================================================

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private groups: Map<string, ToolGroup> = new Map();
  private settings: ToolSettings;
  private overrides: ToolOverride[] = [];

  constructor(config?: ToolRegistryConfig) {
    this.settings = createDefaultToolSettings();
    
    if (config) {
      if (config.policyOverrides) {
        for (const [name, policy] of Object.entries(config.policyOverrides)) {
          this.settings.overrides.push({ toolName: name, policy });
        }
      }
      if (config.toolOverrides) {
        this.overrides = config.toolOverrides;
      }
    }
  }

  // ============================================================================
  // Tool Registration
  // ============================================================================

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    const name = tool.definition.function.name;
    
    // Apply any overrides
    const override = this.overrides.find(o => o.toolName === name);
    if (override?.disabled) {
      return; // Don't register disabled tools
    }
    
    let finalTool = tool;
    if (override) {
      finalTool = {
        ...tool,
        display: { ...tool.display, ...override.display },
        behavior: { ...tool.behavior, ...override.behavior },
      };
    }
    
    this.tools.set(name, finalTool);
  }

  /**
   * Register multiple tools
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tools
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  // ============================================================================
  // Tool Groups
  // ============================================================================

  /**
   * Register a tool group
   */
  registerGroup(group: ToolGroup): void {
    this.groups.set(group.name, group);
  }

  /**
   * Get tools by group
   */
  getByGroup(groupName: string): Tool[] {
    const group = this.groups.get(groupName);
    if (!group) return [];
    
    return group.tools
      .map(name => this.tools.get(name))
      .filter((t): t is Tool => t !== undefined);
  }

  // ============================================================================
  // Tool Definitions (for LLM)
  // ============================================================================

  /**
   * Get all tool definitions for LLM
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Get enabled tool definitions based on mode
   */
  getEnabledDefinitions(mode: 'chat' | 'agent'): ToolDefinition[] {
    const tools = Array.from(this.tools.values());
    
    return tools
      .filter(tool => {
        // In chat mode, only include non-file tools
        if (mode === 'chat') {
          const name = tool.definition.function.name;
          const fileTools = ['readFile', 'writeFile', 'createFile', 'deleteFile', 
                           'listDirectory', 'grepSearch', 'globSearch', 'searchInFiles',
                           'runTerminalCommand'];
          return !fileTools.includes(name);
        }
        return true;
      })
      .filter(tool => {
        // Check policy - don't include disabled tools
        const policy = getToolPolicy(
          tool.definition.function.name,
          tool,
          this.settings
        );
        return policy !== 'disabled';
      })
      .map(t => t.definition);
  }

  // ============================================================================
  // Policy Management
  // ============================================================================

  /**
   * Get tool settings
   */
  getSettings(): ToolSettings {
    return { ...this.settings };
  }

  /**
   * Update tool settings
   */
  updateSettings(settings: Partial<ToolSettings>): void {
    if (settings.defaults) {
      this.settings.defaults = { ...this.settings.defaults, ...settings.defaults };
    }
    if (settings.overrides) {
      this.settings.overrides = settings.overrides;
    }
  }

  /**
   * Set policy for a tool
   */
  setPolicy(toolName: string, policy: ToolPolicy): void {
    const existing = this.settings.overrides.findIndex(o => o.toolName === toolName);
    if (existing >= 0) {
      this.settings.overrides[existing].policy = policy;
    } else {
      this.settings.overrides.push({ toolName, policy });
    }
  }

  /**
   * Get policy for a tool
   */
  getPolicy(toolName: string): ToolPolicy {
    return getToolPolicy(toolName, this.get(toolName), this.settings);
  }

  /**
   * Evaluate policy for a tool call
   */
  async evaluatePolicy(
    toolCall: ToolCall,
    context: ToolContext
  ): Promise<{
    policy: ToolPolicy;
    reason?: string;
    processedArgs?: Record<string, unknown>;
  }> {
    const tool = this.get(toolCall.function.name);
    return evaluateToolPolicy(toolCall, tool, this.settings, context);
  }

  // ============================================================================
  // Tool Execution
  // ============================================================================

  /**
   * Execute a tool call
   */
  async execute(
    toolCall: ToolCall,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.get(toolCall.function.name);
    
    if (!tool) {
      return {
        output: [{
          name: 'Error',
          description: 'Tool not found',
          content: `Tool "${toolCall.function.name}" is not registered`,
        }],
        success: false,
        error: `Tool "${toolCall.function.name}" not found`,
      };
    }

    try {
      // Parse arguments
      let args = parseToolCallArgs(toolCall);
      
      // Preprocess arguments if available
      if (tool.preprocessArgs) {
        const result = await tool.preprocessArgs(args, context);
        args = result.args;
      }

      // Execute with timeout
      const timeoutMs = tool.behavior.timeoutMs ?? context.config.toolTimeoutMs;
      const result = await withTimeout(
        tool.execute(args, context),
        timeoutMs,
        `Tool "${toolCall.function.name}" timed out after ${timeoutMs}ms`
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        output: [{
          name: 'Error',
          description: 'Tool execution failed',
          content: errorMessage,
          icon: 'error',
        }],
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute multiple tool calls (respecting parallel settings)
   */
  async executeMultiple(
    toolCalls: ToolCall[],
    context: ToolContext,
    onResult?: (toolCallId: string, result: ToolResult) => void
  ): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();

    // Group by parallel capability
    const parallelCalls: ToolCall[] = [];
    const sequentialCalls: ToolCall[] = [];

    for (const tc of toolCalls) {
      const tool = this.get(tc.function.name);
      if (tool?.behavior.allowsParallel) {
        parallelCalls.push(tc);
      } else {
        sequentialCalls.push(tc);
      }
    }

    // Execute parallel calls concurrently
    if (parallelCalls.length > 0) {
      const maxConcurrent = context.config.maxConcurrentToolCalls;
      
      for (let i = 0; i < parallelCalls.length; i += maxConcurrent) {
        const batch = parallelCalls.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(
          batch.map(async tc => {
            const result = await this.execute(tc, context);
            onResult?.(tc.id, result);
            return { id: tc.id, result };
          })
        );
        
        for (const { id, result } of batchResults) {
          results.set(id, result);
        }
      }
    }

    // Execute sequential calls one by one
    for (const tc of sequentialCalls) {
      const result = await this.execute(tc, context);
      results.set(tc.id, result);
      onResult?.(tc.id, result);
    }

    return results;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalRegistry: ToolRegistry | null = null;

/**
 * Get the global tool registry instance
 */
export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

/**
 * Create a new tool registry (for testing or isolation)
 */
export function createToolRegistry(config?: ToolRegistryConfig): ToolRegistry {
  return new ToolRegistry(config);
}

/**
 * Reset the global registry (for testing)
 */
export function resetToolRegistry(): void {
  globalRegistry = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Execute with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Create tool definition helper
 */
export function createToolDefinition(
  name: string,
  description: string,
  parameters: {
    required?: string[];
    properties: Record<string, {
      type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
      description: string;
      enum?: string[];
      items?: { type: string };
      default?: unknown;
    }>;
  }
): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        required: parameters.required,
        properties: parameters.properties as unknown as Record<string, ToolParameterProperty>,
      },
    },
  };
}
