/**
 * Terminal Tool Definitions
 * 
 * Tool for running terminal commands.
 */

import type { Tool } from '../types';
import { createToolDefinition } from '../registry';

// ============================================================================
// Run Terminal Command Tool
// ============================================================================

export const runTerminalCommandDefinition: Tool['definition'] = createToolDefinition(
  'runTerminalCommand',
  `Run a shell command in the workspace directory. 
Use this for: installing packages, running builds, executing scripts, git operations.
Commands run with a timeout and return stdout/stderr.
For long-running commands, consider running them in the background.`,
  {
    required: ['command'],
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (relative to workspace root)',
        default: '.',
      },
      timeoutMs: {
        type: 'integer',
        description: 'Timeout in milliseconds',
        default: 60000,
      },
      background: {
        type: 'boolean',
        description: 'Run in background (returns immediately)',
        default: false,
      },
    },
  }
);

export const runTerminalCommandTool: Omit<Tool, 'execute'> = {
  definition: runTerminalCommandDefinition,
  display: {
    displayTitle: 'Run Command',
    wouldLikeTo: 'run "{{{ command }}}"',
    isCurrently: 'running "{{{ command }}}"',
    hasAlready: 'ran "{{{ command }}}"',
    icon: 'terminal',
    group: 'terminal',
  },
  behavior: {
    readonly: false, // Commands can modify files
    isInstant: false,
    defaultPolicy: 'allowedWithPermission', // Require approval for commands
    allowsParallel: false, // Run sequentially for safety
    timeoutMs: 120000, // 2 minute default timeout
  },
};
