import * as path from 'node:path';
import type { ToolContext, ToolResult } from '../types';
import { getWorkspaceIndexer } from '../../../ipc/indexer';

function formatSymbolRow(row: any): string {
  const parts = [];
  parts.push(`File: ${row.filepath}`);
  parts.push(`Line: ${row.line_start} to ${row.line_end}`);
  parts.push(`Kind: ${row.kind}`);
  parts.push(`Snippet:\n${row.snippet}`);
  return parts.join('\n');
}

// ============================================================================
// Find Definition Tool Implementation
// ============================================================================

export const astFindDefinitionImpl = async (args: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const indexer = getWorkspaceIndexer(context.workspacePath);
    const rows = indexer.getDb().findDefinitions(args.symbolName);

    if (!rows || rows.length === 0) {
      return {
        success: true,
        output: [{
          name: 'astFindDefinition',
          description: `No definitions found for "${args.symbolName}"`,
          content: 'No exact matches were found in the parsed AST. Try astGlobalSearch for a prefix search.',
        }],
      };
    }

    const formatted = rows.map(r => formatSymbolRow(r)).join('\n\n---\n\n');

    return {
      success: true,
      output: [{
        name: 'astFindDefinition',
        description: `Found ${rows.length} definition(s) for "${args.symbolName}"`,
        content: formatted,
      }],
    };
  } catch (e: any) {
    return { success: false, error: e.message, output: [] };
  }
};

// ============================================================================
// Document Symbols Tool Implementation
// ============================================================================

export const astDocumentSymbolsImpl = async (args: any, context: ToolContext): Promise<ToolResult> => {
  try {
    // Handle workspace paths
    const normalizedPath = args.filePath.startsWith('/') 
      ? path.relative(context.workspacePath, args.filePath) 
      : args.filePath;
      
    const indexer = getWorkspaceIndexer(context.workspacePath);
    const rows = indexer.getDb().getSymbolsForFile(normalizedPath);

    if (!rows || rows.length === 0) {
      return {
        success: true,
        output: [{
          name: 'astDocumentSymbols',
          description: `No symbols found or file not parsed for "${args.filePath}"`,
          content: 'Either the file is empty, has an unsupported extension (e.g. not ts/js/python), or the AST is still indexing.',
        }],
      };
    }

    // Instead of full snippets, just return an outline
    const outline = rows.map(r => `- [${r.kind}] ${r.name} (lines ${r.line_start}-${r.line_end})`).join('\n');

    return {
      success: true,
      output: [{
        name: 'astDocumentSymbols',
        description: `Found ${rows.length} symbols in ${args.filePath}`,
        content: outline,
      }],
    };
  } catch (e: any) {
    return { success: false, error: e.message, output: [] };
  }
};

// ============================================================================
// Global Search Tool Implementation
// ============================================================================

export const astGlobalSearchImpl = async (args: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const indexer = getWorkspaceIndexer(context.workspacePath);
    const limit = args.limit || 20;
    const rows = indexer.getDb().searchSymbols(args.query, limit);

    if (!rows || rows.length === 0) {
      return {
        success: true,
        output: [{
          name: 'astGlobalSearch',
          description: `No symbols found matching prefix "${args.query}"`,
          content: 'No results found in the AST.',
        }],
      };
    }

    const formatted = rows.map(r => `- [${r.kind}] ${r.name} in ${r.filepath}:${r.line_start}`).join('\n');

    return {
      success: true,
      output: [{
        name: 'astGlobalSearch',
        description: `Found ${rows.length} symbol(s) matching "${args.query}"`,
        content: formatted,
      }],
    };
  } catch (e: any) {
    return { success: false, error: e.message, output: [] };
  }
};
