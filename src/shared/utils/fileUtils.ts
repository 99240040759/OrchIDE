/**
 * File system utilities for common file operations
 * Main process only - uses Node.js fs module
 * Provides async versions to prevent blocking the event loop
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { shouldIgnore } from './pathUtils';
import { getExtension } from './languageUtils';
import type { FileEntry, FileOperationResult } from '../types';

/**
 * Safely resolve a file path within a workspace
 * Prevents path traversal attacks by ensuring the resolved path
 * is within the workspace directory
 *
 * @param workspacePath - The base workspace directory
 * @param filePath - The relative or absolute path to resolve
 * @returns The safe absolute path
 * @throws Error if the path would escape the workspace
 */
export function safeResolvePath(workspacePath: string, filePath: string): string {
  const normalizedWorkspace = path.resolve(workspacePath);

  let targetPath: string;
  if (path.isAbsolute(filePath)) {
    targetPath = path.resolve(filePath);
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
 * Read a file asynchronously
 */
export async function readFileAsync(filePath: string): Promise<FileOperationResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content, error: null };
  } catch (e: unknown) {
    return { success: false, content: null, error: (e as Error).message };
  }
}

/**
 * Write a file asynchronously, creating parent directories if needed
 */
export async function writeFileAsync(filePath: string, content: string): Promise<FileOperationResult> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true, absolutePath: filePath, error: null };
  } catch (e: unknown) {
    return { success: false, absolutePath: null, error: (e as Error).message };
  }
}

/**
 * Delete a file or directory asynchronously
 */
export async function deleteAsync(targetPath: string): Promise<FileOperationResult> {
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.unlink(targetPath);
    }
    return { success: true, error: null };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Check if a path exists
 */
export async function existsAsync(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a file tree recursively (async version)
 */
export async function buildFileTree(
  dirPath: string,
  maxDepth = 6,
  currentDepth = 0
): Promise<FileEntry[]> {
  if (currentDepth >= maxDepth) return [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results: FileEntry[] = [];

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const isDir = entry.isDirectory();

      const fileEntry: FileEntry = {
        name: entry.name,
        path: fullPath,
        isDir,
        ext: isDir ? undefined : getExtension(entry.name),
      };

      if (isDir) {
        fileEntry.children = await buildFileTree(fullPath, maxDepth, currentDepth + 1);
      }

      results.push(fileEntry);
    }

    return results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

/**
 * List directory entries (non-recursive)
 */
export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    return entries
      .filter(e => !shouldIgnore(e.name))
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDir: e.isDirectory(),
        ext: e.isDirectory() ? undefined : getExtension(e.name),
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}

/**
 * Search for text pattern in files recursively
 */
export async function searchInFiles(
  workspacePath: string,
  pattern: string,
  fileExtensions?: string[],
  maxResults = 100
): Promise<{ filePath: string; lineNumber: number; line: string }[]> {
  const matches: { filePath: string; lineNumber: number; line: string }[] = [];

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
          const ext = getExtension(entry.name);
          if (fileExtensions?.length && !fileExtensions.includes(ext)) {
            continue;
          }

          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');

            for (let idx = 0; idx < lines.length && matches.length < maxResults; idx++) {
              if (lines[idx].includes(pattern)) {
                matches.push({
                  filePath: path.relative(workspacePath, fullPath),
                  lineNumber: idx + 1,
                  line: lines[idx].trim(),
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

  await searchDir(workspacePath);
  return matches;
}

/**
 * Safe file read within workspace
 */
export async function safeReadFile(
  workspacePath: string,
  filePath: string
): Promise<FileOperationResult> {
  try {
    const safePath = safeResolvePath(workspacePath, filePath);
    return await readFileAsync(safePath);
  } catch (e: unknown) {
    return { success: false, content: null, error: (e as Error).message };
  }
}

/**
 * Safe file write within workspace
 */
export async function safeWriteFile(
  workspacePath: string,
  filePath: string,
  content: string
): Promise<FileOperationResult> {
  try {
    const safePath = safeResolvePath(workspacePath, filePath);
    return await writeFileAsync(safePath, content);
  } catch (e: unknown) {
    return { success: false, absolutePath: null, error: (e as Error).message };
  }
}

/**
 * Safe file delete within workspace
 */
export async function safeDelete(
  workspacePath: string,
  targetPath: string
): Promise<FileOperationResult> {
  try {
    const safePath = safeResolvePath(workspacePath, targetPath);
    return await deleteAsync(safePath);
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}
