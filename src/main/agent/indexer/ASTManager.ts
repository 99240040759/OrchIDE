import Parser from 'web-tree-sitter';

type Tree = Parser.Tree;
import * as path from 'node:path';
import * as fs from 'node:fs';
import { app } from 'electron';

// Type alias for Language in 0.20.8
type LanguageType = Parser.Language;

export class ASTManager {
  private parser: Parser | null = null;
  private grammars: Map<string, LanguageType> = new Map();
  private isInitialized = false;
  private initializingPromise: Promise<void> | null = null;

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      try {
        await Parser.init({
          locateFile(scriptName: string) {
            // In 0.20.8, it looks for tree-sitter.wasm
            const wasmName = scriptName.includes('tree-sitter.wasm') ? 'tree-sitter.wasm' : scriptName;
            const possiblePaths = [
              path.join(app.getAppPath(), 'node_modules', 'web-tree-sitter', wasmName),
              path.join(process.cwd(), 'node_modules', 'web-tree-sitter', wasmName),
              wasmName
            ];
            for (const p of possiblePaths) {
              if (fs.existsSync(p)) return p;
            }
            return wasmName;
          }
        });
        this.isInitialized = true;
      } catch (e) {
        console.error('[ASTManager] Parser.init failed:', e);
        throw e;
      } finally {
        this.initializingPromise = null;
      }
    })();

    return this.initializingPromise;
  }

  private async getParserInstance(): Promise<Parser> {
    await this.initialize();
    if (!this.parser) {
      this.parser = new Parser();
    }
    return this.parser;
  }

  public async getLanguage(langName: string): Promise<LanguageType | null> {
    if (this.grammars.has(langName)) {
      return this.grammars.get(langName)!;
    }

    try {
      // Find the wasm path for the grammar
      const possibleDirs = [
        path.join(app.getAppPath(), 'node_modules', 'tree-sitter-wasms', 'out'),
        path.join(process.cwd(), 'node_modules', 'tree-sitter-wasms', 'out'),
        path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out')
      ];

      let wasmPath = '';
      for (const dir of possibleDirs) {
        const p = path.join(dir, `tree-sitter-${langName}.wasm`);
        if (fs.existsSync(p)) {
          wasmPath = p;
          break;
        }
      }
      
      if (!wasmPath) {
        console.warn(`[ASTManager] Grammar not found for: ${langName}`);
        return null;
      }

      // In 0.20.8, Language.load is static under Parser.Language
      const language = await Parser.Language.load(wasmPath);
      this.grammars.set(langName, language);
      return language;
    } catch (error) {
      console.error(`[ASTManager] Failed to load grammar ${langName}:`, error);
      return null;
    }
  }

  public getExtensionLanguage(filepath: string): string | null {
    const ext = path.extname(filepath).toLowerCase();
    switch (ext) {
      case '.ts': return 'typescript';
      case '.tsx': return 'tsx';
      case '.js': 
      case '.jsx': return 'javascript';
      case '.py': return 'python';
      case '.rs': return 'rust';
      case '.go': return 'go';
      case '.java': return 'java';
      case '.c': return 'c';
      case '.cpp': 
      case '.cxx':
      case '.cc': return 'cpp';
      default: return null;
    }
  }

  public async parseFile(filepath: string, content: string): Promise<Tree | null> {
    const parser = await this.getParserInstance();
    
    const langName = this.getExtensionLanguage(filepath);
    if (!langName) return null;

    const language = await this.getLanguage(langName);
    if (!language) return null;

    parser.setLanguage(language);
    return parser.parse(content);
  }
}
