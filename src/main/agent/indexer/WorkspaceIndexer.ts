import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrowserWindow } from 'electron';
import { ASTManager } from './ASTManager';
import { WorkspaceDb } from './workspaceDb';
import { SymbolExtractor } from './SymbolExtractor';
import { watcherEvents } from '../../ipc/watcher';
import { shouldIgnore } from '../../../shared/utils/pathUtils';

export class WorkspaceIndexer {
  private db: WorkspaceDb;
  private astManager: ASTManager;
  private extractor: SymbolExtractor;
  private workspacePath: string;
  
  private isIndexing = false;
  private indexQueue: string[] = [];
  private totalQueued = 0;
  private completedQueue = 0;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.db = new WorkspaceDb(workspacePath);
    this.astManager = new ASTManager();
    this.extractor = new SymbolExtractor();

    this.bindWatcher();
  }

  private bindWatcher() {
    watcherEvents.on('file_added', (filepath: string, root: string) => {
      if (root === this.workspacePath) this.queueFile(filepath);
    });
    watcherEvents.on('file_changed', (filepath: string, root: string) => {
      if (root === this.workspacePath) this.queueFile(filepath);
    });
    watcherEvents.on('file_deleted', (filepath: string, root: string) => {
      if (root === this.workspacePath) {
        this.db.deleteFile(filepath);
      }
    });
  }

  public async startInitialIndex() {
    const allFiles = this.walkDir(this.workspacePath);
    for (const file of allFiles) {
      this.queueFile(file);
    }
  }

  public async reindexAll() {
    this.db.clearAll();
    await this.startInitialIndex();
  }

  private queueFile(filepath: string) {
    // Check extension
    if (!this.astManager.getExtensionLanguage(filepath)) return;
    
    // Add to queue
    if (!this.indexQueue.includes(filepath)) {
      this.indexQueue.push(filepath);
      this.totalQueued++;
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.isIndexing) return;
    this.isIndexing = true;

    try {
      while (this.indexQueue.length > 0) {
        // Yield to event loop heavily to avoid UI/IPC freezing
        await new Promise(r => setTimeout(r, 5));

        const filepath = this.indexQueue.shift()!;
        await this.indexFile(filepath);
        this.completedQueue++;

        this.broadcastProgress();
      }
    } finally {
      this.isIndexing = false;
      this.totalQueued = 0;
      this.completedQueue = 0;
      this.broadcastProgress(true); // Complete
    }
  }

  private async indexFile(filepath: string) {
    try {
      if (!fs.existsSync(filepath)) {
        this.db.deleteFile(filepath);
        return;
      }

      const stat = fs.statSync(filepath);
      const hash = `${stat.mtimeMs}-${stat.size}`;
      const currentHash = this.db.getFileHash(filepath);

      if (currentHash === hash) {
        return; // Unchanged
      }

      const content = fs.readFileSync(filepath, 'utf8');
      const tree = await this.astManager.parseFile(filepath, content);
      
      if (tree) {
        const symbols = this.extractor.extractSymbols(filepath, tree, content);
        
        // Use a transaction for fast DB inserts
        this.db.beginTransaction();
        try {
          // Parent Record first for Foreign Key constraint
          this.db.updateFileCache(filepath, hash);
          this.db.insertSymbols(filepath, symbols);
          this.db.commitTransaction();
        } catch (dbError) {
          this.db.rollbackTransaction();
          throw dbError;
        }
      }
    } catch (e) {
      console.error(`[WorkspaceIndexer] Failed to index ${filepath}:`, e);
    }
  }

  private broadcastProgress(done = false) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('indexer:progress', {
        workspacePath: this.workspacePath,
        isIndexing: !done,
        progress: done ? 100 : (this.totalQueued > 0 ? Math.round((this.completedQueue / this.totalQueued) * 100) : 0),
        completed: this.completedQueue,
        total: this.totalQueued
      });
    }
  }

  private walkDir(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (shouldIgnore(file)) continue;
      
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
         results = results.concat(this.walkDir(filePath));
      } else {
         results.push(filePath);
      }
    }
    return results;
  }

  public getDb(): WorkspaceDb {
    return this.db;
  }
}
