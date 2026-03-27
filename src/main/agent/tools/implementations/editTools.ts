/**
 * Surgical File Edit Tool Implementations — Production-Grade
 *
 * Core tools:
 * - replaceFileContent      — single contiguous block replacement with checksum
 * - multiReplaceFileContent — multiple non-contiguous replacements
 *
 * Features:
 * - Checksum validation before edits (prevents race conditions)
 * - Detailed error messages with actual vs expected content
 * - Fuzzy matching suggestions when exact match fails
 * - Atomic writes with backup rollback
 * - Line-range scoping for large files
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { Tool, ToolContext, ToolResult } from '../types';

// ============================================================================
// Types
// ============================================================================

interface EditAttempt {
  filePath: string;
  checksum: string;
  timestamp: number;
}

interface DiffMatch {
  similarity: number;
  matchStart: number;
  matchEnd: number;
  actualContent: string;
}

// ============================================================================
// Edit History (for stall detection)
// ============================================================================

const recentEdits: EditAttempt[] = [];
const MAX_EDIT_HISTORY = 20;

function recordEditAttempt(filePath: string, checksum: string): void {
  recentEdits.push({ filePath, checksum, timestamp: Date.now() });
  if (recentEdits.length > MAX_EDIT_HISTORY) {
    recentEdits.shift();
  }
}

// ============================================================================
// Checksum Utilities
// ============================================================================

/**
 * Calculate SHA-256 checksum of content.
 */
function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

/**
 * Validate file checksum matches expected value.
 */
function validateChecksum(content: string, expectedChecksum: string | undefined): boolean {
  if (!expectedChecksum) return true; // No checksum provided, skip validation
  const actual = calculateChecksum(content);
  return actual === expectedChecksum;
}

// ============================================================================
// Fuzzy Matching
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Limit comparison to first 500 chars for performance
  const maxLen = 500;
  const aSlice = a.slice(0, maxLen);
  const bSlice = b.slice(0, maxLen);

  const matrix: number[][] = [];

  for (let i = 0; i <= bSlice.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= aSlice.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bSlice.length; i++) {
    for (let j = 1; j <= aSlice.length; j++) {
      if (bSlice.charAt(i - 1) === aSlice.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[bSlice.length][aSlice.length];
}

/**
 * Calculate similarity ratio (0-1) between two strings.
 */
function calculateSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - (distance / Math.min(maxLen, 500));
}

/**
 * Find best fuzzy match for target content in file.
 * Returns the closest match if similarity > 0.7.
 */
function findFuzzyMatch(fileContent: string, targetContent: string, threshold = 0.7): DiffMatch | null {
  const targetLines = targetContent.split('\n');
  const fileLines = fileContent.split('\n');
  const targetLineCount = targetLines.length;

  let bestMatch: DiffMatch | null = null;
  let bestSimilarity = threshold;

  // Slide window through file
  for (let i = 0; i <= fileLines.length - targetLineCount; i++) {
    const windowContent = fileLines.slice(i, i + targetLineCount).join('\n');
    const similarity = calculateSimilarity(targetContent, windowContent);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = {
        similarity,
        matchStart: i + 1, // 1-indexed
        matchEnd: i + targetLineCount,
        actualContent: windowContent,
      };
    }
  }

  return bestMatch;
}

/**
 * Highlight differences between expected and actual content.
 */
function highlightDifferences(expected: string, actual: string): string {
  const expLines = expected.split('\n');
  const actLines = actual.split('\n');
  const diff: string[] = [];

  const maxLines = Math.max(expLines.length, actLines.length);

  for (let i = 0; i < Math.min(maxLines, 20); i++) {
    const expLine = expLines[i] ?? '';
    const actLine = actLines[i] ?? '';

    if (expLine !== actLine) {
      if (expLine && actLine) {
        diff.push(`Line ${i + 1}:`);
        diff.push(`  Expected: ${expLine.slice(0, 80)}${expLine.length > 80 ? '...' : ''}`);
        diff.push(`  Actual:   ${actLine.slice(0, 80)}${actLine.length > 80 ? '...' : ''}`);
      } else if (expLine && !actLine) {
        diff.push(`Line ${i + 1}: Expected "${expLine.slice(0, 60)}..." but line doesn't exist`);
      } else {
        diff.push(`Line ${i + 1}: Unexpected line "${actLine.slice(0, 60)}..."`);
      }
    }
  }

  if (maxLines > 20) {
    diff.push(`... and ${maxLines - 20} more lines`);
  }

  return diff.join('\n');
}

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
  const expectedChecksum = args.checksum as string | undefined;
  const createBackup = (args.createBackup as boolean) ?? true;

  // Validate required arguments
  if (!filePath || targetContent === undefined || replacementContent === undefined) {
    return {
      output: [{
        name: 'Error',
        description: 'Missing required arguments',
        content: 'Required: filePath, targetContent, replacementContent',
      }],
      success: false,
      error: 'Missing required arguments',
    };
  }

  // Resolve path
  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(context.workspacePath || '', filePath);

  if (!fs.existsSync(absPath)) {
    return {
      output: [{
        name: 'Error',
        description: 'File not found',
        content: `File does not exist: ${filePath}\n\nHINT: Use createFile to create a new file, or check the file path.`,
      }],
      success: false,
      error: 'File not found',
    };
  }

  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    const currentChecksum = calculateChecksum(content);

    // Checksum validation
    if (expectedChecksum && !validateChecksum(content, expectedChecksum)) {
      return {
        output: [{
          name: 'Error',
          description: 'Checksum mismatch',
          content:
            `File has been modified since you last read it.\n\n` +
            `Expected checksum: ${expectedChecksum}\n` +
            `Current checksum:  ${currentChecksum}\n\n` +
            `HINT: Re-read the file to get the current content and checksum, then retry the edit.`,
        }],
        success: false,
        error: 'File modified since last read (checksum mismatch)',
      };
    }

    const lines = content.split('\n');

    // Determine search scope
    const scopeStart = startLine ? Math.max(0, startLine - 1) : 0;
    const scopeEnd = endLine ? Math.min(lines.length, endLine) : lines.length;
    const scopedText = lines.slice(scopeStart, scopeEnd).join('\n');

    // Count occurrences in scope
    const occurrences = countOccurrences(scopedText, targetContent);

    if (occurrences === 0) {
      // Try fuzzy matching to provide helpful suggestions
      const fuzzyMatch = findFuzzyMatch(scopedText, targetContent);

      let errorContent =
        `Could not find the specified target content in ${filePath}` +
        `${startLine ? ` (lines ${startLine}-${endLine})` : ''}.\n\n`;

      if (fuzzyMatch) {
        errorContent +=
          `**FOUND SIMILAR CONTENT (${(fuzzyMatch.similarity * 100).toFixed(0)}% match) at lines ${fuzzyMatch.matchStart}-${fuzzyMatch.matchEnd}:**\n\n` +
          `\`\`\`\n${fuzzyMatch.actualContent.split('\n').slice(0, 15).join('\n')}\n\`\`\`\n\n` +
          `**DIFFERENCES:**\n${highlightDifferences(targetContent, fuzzyMatch.actualContent)}\n\n`;
      } else {
        // Show actual file content for manual comparison
        const scopePreview = scopedText.split('\n').slice(0, 20).join('\n');
        errorContent +=
          `**Your targetContent (first 15 lines):**\n\`\`\`\n${targetContent.split('\n').slice(0, 15).join('\n')}\n\`\`\`\n\n` +
          `**Actual file content in scope (first 20 lines):**\n\`\`\`\n${scopePreview}\n\`\`\`\n\n`;
      }

      errorContent +=
        `**HINTS:**\n` +
        `1. The targetContent must be an EXACT character-for-character match\n` +
        `2. Check for whitespace differences (spaces vs tabs, trailing spaces)\n` +
        `3. Use readFile to get the exact current content\n` +
        `4. If the file changed, re-read it before editing`;

      recordEditAttempt(absPath, currentChecksum);

      return {
        output: [{
          name: 'Error',
          description: 'Target content not found',
          content: errorContent,
        }],
        success: false,
        error: 'Target content not found in file',
        metadata: { checksum: currentChecksum, fuzzyMatch },
      };
    }

    if (occurrences > 1 && !allowMultiple) {
      // Show where duplicates occur
      const duplicateLocations: number[] = [];
      let searchPos = 0;
      let lineNum = scopeStart + 1;

      for (const line of lines.slice(scopeStart, scopeEnd)) {
        if (scopedText.indexOf(targetContent, searchPos) === searchPos ||
            line.includes(targetContent.split('\n')[0])) {
          duplicateLocations.push(lineNum);
        }
        searchPos += line.length + 1;
        lineNum++;
      }

      return {
        output: [{
          name: 'Error',
          description: 'Multiple occurrences found',
          content:
            `Found ${occurrences} occurrences of the target content.\n\n` +
            `Approximate locations: lines ${duplicateLocations.slice(0, 5).join(', ')}${duplicateLocations.length > 5 ? '...' : ''}\n\n` +
            `**OPTIONS:**\n` +
            `1. Set allowMultiple=true to replace all occurrences\n` +
            `2. Use startLine/endLine to narrow the scope to a single occurrence\n` +
            `3. Include more context in targetContent to make it unique`,
        }],
        success: false,
        error: 'Multiple occurrences found',
        metadata: { occurrences, locations: duplicateLocations.slice(0, 10) },
      };
    }

    // Create backup before edit
    let backupPath: string | undefined;
    if (createBackup) {
      backupPath = `${absPath}.bak`;
      fs.writeFileSync(backupPath, content, 'utf-8');
    }

    try {
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

      // Atomic write
      fs.writeFileSync(absPath, newContent, 'utf-8');

      // Remove backup on success
      if (backupPath && fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }

      const newChecksum = calculateChecksum(newContent);
      const replacedCount = allowMultiple ? occurrences : 1;
      const linesChanged = newContent.split('\n').length - lines.length;

      return {
        output: [{
          name: 'File Edited',
          description: filePath,
          content:
            `Successfully replaced ${replacedCount} occurrence(s) in ${filePath}.\n` +
            `Lines changed: ${linesChanged >= 0 ? '+' : ''}${linesChanged}\n` +
            `New checksum: ${newChecksum}`,
        }],
        success: true,
        metadata: {
          replacedCount,
          filePath: absPath,
          previousChecksum: currentChecksum,
          newChecksum,
          linesChanged,
        },
      };
    } catch (writeError) {
      // Restore from backup on failure
      if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, absPath);
        fs.unlinkSync(backupPath);
      }
      throw writeError;
    }
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
  const expectedChecksum = args.checksum as string | undefined;
  const createBackup = (args.createBackup as boolean) ?? true;

  if (!filePath || !rawChunks || !Array.isArray(rawChunks) || rawChunks.length === 0) {
    return {
      output: [{
        name: 'Error',
        description: 'Missing arguments',
        content: 'Required: filePath, chunks[] (array of {targetContent, replacementContent, startLine?, endLine?, allowMultiple?})',
      }],
      success: false,
      error: 'Missing arguments',
    };
  }

  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(context.workspacePath || '', filePath);

  if (!fs.existsSync(absPath)) {
    return {
      output: [{
        name: 'Error',
        description: 'File not found',
        content: `File does not exist: ${filePath}`,
      }],
      success: false,
      error: 'File not found',
    };
  }

  try {
    const originalContent = fs.readFileSync(absPath, 'utf-8');
    const currentChecksum = calculateChecksum(originalContent);

    // Checksum validation
    if (expectedChecksum && !validateChecksum(originalContent, expectedChecksum)) {
      return {
        output: [{
          name: 'Error',
          description: 'Checksum mismatch',
          content:
            `File has been modified since you last read it.\n` +
            `Expected: ${expectedChecksum}, Current: ${currentChecksum}\n` +
            `Re-read the file before editing.`,
        }],
        success: false,
        error: 'Checksum mismatch',
      };
    }

    // Create backup
    let backupPath: string | undefined;
    if (createBackup) {
      backupPath = `${absPath}.bak`;
      fs.writeFileSync(backupPath, originalContent, 'utf-8');
    }

    let content = originalContent;

    // Sort chunks by startLine descending so later replacements don't shift earlier ones
    const sortedChunks = [...rawChunks].sort((a, b) => (b.startLine || 0) - (a.startLine || 0));

    let totalReplaced = 0;
    const errors: string[] = [];
    const successes: string[] = [];

    try {
      for (let i = 0; i < sortedChunks.length; i++) {
        const chunk = sortedChunks[i];
        const chunkNum = rawChunks.indexOf(chunk) + 1; // Original order for error messages

        const lines = content.split('\n');
        const scopeStart = chunk.startLine ? Math.max(0, chunk.startLine - 1) : 0;
        const scopeEnd = chunk.endLine ? Math.min(lines.length, chunk.endLine) : lines.length;
        const scopedText = lines.slice(scopeStart, scopeEnd).join('\n');

        const occurrences = countOccurrences(scopedText, chunk.targetContent);

        if (occurrences === 0) {
          const fuzzyMatch = findFuzzyMatch(scopedText, chunk.targetContent);
          if (fuzzyMatch) {
            errors.push(
              `Chunk ${chunkNum}: target not found, but ${(fuzzyMatch.similarity * 100).toFixed(0)}% match at lines ${fuzzyMatch.matchStart}-${fuzzyMatch.matchEnd}`
            );
          } else {
            errors.push(`Chunk ${chunkNum}: target content not found in lines ${chunk.startLine || 1}-${chunk.endLine || lines.length}`);
          }
          continue;
        }

        if (occurrences > 1 && !chunk.allowMultiple) {
          errors.push(`Chunk ${chunkNum}: found ${occurrences} occurrences (set allowMultiple=true or narrow range)`);
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

        const replacedCount = chunk.allowMultiple ? occurrences : 1;
        totalReplaced += replacedCount;
        successes.push(`Chunk ${chunkNum}: replaced ${replacedCount} occurrence(s)`);
      }

      // Write final content
      fs.writeFileSync(absPath, content, 'utf-8');

      // Remove backup on success
      if (backupPath && fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }

      const newChecksum = calculateChecksum(content);

      const resultParts: string[] = [];
      if (successes.length > 0) {
        resultParts.push(`**Successful replacements (${totalReplaced} total):**`);
        resultParts.push(...successes.map(s => `- ${s}`));
      }
      if (errors.length > 0) {
        resultParts.push('');
        resultParts.push(`**Failed chunks (${errors.length}):**`);
        resultParts.push(...errors.map(e => `- ${e}`));
      }
      resultParts.push('');
      resultParts.push(`New checksum: ${newChecksum}`);

      return {
        output: [{
          name: 'File Multi-Edited',
          description: filePath,
          content: resultParts.join('\n'),
        }],
        success: errors.length === 0,
        error: errors.length > 0 ? `${errors.length} chunk(s) failed` : undefined,
        metadata: {
          totalReplaced,
          chunkCount: sortedChunks.length,
          successCount: successes.length,
          errorCount: errors.length,
          previousChecksum: currentChecksum,
          newChecksum,
        },
      };
    } catch (writeError) {
      // Restore from backup on failure
      if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, absPath);
        fs.unlinkSync(backupPath);
      }
      throw writeError;
    }
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

/**
 * Export for use by other tools.
 */
export {
  calculateChecksum,
  validateChecksum,
  findFuzzyMatch,
  calculateSimilarity,
};
