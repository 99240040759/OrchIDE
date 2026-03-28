/**
 * File Tool Implementations
 * 
 * Implementation of file operation tools.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import fg from 'fast-glob';
import type { Tool, ToolContext, ToolResult } from '../types';
import { shouldIgnore } from '../../../../shared/utils/pathUtils';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Safely resolve a path within the workspace
 * Includes case-insensitive handling for Windows systems
 */
function safeResolvePath(workspacePath: string, filePath: string): string {
  const normalizedWorkspace = path.resolve(workspacePath);
  const normalizedInput = path.normalize(filePath);

  const targetPath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(normalizedWorkspace, normalizedInput);

  const normalizeForCheck = (value: string): string => {
    const normalized = path.normalize(value);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  };

  const workspaceForCheck = normalizeForCheck(normalizedWorkspace);
  const targetForCheck = normalizeForCheck(targetPath);

  if (
    !targetForCheck.startsWith(workspaceForCheck + path.sep) &&
    targetForCheck !== workspaceForCheck
  ) {
    throw new Error(`Access denied: path "${filePath}" is outside workspace`);
  }

  return targetPath;
}

/**
 * Get relative path from workspace
 */
function toRelativePath(workspacePath: string, targetPath: string): string {
  const relative = path.relative(workspacePath, targetPath);
  return relative || '.';
}

// ============================================================================
// Read File Implementation
// ============================================================================

export const readFileImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const filePath = (args.filePath || args.path || args.file || args.filename) as string;
  
  if (!filePath) {
    return {
      output: [{ name: 'Error', description: 'Validation Error', content: 'Missing filePath argument' }],
      success: false,
      error: 'Missing filePath argument',
    };
  }
  
  if (!context.workspacePath) {
    return {
      output: [],
      success: false,
      error: 'No workspace path available',
    };
  }

  try {
    const safePath = safeResolvePath(context.workspacePath, filePath);
    const content = await fs.readFile(safePath, 'utf-8');
    const fileName = path.basename(safePath);
    
    // Calculate line range
    const lines = content.split('\n');
    const lineRange = {
      start: 1,
      end: lines.length,
    };
    
    return {
      output: [{
        name: fileName,
        description: toRelativePath(context.workspacePath, safePath),
        content,
        uri: { type: 'file', value: safePath },
        lineRange,
      }],
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: [{
        name: 'Error',
        description: 'Failed to read file',
        content: `Error reading ${filePath}: ${message}`,
        icon: 'error',
      }],
      success: false,
      error: message,
    };
  }
};

// ============================================================================
// Write File Implementation
// ============================================================================

export const writeFileImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const filePath = (args.filePath || args.path || args.file || args.filename) as string;
  const content = args.content as string;
  
  if (!filePath) {
    return {
      output: [{ name: 'Error', description: 'Validation Error', content: 'Missing filePath argument' }],
      success: false,
      error: 'Missing filePath argument',
    };
  }
  
  if (!context.workspacePath) {
    return {
      output: [],
      success: false,
      error: 'No workspace path available',
    };
  }

  try {
    const safePath = safeResolvePath(context.workspacePath, filePath);
    
    // Check if file exists to calculate diff properly
    let oldContent = '';
    let fileExists = false;
    try {
      oldContent = await fs.readFile(safePath, 'utf-8');
      fileExists = true;
    } catch {
      // File doesn't exist, which is fine for write
    }
    
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
    
    // Calculate diff stats
    const oldLines = oldContent ? oldContent.split('\n').length : 0;
    const newLines = content.split('\n').length;
    const additions = fileExists ? Math.max(0, newLines - oldLines) : newLines;
    const deletions = fileExists ? Math.max(0, oldLines - newLines) : 0;
    
    return {
      output: [{
        name: 'File Written',
        description: toRelativePath(context.workspacePath, safePath),
        content: `Successfully wrote ${content.length} characters to ${filePath}`,
        diffStats: {
          additions,
          deletions,
        },
      }],
      success: true,
      metadata: { absolutePath: safePath },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: [{
        name: 'Error',
        description: 'Failed to write file',
        content: `Error writing ${filePath}: ${message}`,
        icon: 'error',
      }],
      success: false,
      error: message,
    };
  }
};

// ============================================================================
// Create File Implementation
// ============================================================================

export const createFileImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const filePath = (args.filePath || args.path || args.file || args.filename) as string;
  const content = (args.content as string) ?? '';
  
  if (!filePath) {
    return {
      output: [{ name: 'Error', description: 'Validation Error', content: 'Missing filePath argument' }],
      success: false,
      error: 'Missing filePath argument',
    };
  }
  
  if (!context.workspacePath) {
    return {
      output: [],
      success: false,
      error: 'No workspace path available',
    };
  }

  try {
    const safePath = safeResolvePath(context.workspacePath, filePath);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
    
    // Calculate diff stats for new file
    const newLines = content.split('\n').length;
    
    return {
      output: [{
        name: 'File Created',
        description: toRelativePath(context.workspacePath, safePath),
        content: `Successfully created ${filePath}`,
        diffStats: {
          additions: newLines,
          deletions: 0,
        },
      }],
      success: true,
      metadata: { absolutePath: safePath },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: [{
        name: 'Error',
        description: 'Failed to create file',
        content: `Error creating ${filePath}: ${message}`,
        icon: 'error',
      }],
      success: false,
      error: message,
    };
  }
};

// ============================================================================
// Delete File Implementation
// ============================================================================

export const deleteFileImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const targetPath = (args.targetPath || args.path || args.file || args.filePath || args.filename) as string;
  
  if (!targetPath) {
    return {
      output: [{ name: 'Error', description: 'Validation Error', content: 'Missing targetPath argument' }],
      success: false,
      error: 'Missing targetPath argument',
    };
  }
  
  if (!context.workspacePath) {
    return {
      output: [],
      success: false,
      error: 'No workspace path available',
    };
  }

  try {
    const safePath = safeResolvePath(context.workspacePath, targetPath);
    const stat = await fs.stat(safePath);
    
    if (stat.isDirectory()) {
      await fs.rm(safePath, { recursive: true, force: true });
    } else {
      await fs.unlink(safePath);
    }
    
    return {
      output: [{
        name: 'File Deleted',
        description: toRelativePath(context.workspacePath, safePath),
        content: `Successfully deleted ${targetPath}`,
      }],
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: [{
        name: 'Error',
        description: 'Failed to delete file',
        content: `Error deleting ${targetPath}: ${message}`,
        icon: 'error',
      }],
      success: false,
      error: message,
    };
  }
};

// ============================================================================
// List Directory Implementation
// ============================================================================

export const listDirectoryImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const dirPath = (args.dirPath as string) || '.';
  
  if (!context.workspacePath) {
    return {
      output: [],
      success: false,
      error: 'No workspace path available',
    };
  }

  try {
    const safePath = dirPath === '.' || !dirPath
      ? context.workspacePath
      : safeResolvePath(context.workspacePath, dirPath);

    const dirents = await fs.readdir(safePath, { withFileTypes: true });
    const entries = dirents
      .filter(e => !shouldIgnore(e.name))
      .map(e => ({
        name: e.name,
        path: toRelativePath(context.workspacePath!, path.join(safePath, e.name)),
        isDir: e.isDirectory(),
        ext: e.isDirectory() ? undefined : path.extname(e.name).slice(1) || undefined,
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const content = JSON.stringify({
      dirPath: toRelativePath(context.workspacePath, safePath),
      entryCount: entries.length,
      entries,
    }, null, 2);
    
    return {
      output: [{
        name: 'Directory Listing',
        description: toRelativePath(context.workspacePath, safePath),
        content,
      }],
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: [{
        name: 'Error',
        description: 'Failed to list directory',
        content: `Error listing ${dirPath}: ${message}`,
        icon: 'error',
      }],
      success: false,
      error: message,
    };
  }
};

// ============================================================================
// Search in Files Implementation
// ============================================================================

export const searchInFilesImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const pattern = args.pattern as string;
  const fileExtensions = args.fileExtensions as string[] | undefined;
  const dirPath = (args.dirPath as string) || '.';
  const maxResults = (args.maxResults as number) ?? 100;
  
  if (!context.workspacePath) {
    return {
      output: [],
      success: false,
      error: 'No workspace path available',
    };
  }

  const matches: { filePath: string; lineNumber: number; line: string }[] = [];
  const searchRoot = dirPath === '.'
    ? context.workspacePath
    : safeResolvePath(context.workspacePath, dirPath);

  async function searchDir(dir: string): Promise<void> {
    if (matches.length >= maxResults) return;
    if (context.signal?.aborted) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= maxResults) break;
        if (context.signal?.aborted) break;
        if (shouldIgnore(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await searchDir(fullPath);
        } else {
          const ext = path.extname(entry.name).slice(1);
          if (fileExtensions && fileExtensions.length > 0) {
            if (!fileExtensions.includes(ext)) continue;
          }

          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');

            for (let idx = 0; idx < lines.length && matches.length < maxResults; idx++) {
              if (lines[idx].includes(pattern)) {
                matches.push({
                  filePath: toRelativePath(context.workspacePath!, fullPath),
                  lineNumber: idx + 1,
                  line: lines[idx].trim().slice(0, 200),
                });
              }
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  try {
    await searchDir(searchRoot);
    
    const content = JSON.stringify({
      pattern,
      dirPath: toRelativePath(context.workspacePath, searchRoot),
      matches,
      total: matches.length,
      truncated: matches.length >= maxResults,
    }, null, 2);
    
    return {
      output: [{
        name: 'Search Results',
        description: `Found ${matches.length} matches for "${pattern}"`,
        content,
      }],
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: [{
        name: 'Error',
        description: 'Search failed',
        content: `Error searching for "${pattern}": ${message}`,
        icon: 'error',
      }],
      success: false,
      error: message,
    };
  }
};

// ============================================================================
// Grep Search Implementation (uses ripgrep or fallback)
// ============================================================================

export const grepSearchImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  // For now, use searchInFiles as fallback
  // TODO: Integrate with ripgrep for better performance
  return searchInFilesImpl(
    { ...args, pattern: args.pattern },
    context
  );
};

// ============================================================================
// Glob Search Implementation
// ============================================================================

export const globSearchImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const pattern = args.pattern as string;

  if (!context.workspacePath) {
    return {
      output: [],
      success: false,
      error: 'No workspace path available',
    };
  }

  try {
    const matches = await fg(pattern, {
      cwd: context.workspacePath,
      ignore: ['**/node_modules/**', '**/.git/**', '**/.vite/**', '**/*.bak'],
      dot: false,
      absolute: false,
      onlyFiles: true,
    });

    return {
      output: [{
        name: 'Glob Search Results',
        description: `Found ${matches.length} files matching "${pattern}"`,
        content: JSON.stringify({ pattern, matches, total: matches.length }, null, 2),
      }],
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: [{
        name: 'Error',
        description: 'Glob search failed',
        content: `Error: ${message}`,
        icon: 'error',
      }],
      success: false,
      error: message,
    };
  }
};
