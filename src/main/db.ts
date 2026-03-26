import Database from 'better-sqlite3';
import { getDbPath } from './appdata';
import type { Message, Session, Artifact, FileChange } from '../shared/types';

// DB row types (what we get from SQLite)
interface SessionRow {
  id: string;
  title: string;
  mode: 'chat' | 'agentic';
  workspace_path: string | null;
  workspace_name: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
}

interface ArtifactRow {
  id: string;
  session_id: string;
  name: string;
  type: string;
  file_path: string;
  icon: string;
  created_at: number;
}

interface FileChangedRow {
  id: string;
  session_id: string;
  file_path: string;
  status: 'added' | 'modified' | 'deleted';
}

interface TaskProgressRow {
  session_id: string;
  checklist_md: string;
  updated_at: number;
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(getDbPath());
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      mode TEXT NOT NULL DEFAULT 'chat',
      workspace_path TEXT,
      workspace_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      file_path TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'FileText',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_progress (
      session_id TEXT PRIMARY KEY,
      checklist_md TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS files_changed (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'modified',
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
}

// Sessions
export function createSession(id: string, mode: 'chat' | 'agentic', workspacePath?: string, workspaceName?: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`INSERT OR IGNORE INTO sessions (id, title, mode, workspace_path, workspace_name, created_at, updated_at)
    VALUES (?, 'New Chat', ?, ?, ?, ?, ?)`).run(id, mode, workspacePath ?? null, workspaceName ?? null, now, now);
}

export function updateSessionTitle(id: string, title: string): void {
  const db = getDb();
  db.prepare(`UPDATE sessions SET title=?, updated_at=? WHERE id=?`).run(title, Date.now(), id);
}

export function getChatSessions(): Session[] {
  const rows = getDb().prepare(`SELECT * FROM sessions WHERE mode='chat' ORDER BY updated_at DESC`).all() as SessionRow[];
  return rows.map(sessionRowToSession);
}

export function getWorkspaceSessions(workspacePath: string): Session[] {
  const rows = getDb().prepare(`SELECT * FROM sessions WHERE workspace_path=? ORDER BY updated_at DESC`).all(workspacePath) as SessionRow[];
  return rows.map(sessionRowToSession);
}

export function deleteSession(id: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE id=?`).run(id);
}

// Messages
export function insertMessage(id: string, sessionId: string, role: string, content: string): void {
  const db = getDb();
  db.prepare(`INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`).run(id, sessionId, role, content, Date.now());
  db.prepare(`UPDATE sessions SET updated_at=? WHERE id=?`).run(Date.now(), sessionId);
}

export function getMessages(sessionId: string): Message[] {
  const rows = getDb().prepare(`SELECT * FROM messages WHERE session_id=? ORDER BY timestamp ASC`).all(sessionId) as MessageRow[];
  return rows.map(row => ({
    id: row.id,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content,
    timestamp: row.timestamp,
  }));
}

// Artifacts
export function insertArtifact(id: string, sessionId: string, name: string, type: string, filePath: string, icon: string): void {
  getDb().prepare(`INSERT OR REPLACE INTO artifacts (id, session_id, name, type, file_path, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, sessionId, name, type, filePath, icon, Date.now());
}

export function getArtifacts(sessionId: string): Artifact[] {
  const rows = getDb().prepare(`SELECT * FROM artifacts WHERE session_id=? ORDER BY created_at ASC`).all(sessionId) as ArtifactRow[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    type: row.type as 'file' | 'diagram' | 'other',
    filePath: row.file_path,
    icon: row.icon,
    createdAt: row.created_at,
  }));
}

// Task Progress
export function upsertTaskProgress(sessionId: string, checklistMd: string): void {
  getDb().prepare(`INSERT OR REPLACE INTO task_progress (session_id, checklist_md, updated_at) VALUES (?, ?, ?)`).run(sessionId, checklistMd, Date.now());
}

export function getTaskProgress(sessionId: string): string | null {
  const row = getDb().prepare(`SELECT checklist_md FROM task_progress WHERE session_id=?`).get(sessionId) as TaskProgressRow | undefined;
  return row?.checklist_md ?? null;
}

// Files Changed
export function upsertFileChanged(id: string, sessionId: string, filePath: string, status: 'added' | 'modified' | 'deleted'): void {
  getDb().prepare(`INSERT OR REPLACE INTO files_changed (id, session_id, file_path, status) VALUES (?, ?, ?, ?)`).run(id, sessionId, filePath, status);
}

export function getFilesChanged(sessionId: string): FileChange[] {
  const rows = getDb().prepare(`SELECT * FROM files_changed WHERE session_id=?`).all(sessionId) as FileChangedRow[];
  return rows.map(row => ({
    id: row.id,
    filePath: row.file_path,
    status: row.status,
  }));
}

// Helper to convert DB row to Session type
function sessionRowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    workspacePath: row.workspace_path ?? undefined,
    workspaceName: row.workspace_name ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
