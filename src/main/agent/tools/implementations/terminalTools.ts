/**
 * Terminal Tool Implementations — Async Terminal System
 *
 * Uses the terminalRegistry singleton for background process management.
 * Three async tools + one legacy blocking tool.
 */

import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { Tool, ToolContext, ToolResult } from '../types';
import {
  startCommand,
  getStatus,
  sendInput,
  terminateCommand,
} from '../../orchestrator/terminalRegistry';

// ============================================================================
// Start Terminal Command (async)
// ============================================================================

export const startTerminalCommandImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const command = args.command as string;
  const cwdRelative = (args.cwd as string) || '.';
  const waitMs = Math.min((args.waitMs as number) || 500, 30000);

  if (!command) {
    return {
      output: [{ name: 'Error', description: 'Missing command', content: 'command parameter is required.' }],
      success: false,
      error: 'Missing command',
    };
  }

  const cwd = path.isAbsolute(cwdRelative)
    ? cwdRelative
    : path.join(context.workspacePath || process.cwd(), cwdRelative);

  try {
    const result = await startCommand(command, cwd, context.signal, waitMs);

    return {
      output: [{
        name: 'Command Started',
        description: command,
        content: JSON.stringify({
          commandId: result.commandId,
          status: result.status,
          initialOutput: result.initialOutput.slice(0, 10000) || '(no output yet)',
        }, null, 2),
      }],
      success: true,
      metadata: { commandId: result.commandId },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      output: [{ name: 'Error', description: 'Failed to start command', content: msg }],
      success: false,
      error: msg,
    };
  }
};

// ============================================================================
// Get Command Status
// ============================================================================

export const getCommandStatusImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> => {
  const commandId = args.commandId as string;
  const waitSeconds = Math.min((args.waitSeconds as number) || 0, 300);
  const outputCharCount = (args.outputCharCount as number) || 5000;

  if (!commandId) {
    return {
      output: [{ name: 'Error', description: 'Missing commandId', content: 'commandId is required.' }],
      success: false,
      error: 'Missing commandId',
    };
  }

  const status = await getStatus(commandId, outputCharCount, waitSeconds);

  if (!status) {
    return {
      output: [{ name: 'Error', description: 'Command not found', content: `No command found with ID: ${commandId}` }],
      success: false,
      error: 'Command not found',
    };
  }

  return {
    output: [{
      name: 'Command Status',
      description: `Status: ${status.status}`,
      content: JSON.stringify({
        id: status.id,
        status: status.status,
        exitCode: status.exitCode,
        output: status.output || '(no output)',
        error: status.error || undefined,
      }, null, 2),
    }],
    success: true,
    metadata: { status: status.status, exitCode: status.exitCode },
  };
};

// ============================================================================
// Send Command Input / Terminate
// ============================================================================

export const sendCommandInputImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> => {
  const commandId = args.commandId as string;
  const input = args.input as string | undefined;
  const terminate = args.terminate as boolean | undefined;

  if (!commandId) {
    return {
      output: [{ name: 'Error', description: 'Missing commandId', content: 'commandId is required.' }],
      success: false,
      error: 'Missing commandId',
    };
  }

  if (!input && !terminate) {
    return {
      output: [{ name: 'Error', description: 'Missing action', content: 'Specify either input or terminate=true.' }],
      success: false,
      error: 'No action specified',
    };
  }

  if (terminate) {
    const killed = terminateCommand(commandId);
    return {
      output: [{
        name: 'Command Terminated',
        description: commandId,
        content: killed ? 'Command terminated successfully.' : 'Command not found or already finished.',
      }],
      success: killed,
    };
  }

  if (input) {
    const sent = sendInput(commandId, input);
    return {
      output: [{
        name: 'Input Sent',
        description: commandId,
        content: sent ? `Sent ${input.length} characters to command stdin.` : 'Command not found or not running.',
      }],
      success: sent,
    };
  }

  return {
    output: [{ name: 'Error', description: 'Unreachable', content: 'No action taken.' }],
    success: false,
    error: 'No action',
  };
};

// ============================================================================
// Legacy: Run Terminal Command (blocking)
// ============================================================================

export const runTerminalCommandImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const command = args.command as string;
  const cwdRelative = (args.cwd as string) || '.';
  const timeoutMs = (args.timeoutMs as number) || 60000;

  if (!command) {
    return {
      output: [{ name: 'Error', description: 'Missing command', content: 'command is required.' }],
      success: false,
      error: 'Missing command',
    };
  }

  const cwd = path.isAbsolute(cwdRelative)
    ? cwdRelative
    : path.join(context.workspacePath || process.cwd(), cwdRelative);

  try {
    const result = execSync(command, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PAGER: 'cat', GIT_PAGER: 'cat' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output = (result || '').trim();

    return {
      output: [{
        name: 'Command Output',
        description: command,
        content: output.slice(0, 50000) || '(no output)',
      }],
      success: true,
    };
  } catch (error: any) {
    const stdout = error.stdout?.toString() || '';
    const stderr = error.stderr?.toString() || '';
    const output = `Exit code: ${error.status ?? 'unknown'}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;

    return {
      output: [{
        name: 'Command Failed',
        description: command,
        content: output.slice(0, 50000),
      }],
      success: false,
      error: stderr.slice(0, 500) || error.message,
    };
  }
};
