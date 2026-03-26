/**
 * Surgical File Edit Tool Implementations
 *
 * replaceFileContent  — single contiguous block replacement
 * multiReplaceFileContent — multiple non-contiguous replacements
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../types';

// ============================================================================
// replaceFileContent
// ============================================================================

export const replaceFileContentImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const filePath = args.filePath as string;
  const targetContent = args.targetContent as string;
  const replacementContent = args.replacementContent as string;
  const startLine = (args.startLine as number) || undefined;
  const endLine = (args.endLine as number) || undefined;
  const allowMultiple = (args.allowMultiple as boolean) ?? false;

  if (!filePath || targetContent === undefined || replacementContent === undefined) {
    return {
      output: [{ name: 'Error', description: 'Missing required arguments', content: 'filePath, targetContent, and replacementContent are required.' }],
      success: false,
      error: 'Missing required arguments',
    };
  }

  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(context.workspacePath || '', filePath);

  if (!fs.existsSync(absPath)) {
    return {
      output: [{ name: 'Error', description: 'File not found', content: `File does not exist: ${filePath}` }],
      success: false,
      error: 'File not found',
    };
  }

  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n');

    // Determine search scope
    const scopeStart = startLine ? Math.max(0, startLine - 1) : 0;
    const scopeEnd = endLine ? Math.min(lines.length, endLine) : lines.length;
    const scopedText = lines.slice(scopeStart, scopeEnd).join('\n');

    // Count occurrences in scope
    const occurrences = countOccurrences(scopedText, targetContent);

    if (occurrences === 0) {
      // Provide the ACTUAL file content in the error so the model can self-correct
      const scopePreview = scopedText.split('\n').slice(0, 15).join('\n');
      const targetPreview = targetContent.slice(0, 200);
      return {
        output: [{
          name: 'Error',
          description: 'Target content not found',
          content:
            `Could not find the specified target content in ${filePath}${startLine ? ` (lines ${startLine}-${endLine})` : ''}.\n\n` +
            `Your targetContent (first 200 chars):\n\`\`\`\n${targetPreview}\n\`\`\`\n\n` +
            `Actual file content in scope (first 15 lines):\n\`\`\`\n${scopePreview}\n\`\`\`\n\n` +
            'HINT: The targetContent must be an EXACT character-for-character match of the file content, including whitespace and indentation. ' +
            'Copy the exact text from the file, do not retype it from memory.',
        }],
        success: false,
        error: 'Target content not found in file',
      };
    }

    if (occurrences > 1 && !allowMultiple) {
      return {
        output: [{
          name: 'Error',
          description: 'Multiple occurrences found',
          content: `Found ${occurrences} occurrences of the target content in the specified range. Set allowMultiple=true to replace all, or narrow the startLine/endLine range.`,
        }],
        success: false,
        error: 'Multiple occurrences found',
      };
    }

    // Perform replacement within scope
    const beforeScope = lines.slice(0, scopeStart).join('\n');
    const afterScope = lines.slice(scopeEnd).join('\n');
    const newScopedText = allowMultiple
      ? scopedText.split(targetContent).join(replacementContent)
      : scopedText.replace(targetContent, replacementContent);

    const parts: string[] = [];
    if (scopeStart > 0) parts.push(beforeScope);
    parts.push(newScopedText);
    if (scopeEnd < lines.length) parts.push(afterScope);

    const newContent = parts.join('\n');
    fs.writeFileSync(absPath, newContent, 'utf-8');

    const replacedCount = allowMultiple ? occurrences : 1;

    return {
      output: [{
        name: 'File Edited',
        description: filePath,
        content: `Successfully replaced ${replacedCount} occurrence(s) in ${filePath}.`,
      }],
      success: true,
      metadata: { replacedCount, filePath: absPath },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      output: [{ name: 'Error', description: 'Edit failed', content: msg }],
      success: false,
      error: msg,
    };
  }
};

// ============================================================================
// multiReplaceFileContent
// ============================================================================

interface ReplacementChunk {
  startLine?: number;
  endLine?: number;
  targetContent: string;
  replacementContent: string;
  allowMultiple?: boolean;
}

export const multiReplaceFileContentImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const filePath = args.filePath as string;
  const rawChunks = args.chunks as ReplacementChunk[];

  if (!filePath || !rawChunks || !Array.isArray(rawChunks) || rawChunks.length === 0) {
    return {
      output: [{ name: 'Error', description: 'Missing arguments', content: 'filePath and chunks[] are required.' }],
      success: false,
      error: 'Missing arguments',
    };
  }

  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(context.workspacePath || '', filePath);

  if (!fs.existsSync(absPath)) {
    return {
      output: [{ name: 'Error', description: 'File not found', content: `File does not exist: ${filePath}` }],
      success: false,
      error: 'File not found',
    };
  }

  try {
    let content = fs.readFileSync(absPath, 'utf-8');

    // Sort chunks by startLine descending so later replacements don't shift earlier ones
    const sortedChunks = [...rawChunks].sort((a, b) => (b.startLine || 0) - (a.startLine || 0));

    let totalReplaced = 0;
    const errors: string[] = [];

    for (let i = 0; i < sortedChunks.length; i++) {
      const chunk = sortedChunks[i];
      const lines = content.split('\n');
      const scopeStart = chunk.startLine ? Math.max(0, chunk.startLine - 1) : 0;
      const scopeEnd = chunk.endLine ? Math.min(lines.length, chunk.endLine) : lines.length;
      const scopedText = lines.slice(scopeStart, scopeEnd).join('\n');

      const occurrences = countOccurrences(scopedText, chunk.targetContent);

      if (occurrences === 0) {
        errors.push(`Chunk ${i + 1}: target content not found in lines ${chunk.startLine || 1}-${chunk.endLine || lines.length}`);
        continue;
      }

      if (occurrences > 1 && !chunk.allowMultiple) {
        errors.push(`Chunk ${i + 1}: found ${occurrences} occurrences (set allowMultiple=true or narrow line range)`);
        continue;
      }

      const newScopedText = chunk.allowMultiple
        ? scopedText.split(chunk.targetContent).join(chunk.replacementContent)
        : scopedText.replace(chunk.targetContent, chunk.replacementContent);

      const before = lines.slice(0, scopeStart).join('\n');
      const after = lines.slice(scopeEnd).join('\n');
      const parts: string[] = [];
      if (scopeStart > 0) parts.push(before);
      parts.push(newScopedText);
      if (scopeEnd < lines.length) parts.push(after);
      content = parts.join('\n');
      totalReplaced += chunk.allowMultiple ? occurrences : 1;
    }

    fs.writeFileSync(absPath, content, 'utf-8');

    const resultMsg = errors.length > 0
      ? `Applied ${totalReplaced} replacement(s) with ${errors.length} error(s):\n${errors.join('\n')}`
      : `Successfully applied ${totalReplaced} replacement(s) across ${sortedChunks.length} chunk(s).`;

    return {
      output: [{ name: 'File Multi-Edited', description: filePath, content: resultMsg }],
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      metadata: { totalReplaced, chunkCount: sortedChunks.length, errors },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      output: [{ name: 'Error', description: 'Multi-edit failed', content: msg }],
      success: false,
      error: msg,
    };
  }
};

// ============================================================================
// Helpers
// ============================================================================

function countOccurrences(text: string, target: string): number {
  if (!target) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(target, pos)) !== -1) {
    count++;
    pos += target.length;
  }
  return count;
}
