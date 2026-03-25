/**
 * File operation tools for the AI agent
 * Uses secure path handling to prevent path traversal attacks
 * All operations are async to prevent blocking the event loop
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * SECURITY: Safely resolve a file path within a workspace
 * Prevents path traversal attacks by ensuring the resolved path
 * is within the workspace directory
 */
function safeResolvePath(workspacePath: string, filePath: string): string {
  const normalizedWorkspace = path.resolve(workspacePath);

  // Always treat as relative - reject absolute paths from agent
  let targetPath: string;
  if (path.isAbsolute(filePath)) {
    // Convert absolute path attempts to relative by stripping leading separators
    const relativized = filePath.replace(/^[/\\]+/, '');
    targetPath = path.resolve(normalizedWorkspace, relativized);
  } else {
    targetPath = path.resolve(normalizedWorkspace, filePath);
  }

  targetPath = path.normalize(targetPath);

  // Security check: ensure resolved path is within workspace
  if (!targetPath.startsWith(normalizedWorkspace + path.sep) && targetPath !== normalizedWorkspace) {
    throw new Error(`Access denied: path "${filePath}" is outside workspace`);
  }

  return targetPath;
}

/**
 * Check if a file/folder name should be ignored
 */
function shouldIgnore(name: string): boolean {
  if (name.startsWith('.')) return true;
  const ignored = new Set(['node_modules', '__pycache__', 'dist', 'build', '.git']);
  return ignored.has(name);
}

export function createFileTools(workspacePath: string) {
  /**
   * Read file tool - securely reads files within workspace only
   */
  const readFileTool = createTool({
    id: 'readFile',
    description: 'Read the contents of a file in the workspace. Use relative paths from workspace root.',
    inputSchema: z.object({
      filePath: z.string().describe('Relative path to the file from workspace root, e.g. "src/index.ts"'),
    }),
    outputSchema: z.object({
      content: z.string().nullable(),
      error: z.string().nullable(),
    }),
    execute: async ({ context }) => {
      try {
        const safePath = safeResolvePath(workspacePath, context.filePath);
        const content = await fs.readFile(safePath, 'utf-8');
        return { content, error: null };
      } catch (e: unknown) {
        return { content: null, error: (e as Error).message };
      }
    },
  });

  /**
   * Write file tool - securely writes files within workspace only
   */
  const writeFileTool = createTool({
    id: 'writeFile',
    description: 'Write or overwrite content to a file in the workspace. Creates the file and parent directories if they do not exist. Use relative paths only.',
    inputSchema: z.object({
      filePath: z.string().describe('Relative path to the file from workspace root'),
      content: z.string().describe('The full content to write to the file'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      absolutePath: z.string().nullable(),
      error: z.string().nullable(),
    }),
    execute: async ({ context }) => {
      try {
        const safePath = safeResolvePath(workspacePath, context.filePath);
        await fs.mkdir(path.dirname(safePath), { recursive: true });
        await fs.writeFile(safePath, context.content, 'utf-8');
        return { success: true, absolutePath: safePath, error: null };
      } catch (e: unknown) {
        return { success: false, absolutePath: null, error: (e as Error).message };
      }
    },
  });

  /**
   * List directory tool - lists files within workspace
   */
  const listDirectoryTool = createTool({
    id: 'listDirectory',
    description: 'List files and directories at a given path within the workspace.',
    inputSchema: z.object({
      dirPath: z.string().default('.').describe('Relative path to directory from workspace root. Use "." for root.'),
    }),
    outputSchema: z.object({
      entries: z.array(z.object({
        name: z.string(),
        isDir: z.boolean(),
        ext: z.string().optional(),
      })),
      error: z.string().nullable(),
    }),
    execute: async ({ context }) => {
      try {
        const safePath = context.dirPath === '.'
          ? workspacePath
          : safeResolvePath(workspacePath, context.dirPath);

        const dirents = await fs.readdir(safePath, { withFileTypes: true });
        const entries = dirents
          .filter(e => !shouldIgnore(e.name))
          .map(e => ({
            name: e.name,
            isDir: e.isDirectory(),
            ext: e.isDirectory() ? undefined : path.extname(e.name).slice(1) || undefined,
          }))
          .sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

        return { entries, error: null };
      } catch (e: unknown) {
        return { entries: [], error: (e as Error).message };
      }
    },
  });

  /**
   * Create file tool - creates new files within workspace
   */
  const createFileTool = createTool({
    id: 'createFile',
    description: 'Create a new file (empty or with initial content) in the workspace. Use relative paths only.',
    inputSchema: z.object({
      filePath: z.string().describe('Relative path to new file from workspace root'),
      content: z.string().optional().default('').describe('Initial content for the file'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().nullable(),
    }),
    execute: async ({ context }) => {
      try {
        const safePath = safeResolvePath(workspacePath, context.filePath);
        await fs.mkdir(path.dirname(safePath), { recursive: true });
        await fs.writeFile(safePath, context.content ?? '', 'utf-8');
        return { success: true, error: null };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    },
  });

  /**
   * Delete file tool - securely deletes files within workspace only
   */
  const deleteFileTool = createTool({
    id: 'deleteFile',
    description: 'Delete a file or directory from the workspace. Use relative paths only.',
    inputSchema: z.object({
      targetPath: z.string().describe('Relative path from workspace root to delete'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().nullable(),
    }),
    execute: async ({ context }) => {
      try {
        const safePath = safeResolvePath(workspacePath, context.targetPath);
        const stat = await fs.stat(safePath);
        if (stat.isDirectory()) {
          await fs.rm(safePath, { recursive: true, force: true });
        } else {
          await fs.unlink(safePath);
        }
        return { success: true, error: null };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    },
  });

  /**
   * Search in files tool - searches for text patterns within workspace
   */
  const searchInFilesTool = createTool({
    id: 'searchInFiles',
    description: 'Search for a text pattern across all files in the workspace. Returns matching lines with file paths.',
    inputSchema: z.object({
      pattern: z.string().describe('Text pattern or substring to search for'),
      fileExtensions: z.array(z.string()).optional().describe('Filter by extensions e.g. ["ts", "tsx"]'),
    }),
    outputSchema: z.object({
      matches: z.array(z.object({
        filePath: z.string(),
        lineNumber: z.number(),
        line: z.string(),
      })),
      error: z.string().nullable(),
    }),
    execute: async ({ context }) => {
      const matches: { filePath: string; lineNumber: number; line: string }[] = [];
      const maxResults = 100;

      async function searchDir(dir: string): Promise<void> {
        if (matches.length >= maxResults) return;

        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            if (matches.length >= maxResults) break;
            if (shouldIgnore(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              await searchDir(fullPath);
            } else {
              const ext = path.extname(entry.name).slice(1);
              if (context.fileExtensions && context.fileExtensions.length > 0) {
                if (!context.fileExtensions.includes(ext)) continue;
              }

              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const lines = content.split('\n');

                for (let idx = 0; idx < lines.length && matches.length < maxResults; idx++) {
                  if (lines[idx].includes(context.pattern)) {
                    matches.push({
                      filePath: path.relative(workspacePath, fullPath),
                      lineNumber: idx + 1,
                      line: lines[idx].trim().slice(0, 200), // Limit line length
                    });
                  }
                }
              } catch {
                // Skip files that can't be read (binary, permissions, etc.)
              }
            }
          }
        } catch {
          // Skip directories that can't be read
        }
      }

      try {
        await searchDir(workspacePath);
        return { matches, error: null };
      } catch (e: unknown) {
        return { matches: [], error: (e as Error).message };
      }
    },
  });

  return {
    readFileTool,
    writeFileTool,
    listDirectoryTool,
    createFileTool,
    deleteFileTool,
    searchInFilesTool,
  };
}
