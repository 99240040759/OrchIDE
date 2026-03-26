/**
 * AppData utilities for managing application data directories
 * Handles session files, settings, and database paths
 */

import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';

let _appDataDir: string | null = null;

/**
 * Get the base app data directory (~/.appData/Orch/)
 */
export function getAppDataDir(): string {
  if (_appDataDir) return _appDataDir;
  const base = app.getPath('appData');
  _appDataDir = path.join(base, 'Orch');
  return _appDataDir;
}

/**
 * Get the session directory for a given session ID
 */
export function getSessionDir(sessionId: string): string {
  return path.join(getAppDataDir(), 'sessions', sessionId);
}

/**
 * Get the path to the SQLite database
 */
export function getDbPath(): string {
  return path.join(getAppDataDir(), 'orch.db');
}

/**
 * Get the path to the settings file
 */
export function getSettingsPath(): string {
  return path.join(getAppDataDir(), 'settings.json');
}

/**
 * Initialize app data directories
 * Should be called on app startup
 */
export function initAppData(): void {
  const dirs = [
    getAppDataDir(),
    path.join(getAppDataDir(), 'sessions'),
    path.join(getAppDataDir(), 'workspaces'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Ensure session directory exists, creating it if needed
 */
export function ensureSessionDir(sessionId: string): string {
  const dir = getSessionDir(sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Delete a session's directory
 */
export function deleteSessionDir(sessionId: string): void {
  const dir = getSessionDir(sessionId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Write a file to a session's directory
 * @returns The absolute path to the written file
 */
export function writeSessionFile(sessionId: string, filename: string, content: string): string {
  const dir = ensureSessionDir(sessionId);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Load application settings
 */
export function loadSettings(): Record<string, string> {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save application settings
 */
export function saveSettings(settings: Record<string, string>): void {
  const dir = getAppDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}
