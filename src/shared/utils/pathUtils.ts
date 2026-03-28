/**
 * Path utilities - Browser-safe functions
 * 
 * Uses 'pathe' package for cross-platform path operations.
 * Keeps domain-specific logic like shouldIgnore() for OrchIDE.
 * 
 * SINGLE SOURCE OF TRUTH for path-related utilities used across the codebase.
 */

import { basename, dirname, isAbsolute, join, extname } from 'pathe';

/**
 * Directories and files that should be ignored during file operations
 * This is the canonical list - all code should use shouldIgnore() from this module
 */
const IGNORED_ENTRIES = new Set([
  'node_modules',
  '__pycache__',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.vite',
  'coverage',
  '.nyc_output',
  'vendor',
  'venv',
  '.venv',
  'env',
  '.env',
]);

/**
 * Get the filename from a path (cross-platform, browser-safe)
 * @param filePath - The path to extract filename from
 * @returns The filename
 */
export function getFilename(filePath: string): string {
  return basename(filePath);
}

/**
 * Get the directory name from a path (browser-safe)
 * @param filePath - The path to extract directory from
 * @returns The directory path
 */
export function getDirname(filePath: string): string {
  return dirname(filePath);
}

/**
 * Check if a path is absolute (cross-platform, browser-safe)
 * @param filePath - The path to check
 * @returns True if the path is absolute
 */
export function isAbsolutePath(filePath: string): boolean {
  return isAbsolute(filePath);
}

/**
 * Join path segments (browser-safe)
 * @param segments - Path segments to join
 * @returns The joined path
 */
export function joinPath(...segments: string[]): string {
  return join(...segments);
}

/**
 * Check if a file/folder name should be ignored
 * This is OrchIDE-specific logic for file tree operations
 * @param name - The file or folder name
 * @returns True if should be ignored
 */
export function shouldIgnore(name: string): boolean {
  // Hidden files and directories (starts with dot)
  if (name.startsWith('.')) return true;
  
  return IGNORED_ENTRIES.has(name);
}

/**
 * Get file extension from filename (browser-safe)
 * @param filename - The filename
 * @returns The extension without the dot, or empty string
 */
export function getExtension(filename: string): string {
  const ext = extname(filename);
  // Remove the leading dot and return lowercase
  return ext ? ext.slice(1).toLowerCase() : '';
}
