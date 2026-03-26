/**
 * Language detection utilities for code files
 * Single source of truth for file extension to language mapping
 */

import { getExtension } from './pathUtils';

const LANGUAGE_MAP: Record<string, string> = {
  // TypeScript/JavaScript
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',

  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',

  // Data formats
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  csv: 'plaintext',

  // Documentation
  md: 'markdown',
  mdx: 'markdown',
  txt: 'plaintext',

  // Systems programming
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  rs: 'rust',
  go: 'go',

  // Scripting
  py: 'python',
  rb: 'ruby',
  php: 'php',
  pl: 'perl',
  lua: 'lua',

  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',

  // JVM
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  groovy: 'groovy',

  // Mobile
  swift: 'swift',
  m: 'objective-c',
  dart: 'dart',

  // .NET
  cs: 'csharp',
  fs: 'fsharp',
  vb: 'vb',

  // Config files
  ini: 'ini',
  conf: 'ini',
  env: 'dotenv',
  dockerfile: 'dockerfile',

  // SQL
  sql: 'sql',

  // GraphQL
  graphql: 'graphql',
  gql: 'graphql',
};

/**
 * Get the Monaco editor language for a filename
 * @param filename - The filename or path to analyze
 * @returns The language identifier for Monaco editor
 */
export function getLanguageFromFilename(filename: string): string {
  // Handle special filenames without extensions
  const baseName = filename.split('/').pop()?.split('\\').pop()?.toLowerCase() || '';

  // Special filenames
  const specialFiles: Record<string, string> = {
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    gemfile: 'ruby',
    rakefile: 'ruby',
    cmakelists: 'cmake',
    '.gitignore': 'ignore',
    '.dockerignore': 'ignore',
    '.eslintrc': 'json',
    '.prettierrc': 'json',
    'tsconfig.json': 'jsonc',
    'jsconfig.json': 'jsonc',
    'package.json': 'json',
  };

  if (specialFiles[baseName]) {
    return specialFiles[baseName];
  }

  // Get extension
  const ext = baseName.split('.').pop()?.toLowerCase() || '';

  return LANGUAGE_MAP[ext] || 'plaintext';
}

/**
 * Check if a file is likely a text file based on extension
 * @param filename - The filename to check
 * @returns True if the file is likely text
 */
export function isTextFile(filename: string): boolean {
  const ext = getExtension(filename);
  if (!ext) return true; // Files without extensions are often text

  const binaryExtensions = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg',
    'mp3', 'mp4', 'wav', 'ogg', 'webm', 'avi', 'mov',
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2',
    'exe', 'dll', 'so', 'dylib', 'bin',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'woff', 'woff2', 'ttf', 'eot', 'otf',
    'db', 'sqlite', 'sqlite3',
  ]);

  return !binaryExtensions.has(ext);
}

// Re-export getExtension for backwards compatibility
export { getExtension } from './pathUtils';
