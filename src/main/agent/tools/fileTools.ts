import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

export function createFileTools(workspacePath: string) {
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
        const absPath = path.isAbsolute(context.filePath)
          ? context.filePath
          : path.join(workspacePath, context.filePath);
        const content = fs.readFileSync(absPath, 'utf-8');
        return { content, error: null as string | null };
      } catch (e: unknown) {
        return { content: null, error: (e as Error).message };
      }
    },
  });

  const writeFileTool = createTool({
    id: 'writeFile',
    description: 'Write or overwrite content to a file in the workspace. Creates the file and parent directories if they do not exist.',
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
        const absPath = path.isAbsolute(context.filePath)
          ? context.filePath
          : path.join(workspacePath, context.filePath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, context.content, 'utf-8');
        return { success: true, absolutePath: absPath, error: null as string | null };
      } catch (e: unknown) {
        return { success: false, absolutePath: null, error: (e as Error).message };
      }
    },
  });

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
        const absPath = context.dirPath === '.'
          ? workspacePath
          : path.join(workspacePath, context.dirPath);
        const entries = fs.readdirSync(absPath, { withFileTypes: true })
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
          .map(e => ({
            name: e.name,
            isDir: e.isDirectory(),
            ext: e.isDirectory() ? undefined : path.extname(e.name).slice(1),
          }));
        return { entries, error: null as string | null };
      } catch (e: unknown) {
        return { entries: [], error: (e as Error).message };
      }
    },
  });

  const createFileTool = createTool({
    id: 'createFile',
    description: 'Create a new file (empty or with initial content) in the workspace.',
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
        const absPath = path.join(workspacePath, context.filePath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, context.content ?? '', 'utf-8');
        return { success: true, error: null };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  });

  const deleteFileTool = createTool({
    id: 'deleteFile',
    description: 'Delete a file or directory from the workspace.',
    inputSchema: z.object({
      targetPath: z.string().describe('Relative path from workspace root to delete'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().nullable(),
    }),
    execute: async ({ context }) => {
      try {
        const absPath = path.join(workspacePath, context.targetPath);
        const stat = fs.statSync(absPath);
        if (stat.isDirectory()) {
          fs.rmSync(absPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(absPath);
        }
        return { success: true, error: null };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  });

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

      function searchDir(dir: string) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              searchDir(fullPath);
            } else {
              const ext = path.extname(entry.name).slice(1);
              if (context.fileExtensions && !context.fileExtensions.includes(ext)) continue;
              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, idx) => {
                  if (line.includes(context.pattern)) {
                    matches.push({
                      filePath: path.relative(workspacePath, fullPath),
                      lineNumber: idx + 1,
                      line: line.trim(),
                    });
                  }
                });
              } catch {}
            }
          }
        } catch {}
      }

      searchDir(workspacePath);
      return { matches: matches.slice(0, 100), error: null as string | null };
    },
  });

  return { readFileTool, writeFileTool, listDirectoryTool, createFileTool, deleteFileTool, searchInFilesTool };
}
