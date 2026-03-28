/**
 * AppData utilities for managing application data directories
 * Handles session files and database paths
 */

import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { settingsStore, migrateFromLegacySettings, getAllSettings } from './services/settingsStore';

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
 * Initialize settings system and migrate from legacy format if needed
 * Should be called once on app startup
 */
export function initSettings(): void {
  const legacySettingsPath = path.join(getAppDataDir(), 'settings.json');
  
  // Check if legacy settings.json exists
  if (fs.existsSync(legacySettingsPath)) {
    try {
      const legacySettings = JSON.parse(fs.readFileSync(legacySettingsPath, 'utf-8'));
      
      // Only migrate if legacy file has content and electron-store is empty/minimal
      if (Object.keys(legacySettings).length > 0 && Object.keys(getAllSettings()).length <= 5) {
        console.log('[AppData] Migrating settings from legacy format...');
        migrateFromLegacySettings(legacySettings);
        
        // Backup legacy file
        const backupPath = `${legacySettingsPath}.backup`;
        fs.copyFileSync(legacySettingsPath, backupPath);
        console.log(`[AppData] Legacy settings backed up to: ${backupPath}`);
        
        // Delete the legacy file after successful migration
        fs.unlinkSync(legacySettingsPath);
        console.log('[AppData] Legacy settings.json removed');
      }
    } catch (error) {
      console.error('[AppData] Failed to migrate legacy settings:', error);
    }
  }
}
