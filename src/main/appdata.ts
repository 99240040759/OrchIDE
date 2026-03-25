import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

let _appDataDir: string | null = null;

export function getAppDataDir(): string {
  if (_appDataDir) return _appDataDir;
  const base = app.getPath('appData');
  _appDataDir = path.join(base, 'Orch');
  return _appDataDir;
}

export function getSessionDir(sessionId: string): string {
  return path.join(getAppDataDir(), 'sessions', sessionId);
}

export function getDbPath(): string {
  return path.join(getAppDataDir(), 'orch.db');
}

export function getSettingsPath(): string {
  return path.join(getAppDataDir(), 'settings.json');
}

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

export function ensureSessionDir(sessionId: string): string {
  const dir = getSessionDir(sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function deleteSessionDir(sessionId: string): void {
  const dir = getSessionDir(sessionId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function writeSessionFile(sessionId: string, filename: string, content: string): string {
  const dir = ensureSessionDir(sessionId);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function readSessionFile(sessionId: string, filename: string): string | null {
  const filePath = path.join(getSessionDir(sessionId), filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function listSessionFiles(sessionId: string): string[] {
  const dir = getSessionDir(sessionId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
}

export function loadSettings(): Record<string, string> {
  const p = getSettingsPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveSettings(settings: Record<string, string>): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}
