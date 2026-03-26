/**
 * Surgical File Edit Tool Definitions
 *
 * replaceFileContent  — single contiguous block replacement with line targeting
 * multiReplaceFileContent — multiple non-contiguous replacements in one call
 */

import type { Tool } from '../types';
import { createToolDefinition } from '../registry';

// ============================================================================
// Replace File Content (single block)
// ============================================================================

export const replaceFileContentDefinition: Tool['definition'] = createToolDefinition(
  'replaceFileContent',
  `Surgically edit an existing file by replacing a single contiguous block of text.
You specify StartLine/EndLine to scope where the target content lives, then provide
the exact TargetContent string and its ReplacementContent. The tool reads the file,
finds TargetContent within the [StartLine, EndLine] range, and replaces it.

RULES:
- TargetContent MUST exactly match text in the file (including whitespace/indentation).
- If multiple occurrences exist and AllowMultiple is false, the tool errors.
- Use this tool for SINGLE contiguous edits. For multiple separate edits, use multiReplaceFileContent.
- NEVER use writeFile to edit existing files — always prefer this surgical tool.`,
  {
    required: ['filePath', 'targetContent', 'replacementContent'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file to edit (relative to workspace root)',
      },
      startLine: {
        type: 'integer',
        description: 'Starting line number (1-indexed) to scope the search. Helps disambiguate when targetContent appears in multiple places.',
      },
      endLine: {
        type: 'integer',
        description: 'Ending line number (1-indexed, inclusive) to scope the search.',
      },
      targetContent: {
        type: 'string',
        description: 'The exact string to find and replace. Must match character-for-character including whitespace.',
      },
      replacementContent: {
        type: 'string',
        description: 'The replacement string. This is a drop-in replacement for targetContent.',
      },
      allowMultiple: {
        type: 'boolean',
        description: 'If true, replace ALL occurrences of targetContent in the range. Default: false.',
      },
    },
  }
);

export const replaceFileContentTool: Omit<Tool, 'execute'> = {
  definition: replaceFileContentDefinition,
  display: {
    displayTitle: 'Edit File',
    wouldLikeTo: 'edit {{{ filePath }}}',
    isCurrently: 'editing {{{ filePath }}}',
    hasAlready: 'edited {{{ filePath }}}',
    icon: 'pencil-line',
    group: 'file-operations',
  },
  behavior: {
    readonly: false,
    isInstant: true,
    defaultPolicy: 'allowedWithPermission',
    allowsParallel: false,
  },
};

// ============================================================================
// Multi Replace File Content (multiple non-contiguous blocks)
// ============================================================================

export const multiReplaceFileContentDefinition: Tool['definition'] = {
  type: 'function',
  function: {
    name: 'multiReplaceFileContent',
    description: `Edit an existing file with MULTIPLE non-contiguous replacements in a single call.
Each replacement chunk specifies a StartLine/EndLine range, a TargetContent to find, and its ReplacementContent.
Chunks are applied in reverse line order to avoid offset corruption.

RULES:
- Use this ONLY for multiple separate edits in one file. For a single edit, use replaceFileContent.
- Each chunk's TargetContent must exactly match file content (including whitespace).
- DO NOT use this tool and replaceFileContent on the same file in parallel.`,
    parameters: {
      type: 'object',
      required: ['filePath', 'chunks'],
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file to edit (relative to workspace root)',
        },
        chunks: {
          type: 'array',
          description: 'Array of replacement chunks, each with startLine, endLine, targetContent, replacementContent',
          items: {
            type: 'object',
            description: 'A single replacement chunk',
          },
        },
      },
    },
  },
};

export const multiReplaceFileContentTool: Omit<Tool, 'execute'> = {
  definition: multiReplaceFileContentDefinition,
  display: {
    displayTitle: 'Multi-Edit File',
    wouldLikeTo: 'make multiple edits to {{{ filePath }}}',
    isCurrently: 'editing {{{ filePath }}} (multiple changes)',
    hasAlready: 'made multiple edits to {{{ filePath }}}',
    icon: 'pencil-ruler',
    group: 'file-operations',
  },
  behavior: {
    readonly: false,
    isInstant: true,
    defaultPolicy: 'allowedWithPermission',
    allowsParallel: false,
  },
};
