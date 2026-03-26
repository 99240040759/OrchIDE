/**
 * Tool Policy System
 * 
 * Manages tool execution policies and approval workflows.
 * Determines whether tools can run automatically or need user approval.
 */

import type {
  ToolPolicy,
  ToolSettings,
  ToolPolicyOverride,
  ToolCall,
  ApprovalRequest,
} from '../core/types';
import type { Tool, ToolContext } from './types';
import { parseToolCallArgs } from './types';

// ============================================================================
// Default Policies
// ============================================================================

/**
 * Default policies for built-in tools
 * Read-only tools are auto-approved, write tools need approval
 */
export const DEFAULT_TOOL_POLICIES: Record<string, ToolPolicy> = {
  // File read operations - auto-approve
  readFile: 'allowedWithoutPermission',
  listDirectory: 'allowedWithoutPermission',
  
  // Search operations - auto-approve
  grepSearch: 'allowedWithoutPermission',
  globSearch: 'allowedWithoutPermission',
  searchInFiles: 'allowedWithoutPermission',
  
  // Web operations - auto-approve
  webSearch: 'allowedWithoutPermission',
  fetchUrl: 'allowedWithoutPermission',
  
  // File write operations - require approval
  writeFile: 'allowedWithPermission',
  createFile: 'allowedWithPermission',
  deleteFile: 'allowedWithPermission',
  replaceFileContent: 'allowedWithPermission',
  multiReplaceFileContent: 'allowedWithPermission',
  
  // Terminal - require approval (except status polling)
  runTerminalCommand: 'allowedWithPermission',
  startTerminalCommand: 'allowedWithPermission',
  getCommandStatus: 'allowedWithoutPermission',
  sendCommandInput: 'allowedWithPermission',
  
  // Agent tools - auto-approve (they only update UI state)
  updateTaskProgress: 'allowedWithoutPermission',
  createArtifact: 'allowedWithoutPermission',

  taskBoundary: 'allowedWithoutPermission',
  notifyUser: 'allowedWithoutPermission',
};

// ============================================================================
// Policy Evaluation
// ============================================================================

/**
 * Get the effective policy for a tool
 */
export function getToolPolicy(
  toolName: string,
  tool: Tool | undefined,
  settings: ToolSettings
): ToolPolicy {
  // Check for user override first
  const override = settings.overrides.find(o => o.toolName === toolName);
  if (override) {
    return override.policy;
  }
  
  // Check settings defaults
  if (settings.defaults[toolName]) {
    return settings.defaults[toolName];
  }
  
  // Check tool's default policy
  if (tool?.behavior.defaultPolicy) {
    return tool.behavior.defaultPolicy;
  }
  
  // Check global defaults
  if (DEFAULT_TOOL_POLICIES[toolName]) {
    return DEFAULT_TOOL_POLICIES[toolName];
  }
  
  // Default to requiring permission for unknown tools
  return 'allowedWithPermission';
}

/**
 * Evaluate tool policy with dynamic rules
 * Some tools may adjust policy based on arguments
 */
export async function evaluateToolPolicy(
  toolCall: ToolCall,
  tool: Tool | undefined,
  settings: ToolSettings,
  context: ToolContext
): Promise<{
  policy: ToolPolicy;
  reason?: string;
  processedArgs?: Record<string, unknown>;
}> {
  const toolName = toolCall.function.name;
  const args = parseToolCallArgs(toolCall);
  
  // Get base policy
  let policy = getToolPolicy(toolName, tool, settings);
  
  // If tool has a policy evaluator, use it
  if (tool?.evaluatePolicy) {
    let processedArgs = args;
    
    // Preprocess args if available
    if (tool.preprocessArgs) {
      try {
        const result = await tool.preprocessArgs(args, context);
        processedArgs = result.args;
      } catch (error) {
        // If preprocessing fails, use original args
      }
    }
    
    policy = tool.evaluatePolicy(policy, args, processedArgs);
    
    return { policy, processedArgs };
  }
  
  // Apply dynamic rules for specific tools
  const dynamicResult = applyDynamicPolicyRules(toolName, args, policy, context);
  
  return dynamicResult;
}

/**
 * Apply dynamic policy rules based on tool arguments
 */
function applyDynamicPolicyRules(
  toolName: string,
  args: Record<string, unknown>,
  basePolicy: ToolPolicy,
  context: ToolContext
): { policy: ToolPolicy; reason?: string } {
  // If tool is disabled, always return disabled
  if (basePolicy === 'disabled') {
    return { policy: 'disabled', reason: 'Tool is disabled' };
  }
  
  // File operations: check if path is within workspace
  if (isFilePathTool(toolName)) {
    const filePath = getFilePathFromArgs(args);
    
    if (filePath && context.workspacePath) {
      const isWithinWorkspace = isPathWithinWorkspace(filePath, context.workspacePath);
      
      if (!isWithinWorkspace) {
        // Operations outside workspace always need approval
        return {
          policy: 'allowedWithPermission',
          reason: 'Path is outside workspace',
        };
      }
      
      // Read-only operations within workspace can be auto-approved
      if (isReadOnlyFileTool(toolName) && basePolicy === 'allowedWithPermission') {
        return { policy: 'allowedWithoutPermission' };
      }
    }
  }
  
  // Terminal commands: check for dangerous patterns
  if (toolName === 'runTerminalCommand') {
    const command = args.command as string;
    
    if (command && isDangerousCommand(command)) {
      return {
        policy: 'allowedWithPermission',
        reason: 'Command may be destructive',
      };
    }
  }
  
  return { policy: basePolicy };
}

// ============================================================================
// Helper Functions
// ============================================================================

function isFilePathTool(toolName: string): boolean {
  return [
    'readFile',
    'writeFile',
    'createFile',
    'deleteFile',
    'listDirectory',
    'grepSearch',
    'globSearch',
    'searchInFiles',
    'replaceFileContent',
    'multiReplaceFileContent',
  ].includes(toolName);
}

function isReadOnlyFileTool(toolName: string): boolean {
  return [
    'readFile',
    'listDirectory',
    'grepSearch',
    'globSearch',
    'searchInFiles',
  ].includes(toolName);
}

function getFilePathFromArgs(args: Record<string, unknown>): string | undefined {
  return (
    args.filePath ||
    args.path ||
    args.targetPath ||
    args.dirPath ||
    args.directory
  ) as string | undefined;
}

function isPathWithinWorkspace(filePath: string, workspacePath: string): boolean {
  // Normalize paths for comparison
  const normalizedFile = filePath.replace(/\\/g, '/').toLowerCase();
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/').toLowerCase();
  
  // Handle relative paths
  if (!normalizedFile.startsWith('/') && !normalizedFile.match(/^[a-z]:/i)) {
    return true; // Relative paths are within workspace
  }
  
  return normalizedFile.startsWith(normalizedWorkspace);
}

function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /\brm\s+-rf?\s+[\/~]/i,      // rm -r / or ~
    /\brm\s+-rf?\s+\*/i,          // rm -r *
    /\bsudo\b/i,                  // sudo
    /\bchmod\s+777/i,             // chmod 777
    /\bchown\b/i,                 // chown
    /\bmkfs\b/i,                  // mkfs
    /\bdd\s+if=/i,                // dd
    /\b>\s*\/dev\/sd/i,           // writing to disk devices
    /\bcurl\b.*\|\s*sh/i,         // curl | sh
    /\bwget\b.*\|\s*sh/i,         // wget | sh
    /\bnpm\s+exec\b/i,            // npm exec (arbitrary code)
    /\bnpx\b/i,                   // npx (arbitrary code)
    /\beval\b/i,                  // eval
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(command));
}

// ============================================================================
// Approval Request Management
// ============================================================================

/**
 * Create an approval request for a tool call
 */
export function createToolApprovalRequest(
  toolCall: ToolCall,
  tool: Tool | undefined,
  reason?: string
): ApprovalRequest {
  const args = parseToolCallArgs(toolCall);
  const displayName = tool?.display.displayTitle ?? toolCall.function.name;
  
  let message = `${displayName}`;
  
  // Add argument preview
  if (Object.keys(args).length > 0) {
    const preview = formatArgsPreview(args);
    message += `: ${preview}`;
  }
  
  if (reason) {
    message += ` (${reason})`;
  }
  
  return {
    id: `approval-${toolCall.id}`,
    type: 'tool_call',
    toolCallId: toolCall.id,
    toolCall,
    message,
    createdAt: Date.now(),
  };
}

/**
 * Format tool arguments for preview
 */
function formatArgsPreview(args: Record<string, unknown>, maxLength: number = 100): string {
  const parts: string[] = [];
  
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    
    let valueStr: string;
    if (typeof value === 'string') {
      valueStr = value.length > 50 ? `${value.slice(0, 47)}...` : value;
    } else if (typeof value === 'object') {
      valueStr = JSON.stringify(value).slice(0, 50);
    } else {
      valueStr = String(value);
    }
    
    parts.push(`${key}=${valueStr}`);
  }
  
  const result = parts.join(', ');
  return result.length > maxLength ? `${result.slice(0, maxLength - 3)}...` : result;
}

// ============================================================================
// Policy Settings Management
// ============================================================================

/**
 * Create default tool settings
 */
export function createDefaultToolSettings(): ToolSettings {
  return {
    defaults: { ...DEFAULT_TOOL_POLICIES },
    overrides: [],
  };
}

/**
 * Update tool settings with overrides
 */
export function updateToolSettings(
  settings: ToolSettings,
  overrides: ToolPolicyOverride[]
): ToolSettings {
  return {
    ...settings,
    overrides: [...settings.overrides, ...overrides],
  };
}

/**
 * Set policy for a specific tool
 */
export function setToolPolicy(
  settings: ToolSettings,
  toolName: string,
  policy: ToolPolicy
): ToolSettings {
  // Remove existing override for this tool
  const filteredOverrides = settings.overrides.filter(o => o.toolName !== toolName);
  
  return {
    ...settings,
    overrides: [...filteredOverrides, { toolName, policy }],
  };
}

/**
 * Check if any tool calls require approval
 */
export function hasToolsRequiringApproval(
  policies: Array<{ toolCall: ToolCall; policy: ToolPolicy }>
): boolean {
  return policies.some(p => p.policy === 'allowedWithPermission');
}

/**
 * Filter tool calls by policy
 */
export function filterToolCallsByPolicy(
  toolCallsWithPolicies: Array<{ toolCall: ToolCall; policy: ToolPolicy }>
): {
  autoApproved: ToolCall[];
  needsApproval: ToolCall[];
  disabled: ToolCall[];
} {
  const autoApproved: ToolCall[] = [];
  const needsApproval: ToolCall[] = [];
  const disabled: ToolCall[] = [];
  
  for (const { toolCall, policy } of toolCallsWithPolicies) {
    switch (policy) {
      case 'allowedWithoutPermission':
        autoApproved.push(toolCall);
        break;
      case 'allowedWithPermission':
        needsApproval.push(toolCall);
        break;
      case 'disabled':
        disabled.push(toolCall);
        break;
    }
  }
  
  return { autoApproved, needsApproval, disabled };
}
