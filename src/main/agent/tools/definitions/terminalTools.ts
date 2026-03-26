/**
 * Terminal Tool Definitions
 *
 * Async 3-tool terminal system:
 * - startTerminalCommand: spawn and optionally wait
 * - getCommandStatus: poll a background command
 * - sendCommandInput: stdin / terminate
 *
 * Legacy runTerminalCommand kept for simple blocking commands.
 */

import type { Tool } from '../types';
import { createToolDefinition } from '../registry';

// ============================================================================
// Start Terminal Command (async)
// ============================================================================

export const startTerminalCommandDefinition: Tool['definition'] = createToolDefinition(
  'startTerminalCommand',
  `Start a terminal command. The command runs in the background and you get a commandId back.
Use getCommandStatus to poll for output and completion.
Use sendCommandInput to write to stdin or terminate the process.

Set waitMs to wait up to N milliseconds for the command to finish before returning —
use this for short commands (e.g. 5000ms for npm install, 500ms for echo).
For long-running servers/watchers, set waitMs to 500 to capture any early errors.

The command runs with PAGER=cat so paging tools don't block.`,
  {
    required: ['command'],
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (relative to workspace root). Default: workspace root.',
      },
      waitMs: {
        type: 'integer',
        description: 'Milliseconds to wait for completion before returning. Default: 500. Max: 30000.',
      },
      safeToAutoRun: {
        type: 'boolean',
        description: 'Set true if this command is read-only and safe to run without user approval (e.g. ls, cat, echo)',
      },
    },
  }
);

export const startTerminalCommandTool: Omit<Tool, 'execute'> = {
  definition: startTerminalCommandDefinition,
  display: {
    displayTitle: 'Start Command',
    wouldLikeTo: 'run "{{{ command }}}"',
    isCurrently: 'running "{{{ command }}}"',
    hasAlready: 'ran "{{{ command }}}"',
    icon: 'terminal',
    group: 'terminal',
  },
  behavior: {
    readonly: false,
    isInstant: false,
    defaultPolicy: 'allowedWithPermission',
    allowsParallel: false,
    timeoutMs: 60000,
  },
};

// ============================================================================
// Get Command Status
// ============================================================================

export const getCommandStatusDefinition: Tool['definition'] = createToolDefinition(
  'getCommandStatus',
  `Get the status and output of a previously started background command.
Returns current status (running/done/error), output text, and exit code.

Set waitSeconds > 0 to wait for the command to complete before returning
(waits at most that many seconds, returns early if the command finishes).
Set outputCharCount to control how much output to retrieve (keep small to save tokens).`,
  {
    required: ['commandId'],
    properties: {
      commandId: {
        type: 'string',
        description: 'The command ID returned by startTerminalCommand',
      },
      waitSeconds: {
        type: 'integer',
        description: 'Seconds to wait for completion. Default: 0 (immediate status). Max: 300.',
      },
      outputCharCount: {
        type: 'integer',
        description: 'Number of characters of output to return (from tail). Default: 5000. Keep small.',
      },
    },
  }
);

export const getCommandStatusTool: Omit<Tool, 'execute'> = {
  definition: getCommandStatusDefinition,
  display: {
    displayTitle: 'Check Command',
    wouldLikeTo: 'check command status',
    isCurrently: 'checking command status',
    hasAlready: 'checked command status',
    icon: 'activity',
    group: 'terminal',
  },
  behavior: {
    readonly: true,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};

// ============================================================================
// Send Command Input / Terminate
// ============================================================================

export const sendCommandInputDefinition: Tool['definition'] = createToolDefinition(
  'sendCommandInput',
  `Send input to a running command's stdin, or terminate the command.
Exactly one of 'input' or 'terminate' must be specified.

Use for interactive commands, REPLs, or to stop long-running processes.`,
  {
    required: ['commandId'],
    properties: {
      commandId: {
        type: 'string',
        description: 'The command ID from startTerminalCommand',
      },
      input: {
        type: 'string',
        description: 'Text to send to stdin. Include newlines if needed to submit.',
      },
      terminate: {
        type: 'boolean',
        description: 'Set true to kill the process.',
      },
    },
  }
);

export const sendCommandInputTool: Omit<Tool, 'execute'> = {
  definition: sendCommandInputDefinition,
  display: {
    displayTitle: 'Command Input',
    wouldLikeTo: 'send input to running command',
    isCurrently: 'sending input to command',
    hasAlready: 'sent input to command',
    icon: 'type',
    group: 'terminal',
  },
  behavior: {
    readonly: false,
    isInstant: true,
    defaultPolicy: 'allowedWithPermission',
    allowsParallel: true,
  },
};

// ============================================================================
// Legacy: Run Terminal Command (blocking, preserved for simple use)
// ============================================================================

export const runTerminalCommandDefinition: Tool['definition'] = createToolDefinition(
  'runTerminalCommand',
  `Run a shell command synchronously and return output. For simple one-off commands.
For long-running or interactive commands, use startTerminalCommand instead.`,
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
    readonly: false,
    isInstant: false,
    defaultPolicy: 'allowedWithPermission',
    allowsParallel: false,
    timeoutMs: 120000,
  },
};
