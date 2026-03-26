/**
 * Terminal Registry
 *
 * Manages background terminal processes for async command execution.
 * Provides start / status / input / terminate operations.
 * Commands run in a controlled environment with output buffering.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type CommandStatus = 'running' | 'done' | 'error' | 'terminated';

export interface RunningCommand {
  id: string;
  command: string;
  cwd: string;
  process: ChildProcess;
  outputLog: string[];
  errorLog: string[];
  status: CommandStatus;
  exitCode: number | null;
  startedAt: number;
  completedAt: number | null;
}

export interface CommandStatusResult {
  id: string;
  status: CommandStatus;
  exitCode: number | null;
  output: string;
  error: string;
  startedAt: number;
  completedAt: number | null;
}

// ============================================================================
// Terminal Registry Singleton
// ============================================================================

const commands = new Map<string, RunningCommand>();

// Maximum output buffer per command (characters)
const MAX_OUTPUT_CHARS = 500_000;

/**
 * Start a command and return its ID immediately.
 * If waitMs > 0, waits up to that many ms for the process to finish before
 * returning (so short commands complete synchronously).
 */
export async function startCommand(
  command: string,
  cwd: string,
  signal?: AbortSignal,
  waitMs: number = 0
): Promise<{ commandId: string; initialOutput: string; status: CommandStatus }> {
  const id = `cmd_${uuidv4().slice(0, 8)}`;

  const proc = spawn(command, [], {
    cwd,
    shell: true,
    env: { ...process.env, PAGER: 'cat', GIT_PAGER: 'cat' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const entry: RunningCommand = {
    id,
    command,
    cwd,
    process: proc,
    outputLog: [],
    errorLog: [],
    status: 'running',
    exitCode: null,
    startedAt: Date.now(),
    completedAt: null,
  };

  commands.set(id, entry);

  // Buffer stdout
  proc.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    entry.outputLog.push(text);
    trimBuffer(entry.outputLog);
  });

  // Buffer stderr
  proc.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    entry.errorLog.push(text);
    trimBuffer(entry.errorLog);
  });

  // Handle exit
  proc.on('close', (code) => {
    entry.status = code === 0 ? 'done' : 'error';
    entry.exitCode = code;
    entry.completedAt = Date.now();
  });

  proc.on('error', (err) => {
    entry.status = 'error';
    entry.errorLog.push(`Process error: ${err.message}`);
    entry.completedAt = Date.now();
  });

  // If the caller's abort signal fires, kill the process
  if (signal) {
    signal.addEventListener('abort', () => {
      if (entry.status === 'running') {
        proc.kill('SIGTERM');
        entry.status = 'terminated';
        entry.completedAt = Date.now();
      }
    }, { once: true });
  }

  // Optionally wait for the command to complete (for short commands)
  if (waitMs > 0) {
    await new Promise<void>((resolve) => {
      const checkDone = () => {
        if (entry.status !== 'running') {
          resolve();
          return;
        }
      };
      // Check periodically
      const interval = setInterval(() => {
        checkDone();
        if (entry.status !== 'running') clearInterval(interval);
      }, 50);
      // Timeout
      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, waitMs);
    });
  }

  return {
    commandId: id,
    initialOutput: entry.outputLog.join('') + entry.errorLog.join(''),
    status: entry.status,
  };
}

/**
 * Get the status and output of a running or completed command.
 * If waitSeconds > 0, waits for the command to complete before returning.
 */
export async function getStatus(
  commandId: string,
  outputCharCount: number = 10000,
  waitSeconds: number = 0
): Promise<CommandStatusResult | null> {
  const entry = commands.get(commandId);
  if (!entry) return null;

  // Wait for completion if requested
  if (waitSeconds > 0 && entry.status === 'running') {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, waitSeconds * 1000);
      const interval = setInterval(() => {
        if (entry.status !== 'running') {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  const fullOutput = entry.outputLog.join('');
  const fullError = entry.errorLog.join('');

  // Return the tail of the output, truncated to outputCharCount
  const output = fullOutput.length > outputCharCount
    ? fullOutput.slice(-outputCharCount)
    : fullOutput;
  const error = fullError.length > outputCharCount
    ? fullError.slice(-outputCharCount)
    : fullError;

  return {
    id: entry.id,
    status: entry.status,
    exitCode: entry.exitCode,
    output,
    error,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
  };
}

/**
 * Send input to a running command's stdin.
 */
export function sendInput(commandId: string, input: string): boolean {
  const entry = commands.get(commandId);
  if (!entry || entry.status !== 'running' || !entry.process.stdin) return false;

  entry.process.stdin.write(input);
  return true;
}

/**
 * Terminate a running command.
 */
export function terminateCommand(commandId: string): boolean {
  const entry = commands.get(commandId);
  if (!entry || entry.status !== 'running') return false;

  entry.process.kill('SIGTERM');
  entry.status = 'terminated';
  entry.completedAt = Date.now();
  return true;
}

/**
 * Clean up completed commands older than maxAge ms.
 */
export function cleanup(maxAgeMs: number = 30 * 60 * 1000): void {
  const now = Date.now();
  for (const [id, entry] of commands) {
    if (entry.status !== 'running' && entry.completedAt && (now - entry.completedAt) > maxAgeMs) {
      commands.delete(id);
    }
  }
}

/**
 * Get all active command IDs.
 */
export function getActiveCommands(): string[] {
  return Array.from(commands.entries())
    .filter(([, e]) => e.status === 'running')
    .map(([id]) => id);
}

// ============================================================================
// Internal Helpers
// ============================================================================

function trimBuffer(log: string[]): void {
  const totalLen = log.reduce((sum, s) => sum + s.length, 0);
  if (totalLen > MAX_OUTPUT_CHARS) {
    // Remove oldest entries until under limit
    while (log.length > 1 && log.reduce((sum, s) => sum + s.length, 0) > MAX_OUTPUT_CHARS) {
      log.shift();
    }
  }
}
