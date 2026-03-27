import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface FileRow {
  filepath: string;
  hash: string;
  last_indexed: number;
}

export interface SymbolRow {
  id: string;
  filepath: string;
  name: string;
  kind: string; // 'class', 'function', 'interface', 'method', 'export'
  line_start: number;
  line_end: number;
  snippet: string;
}

export class WorkspaceDb {
  private db: Database.Database;

  constructor(workspacePath: string) {
    // We store the index.db in a parallel directory to keep the workspace clean,
    // or inside the workspace's .orch directory.
    // The user approved per-workspace isolated DBs. Let's place it in `.orch/index.db`.
    const orchDir = path.join(workspacePath, '.orch');
    if (!fs.existsSync(orchDir)) {
      fs.mkdirSync(orchDir, { recursive: true });
    }
    
    const dbPath = path.join(orchDir, 'index.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        filepath TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        last_indexed INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        filepath TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        snippet TEXT NOT NULL,
        FOREIGN KEY (filepath) REFERENCES files(filepath) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_symbols_filepath ON symbols(filepath);
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
    `);
  }

  // --- Transactions ---

  public beginTransaction(): void {
    this.db.prepare('BEGIN TRANSACTION').run();
  }

  public commitTransaction(): void {
    this.db.prepare('COMMIT').run();
  }

  public rollbackTransaction(): void {
    this.db.prepare('ROLLBACK').run();
  }

  // --- Files ---

  public getFileHash(filepath: string): string | null {
    const row = this.db.prepare('SELECT hash FROM files WHERE filepath = ?').get(filepath) as { hash: string } | undefined;
    return row?.hash ?? null;
  }

  public updateFileCache(filepath: string, hash: string): void {
    this.db.prepare('INSERT OR REPLACE INTO files (filepath, hash, last_indexed) VALUES (?, ?, ?)').run(filepath, hash, Date.now());
  }

  public deleteFile(filepath: string): void {
    // Due to ON DELETE CASCADE on symbols, deleting the file deletes its symbols
    this.db.prepare('DELETE FROM files WHERE filepath = ?').run(filepath);
  }

  public clearAll(): void {
    this.db.exec('DELETE FROM files; DELETE FROM symbols;');
  }

  // --- Symbols ---

  public insertSymbols(filepath: string, symbols: Omit<SymbolRow, 'id'>[]): void {
    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO symbols (id, filepath, name, kind, line_start, line_end, snippet) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const insertMany = this.db.transaction((items: Omit<SymbolRow, 'id'>[]) => {
      // First, clear existing symbols for this file
      this.db.prepare('DELETE FROM symbols WHERE filepath = ?').run(filepath);
      
      for (const item of items) {
        // ID includes kind to distinguish between an export and the thing being exported on the same line
        const id = `${filepath}#${item.name}#${item.kind}#${item.line_start}`;
        insert.run(id, item.filepath, item.name, item.kind, item.line_start, item.line_end, item.snippet);
      }
    });

    insertMany(symbols);
  }

  public findDefinitions(name: string): SymbolRow[] {
    return this.db.prepare('SELECT * FROM symbols WHERE name = ? COLLATE NOCASE').all(name) as SymbolRow[];
  }

  public getSymbolsForFile(filepath: string): SymbolRow[] {
    return this.db.prepare('SELECT * FROM symbols WHERE filepath = ? ORDER BY line_start ASC').all(filepath) as SymbolRow[];
  }

  public searchSymbols(query: string, limit: number = 20): SymbolRow[] {
    // Prefix case-insensitive search with SQL LIKE
    return this.db.prepare('SELECT * FROM symbols WHERE name LIKE ? ORDER BY length(name) ASC LIMIT ?').all(`${query}%`, limit) as SymbolRow[];
  }
}
