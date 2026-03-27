/**
 * Intelligent Truncation System
 *
 * Implements head+tail truncation for tool results and context compaction.
 * Preserves the most useful parts of large outputs:
 * - HEAD: First N lines (headers, context, imports)
 * - TAIL: Last M lines (errors, exit codes, results)
 * - MIDDLE: Dropped with clear marker
 *
 * This is critical for preventing context window overflow while
 * maintaining the most diagnostic-relevant content.
 */

// ============================================================================
// Configuration
// ============================================================================

export interface TruncationConfig {
  /** Maximum total characters before truncation kicks in */
  maxChars: number;
  /** Number of lines to keep from the start */
  headLines: number;
  /** Number of lines to keep from the end */
  tailLines: number;
  /** Marker to insert where content was removed */
  truncationMarker: string;
  /** Whether to prefer keeping error-like lines */
  prioritizeErrors: boolean;
}

export const DEFAULT_TRUNCATION_CONFIG: TruncationConfig = {
  maxChars: 8000,
  headLines: 50,
  tailLines: 100,
  truncationMarker: '\n\n... [TRUNCATED {count} LINES — showing first {head} and last {tail} lines] ...\n\n',
  prioritizeErrors: true,
};

/** Config specifically for tool results (more aggressive) */
export const TOOL_RESULT_TRUNCATION_CONFIG: TruncationConfig = {
  maxChars: 4000,
  headLines: 30,
  tailLines: 70,
  truncationMarker: '\n\n[... TRUNCATED {count} LINES ...]\n\n',
  prioritizeErrors: true,
};

/** Config for terminal output (preserve more tail for errors) */
export const TERMINAL_TRUNCATION_CONFIG: TruncationConfig = {
  maxChars: 6000,
  headLines: 20,
  tailLines: 120,
  truncationMarker: '\n[... {count} lines omitted ...]\n',
  prioritizeErrors: true,
};

/** Config for file content (balanced) */
export const FILE_CONTENT_TRUNCATION_CONFIG: TruncationConfig = {
  maxChars: 10000,
  headLines: 80,
  tailLines: 80,
  truncationMarker: '\n\n// ... [{count} lines truncated] ...\n\n',
  prioritizeErrors: false,
};

// ============================================================================
// Core Truncation Functions
// ============================================================================

/**
 * Truncate text using head+tail strategy.
 * Returns original text if under maxChars threshold.
 */
export function truncateHeadTail(
  text: string,
  config: Partial<TruncationConfig> = {}
): string {
  const cfg = { ...DEFAULT_TRUNCATION_CONFIG, ...config };

  // Fast path: no truncation needed
  if (text.length <= cfg.maxChars) {
    return text;
  }

  const lines = text.split('\n');

  // If total lines fit within head+tail, no truncation needed
  if (lines.length <= cfg.headLines + cfg.tailLines) {
    return text;
  }

  // Extract head and tail
  const headPart = lines.slice(0, cfg.headLines);
  const tailPart = lines.slice(-cfg.tailLines);
  const droppedCount = lines.length - cfg.headLines - cfg.tailLines;

  // Build truncation marker
  const marker = cfg.truncationMarker
    .replace('{count}', String(droppedCount))
    .replace('{head}', String(cfg.headLines))
    .replace('{tail}', String(cfg.tailLines));

  // If prioritizing errors, check if there are error-like lines in the middle
  // that we should preserve instead of generic tail content
  if (cfg.prioritizeErrors) {
    const middleLines = lines.slice(cfg.headLines, -cfg.tailLines);
    const errorLines = extractErrorLines(middleLines);

    if (errorLines.length > 0) {
      // Include up to 20 error lines in the output
      const errorSection = errorLines.slice(0, 20).join('\n');
      return [
        ...headPart,
        marker,
        '// === Important error lines from middle section ===',
        errorSection,
        '// === End of middle section errors ===',
        '',
        ...tailPart,
      ].join('\n');
    }
  }

  return [...headPart, marker, ...tailPart].join('\n');
}

/**
 * Truncate tool result output.
 * Uses more aggressive settings suitable for tool results.
 */
export function truncateToolResult(output: string): string {
  return truncateHeadTail(output, TOOL_RESULT_TRUNCATION_CONFIG);
}

/**
 * Truncate terminal command output.
 * Preserves more tail content (where errors usually appear).
 */
export function truncateTerminalOutput(output: string): string {
  return truncateHeadTail(output, TERMINAL_TRUNCATION_CONFIG);
}

/**
 * Truncate file content for display.
 * Balanced head/tail, doesn't prioritize errors.
 */
export function truncateFileContent(content: string): string {
  return truncateHeadTail(content, FILE_CONTENT_TRUNCATION_CONFIG);
}

// ============================================================================
// Smart Truncation for Context Messages
// ============================================================================

export interface MessageTruncationResult {
  content: string;
  wasTruncated: boolean;
  originalLength: number;
  finalLength: number;
  linesDropped: number;
}

/**
 * Truncate a message with detailed reporting.
 * Used for context compaction where we need to track what was removed.
 */
export function truncateWithReport(
  text: string,
  config: Partial<TruncationConfig> = {}
): MessageTruncationResult {
  const originalLength = text.length;
  const originalLines = text.split('\n').length;

  const truncated = truncateHeadTail(text, config);
  const finalLines = truncated.split('\n').length;

  // Calculate actual lines dropped (accounting for marker lines)
  const markerLineCount = 3; // Approximate lines added by marker
  const linesDropped = Math.max(0, originalLines - finalLines + markerLineCount);

  return {
    content: truncated,
    wasTruncated: truncated !== text,
    originalLength,
    finalLength: truncated.length,
    linesDropped,
  };
}

// ============================================================================
// Batch Truncation for Multiple Items
// ============================================================================

export interface BatchTruncationOptions {
  /** Total character budget for all items */
  totalBudget: number;
  /** Minimum characters to allocate per item */
  minPerItem: number;
  /** Items at the end of the array get priority (most recent) */
  prioritizeRecent: boolean;
}

/**
 * Truncate multiple text items to fit within a total budget.
 * Used for compacting conversation history.
 */
export function truncateBatch(
  items: string[],
  options: BatchTruncationOptions
): string[] {
  const { totalBudget, minPerItem, prioritizeRecent } = options;

  // Calculate current total
  const currentTotal = items.reduce((sum, item) => sum + item.length, 0);

  // If within budget, no truncation needed
  if (currentTotal <= totalBudget) {
    return items;
  }

  // Calculate budget per item
  // If prioritizing recent, give more budget to later items
  const result: string[] = [];
  let remainingBudget = totalBudget;

  // Process in reverse if prioritizing recent (so recent items get first pick)
  const indices = prioritizeRecent
    ? Array.from({ length: items.length }, (_, i) => items.length - 1 - i)
    : Array.from({ length: items.length }, (_, i) => i);

  const budgets = new Map<number, number>();

  for (const idx of indices) {
    const item = items[idx];
    const itemsRemaining = items.length - budgets.size;

    // Calculate fair share of remaining budget
    const fairShare = Math.floor(remainingBudget / itemsRemaining);
    const itemBudget = Math.max(minPerItem, Math.min(item.length, fairShare));

    budgets.set(idx, itemBudget);
    remainingBudget -= itemBudget;
  }

  // Apply truncation based on calculated budgets
  for (let i = 0; i < items.length; i++) {
    const budget = budgets.get(i) || minPerItem;
    const item = items[i];

    if (item.length <= budget) {
      result.push(item);
    } else {
      result.push(truncateHeadTail(item, { maxChars: budget }));
    }
  }

  return result;
}

// ============================================================================
// JSON-Aware Truncation
// ============================================================================

/**
 * Truncate JSON output while preserving structure validity.
 * Attempts to keep the JSON parseable after truncation.
 */
export function truncateJSON(jsonStr: string, maxChars: number = 4000): string {
  if (jsonStr.length <= maxChars) {
    return jsonStr;
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // If it's an array, truncate the array
    if (Array.isArray(parsed)) {
      return truncateJSONArray(parsed, maxChars);
    }

    // If it's an object, truncate deeply nested values
    if (typeof parsed === 'object' && parsed !== null) {
      return truncateJSONObject(parsed, maxChars);
    }

    // Primitive: just truncate the string representation
    return jsonStr.slice(0, maxChars) + '... [TRUNCATED]';
  } catch {
    // Not valid JSON, fall back to text truncation
    return truncateHeadTail(jsonStr, { maxChars });
  }
}

function truncateJSONArray(arr: unknown[], maxChars: number): string {
  const fullStr = JSON.stringify(arr, null, 2);
  if (fullStr.length <= maxChars) {
    return fullStr;
  }

  // Binary search for max items that fit
  let lo = 0;
  let hi = arr.length;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const slice = arr.slice(0, mid);
    const testStr = JSON.stringify(slice, null, 2);

    if (testStr.length <= maxChars - 50) {
      // Leave room for truncation message
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const truncatedArr = arr.slice(0, lo);
  const result = JSON.stringify(truncatedArr, null, 2);
  const dropped = arr.length - lo;

  return result.slice(0, -1) + `,\n  "... ${dropped} more items truncated ..."\n]`;
}

function truncateJSONObject(obj: Record<string, unknown>, maxChars: number): string {
  const fullStr = JSON.stringify(obj, null, 2);
  if (fullStr.length <= maxChars) {
    return fullStr;
  }

  // Truncate large string values
  const truncated: Record<string, unknown> = {};
  const keys = Object.keys(obj);

  for (const key of keys) {
    const value = obj[key];

    if (typeof value === 'string' && value.length > 500) {
      truncated[key] = value.slice(0, 500) + '... [truncated]';
    } else if (Array.isArray(value) && value.length > 10) {
      truncated[key] = [...value.slice(0, 10), `... ${value.length - 10} more items`];
    } else if (typeof value === 'object' && value !== null) {
      const nested = JSON.stringify(value);
      if (nested.length > 1000) {
        truncated[key] = '[nested object truncated]';
      } else {
        truncated[key] = value;
      }
    } else {
      truncated[key] = value;
    }
  }

  const result = JSON.stringify(truncated, null, 2);

  // If still too long, do aggressive truncation
  if (result.length > maxChars) {
    return result.slice(0, maxChars - 30) + '\n... [TRUNCATED]"}';
  }

  return result;
}

// ============================================================================
// Error Line Extraction
// ============================================================================

/** Patterns that indicate error/important lines */
const ERROR_PATTERNS = [
  /error[:\s]/i,
  /exception[:\s]/i,
  /failed[:\s]/i,
  /failure[:\s]/i,
  /fatal[:\s]/i,
  /panic[:\s]/i,
  /warning[:\s]/i,
  /warn[:\s]/i,
  /cannot\s/i,
  /could not\s/i,
  /unable to\s/i,
  /not found/i,
  /no such/i,
  /permission denied/i,
  /access denied/i,
  /traceback/i,
  /stack trace/i,
  /at\s+\S+:\d+:\d+/i, // Stack trace line
  /^\s*at\s+/i, // Stack trace continuation
  /\^\s*$/i, // Caret pointing to error location
  /~~~+/i, // Rust-style error underline
  /ENOENT|EACCES|EPERM|EEXIST/i, // Node.js error codes
  /segmentation fault/i,
  /null pointer/i,
  /undefined is not/i,
  /typeerror/i,
  /syntaxerror/i,
  /referenceerror/i,
];

/**
 * Extract lines that look like errors or important diagnostic info.
 */
function extractErrorLines(lines: string[]): string[] {
  const errorLines: string[] = [];
  let inStackTrace = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line matches error patterns
    const isError = ERROR_PATTERNS.some((pattern) => pattern.test(line));

    // Track if we're in a stack trace
    if (/^\s*at\s+/.test(line) || /traceback/i.test(line)) {
      inStackTrace = true;
    } else if (line.trim() === '' && inStackTrace) {
      inStackTrace = false;
    }

    if (isError || inStackTrace) {
      errorLines.push(line);

      // Also include a few lines of context after an error
      if (isError && !inStackTrace) {
        for (let j = 1; j <= 3 && i + j < lines.length; j++) {
          const contextLine = lines[i + j];
          if (contextLine.trim()) {
            errorLines.push(contextLine);
          }
        }
      }
    }
  }

  return errorLines;
}

// ============================================================================
// Diff-Aware Truncation
// ============================================================================

/**
 * Truncate a git diff while preserving hunk structure.
 * Keeps file headers and hunk markers intact.
 */
export function truncateDiff(diff: string, maxChars: number = 6000): string {
  if (diff.length <= maxChars) {
    return diff;
  }

  const lines = diff.split('\n');
  const result: string[] = [];
  let currentSize = 0;
  let droppedHunks = 0;
  let inHunk = false;
  let hunkLines: string[] = [];

  for (const line of lines) {
    // Always keep file headers
    if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++')) {
      if (hunkLines.length > 0) {
        // Flush previous hunk if it fits
        const hunkSize = hunkLines.join('\n').length;
        if (currentSize + hunkSize < maxChars - 200) {
          result.push(...hunkLines);
          currentSize += hunkSize;
        } else {
          droppedHunks++;
        }
        hunkLines = [];
      }
      result.push(line);
      currentSize += line.length + 1;
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      if (hunkLines.length > 0) {
        const hunkSize = hunkLines.join('\n').length;
        if (currentSize + hunkSize < maxChars - 200) {
          result.push(...hunkLines);
          currentSize += hunkSize;
        } else {
          droppedHunks++;
        }
      }
      hunkLines = [line];
      inHunk = true;
      continue;
    }

    // Hunk content
    if (inHunk) {
      hunkLines.push(line);
    }
  }

  // Flush final hunk
  if (hunkLines.length > 0) {
    const hunkSize = hunkLines.join('\n').length;
    if (currentSize + hunkSize < maxChars) {
      result.push(...hunkLines);
    } else {
      droppedHunks++;
    }
  }

  if (droppedHunks > 0) {
    result.push(`\n[... ${droppedHunks} diff hunk(s) truncated ...]`);
  }

  return result.join('\n');
}

// ============================================================================
// Exports Summary
// ============================================================================

export const truncation = {
  headTail: truncateHeadTail,
  toolResult: truncateToolResult,
  terminal: truncateTerminalOutput,
  file: truncateFileContent,
  withReport: truncateWithReport,
  batch: truncateBatch,
  json: truncateJSON,
  diff: truncateDiff,
};

export default truncation;
