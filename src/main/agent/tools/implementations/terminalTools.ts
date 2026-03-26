/**
 * Terminal Tool Implementation
 * 
 * Executes shell commands with proper safety measures.
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../types';

// ============================================================================
// Dangerous Command Patterns
// ============================================================================

const DANGEROUS_PATTERNS = [
  // Destructive commands
  /\brm\s+(-[rf]+\s+)?[\/~]/i, // rm with root or home
  /\bsudo\b/i,
  /\bmkfs\b/i,
  /\bdd\s+.*of=/i,
  /\b(:|>)\s*\/dev\//i,
  
  // System modification
  /\bchmod\s+777/i,
  /\bchown\s+.*root/i,
  
  // Network dangers
  /\bcurl\b.*\|\s*(ba)?sh/i, // curl | bash
  /\bwget\b.*\|\s*(ba)?sh/i,
  
  // Fork bombs and resource exhaustion
  /:\(\)\{:\|:&\};:/,
  /while\s+true.*do/i,
];

/**
 * Check if a command is potentially dangerous
 */
function isDangerousCommand(command: string): { dangerous: boolean; reason?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        dangerous: true,
        reason: `Command matches dangerous pattern: ${pattern.source}`,
      };
    }
  }
  return { dangerous: false };
}

// ============================================================================
// Run Terminal Command Implementation
// ============================================================================

export const runTerminalCommandImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const command = args.command as string;
  const cwd = args.cwd as string | undefined;
  const timeoutMs = (args.timeoutMs as number) ?? 60000;
  const background = (args.background as boolean) ?? false;

  // Security check
  const dangerCheck = isDangerousCommand(command);
  if (dangerCheck.dangerous) {
    return {
      output: [{
        name: 'Command Blocked',
        description: 'Potentially dangerous command',
        content: `Refused to execute: ${dangerCheck.reason}`,
        icon: 'warning',
      }],
      success: false,
      error: dangerCheck.reason,
    };
  }

  if (!context.workspacePath) {
    return {
      output: [],
      success: false,
      error: 'No workspace path available',
    };
  }

  // Resolve working directory
  let workDir = context.workspacePath;
  if (cwd && cwd !== '.') {
    workDir = path.isAbsolute(cwd) ? cwd : path.resolve(context.workspacePath, cwd);
    
    // Security: ensure workDir is within workspace
    const normalizedWorkspace = path.resolve(context.workspacePath);
    const normalizedWorkDir = path.resolve(workDir);
    if (!normalizedWorkDir.startsWith(normalizedWorkspace)) {
      return {
        output: [{
          name: 'Access Denied',
          description: 'Working directory outside workspace',
          content: `Cannot execute command in ${cwd} - outside workspace`,
          icon: 'error',
        }],
        success: false,
        error: 'Working directory outside workspace',
      };
    }
  }

  return new Promise((resolve) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let killed = false;

    // Determine shell based on platform
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    const shellFlag = process.platform === 'win32' ? '/c' : '-c';

    const proc = spawn(shell, [shellFlag, command], {
      cwd: workDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: background,
    });

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 5000);
    }, timeoutMs);

    // Handle abort signal
    if (context.signal) {
      context.signal.addEventListener('abort', () => {
        killed = true;
        proc.kill('SIGTERM');
      });
    }

    proc.stdout?.on('data', (data) => {
      stdout.push(data.toString());
    });

    proc.stderr?.on('data', (data) => {
      stderr.push(data.toString());
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutHandle);
      resolve({
        output: [{
          name: 'Command Error',
          description: command,
          content: `Failed to execute: ${error.message}`,
          icon: 'error',
        }],
        success: false,
        error: error.message,
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutHandle);

      const stdoutStr = stdout.join('');
      const stderrStr = stderr.join('');
      const success = code === 0 && !killed;

      // Build output content
      let content = '';
      if (killed) {
        content = `Command ${context.signal?.aborted ? 'aborted' : 'timed out'}\n\n`;
      }
      if (stdoutStr) {
        content += `STDOUT:\n${stdoutStr}\n`;
      }
      if (stderrStr) {
        content += `STDERR:\n${stderrStr}\n`;
      }
      if (!content) {
        content = success ? 'Command completed with no output' : `Command failed with exit code ${code}`;
      }

      resolve({
        output: [{
          name: success ? 'Command Output' : 'Command Failed',
          description: command,
          content: content.trim(),
          icon: success ? undefined : 'error',
        }],
        success,
        error: success ? undefined : `Exit code: ${code}`,
        metadata: {
          exitCode: code,
          killed,
          workDir,
        },
      });
    });

    // For background processes, return immediately
    if (background) {
      proc.unref();
      clearTimeout(timeoutHandle);
      resolve({
        output: [{
          name: 'Background Process Started',
          description: command,
          content: `Process started in background (PID: ${proc.pid})`,
        }],
        success: true,
        metadata: { pid: proc.pid, background: true },
      });
    }
  });
};
