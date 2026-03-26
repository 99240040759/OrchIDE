/**
 * File Tool Definitions
 * 
 * Tool definitions for file operations - read, write, create, delete, list.
 */

import type { Tool } from '../types';
import { createToolDefinition } from '../registry';

// ============================================================================
// Read File Tool
// ============================================================================

export const readFileDefinition: Tool['definition'] = createToolDefinition(
  'readFile',
  'Read the contents of a file in the workspace. Use relative paths from workspace root.',
  {
    required: ['filePath'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Relative path to the file from workspace root, e.g. "src/index.ts"',
      },
    },
  }
);

export const readFileTool: Omit<Tool, 'execute'> = {
  definition: readFileDefinition,
  display: {
    displayTitle: 'Read File',
    wouldLikeTo: 'read {{{ filePath }}}',
    isCurrently: 'reading {{{ filePath }}}',
    hasAlready: 'read {{{ filePath }}}',
    icon: 'file-text',
    group: 'file-operations',
  },
  behavior: {
    readonly: true,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};

// ============================================================================
// Write File Tool
// ============================================================================

export const writeFileDefinition: Tool['definition'] = createToolDefinition(
  'writeFile',
  'Write or overwrite content to a file in the workspace. Creates parent directories if needed.',
  {
    required: ['filePath', 'content'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Relative path to the file from workspace root',
      },
      content: {
        type: 'string',
        description: 'The full content to write to the file',
      },
    },
  }
);

export const writeFileTool: Omit<Tool, 'execute'> = {
  definition: writeFileDefinition,
  display: {
    displayTitle: 'Write File',
    wouldLikeTo: 'write to {{{ filePath }}}',
    isCurrently: 'writing to {{{ filePath }}}',
    hasAlready: 'wrote to {{{ filePath }}}',
    icon: 'pencil',
    group: 'file-operations',
  },
  behavior: {
    readonly: false,
    isInstant: true,
    defaultPolicy: 'allowedWithPermission',
    allowsParallel: false, // Write operations should be sequential
  },
};

// ============================================================================
// Create File Tool
// ============================================================================

export const createFileDefinition: Tool['definition'] = createToolDefinition(
  'createFile',
  'Create a new file with initial content in the workspace. Use relative paths only.',
  {
    required: ['filePath'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Relative path to the new file from workspace root',
      },
      content: {
        type: 'string',
        description: 'Initial content for the file (optional)',
        default: '',
      },
    },
  }
);

export const createFileTool: Omit<Tool, 'execute'> = {
  definition: createFileDefinition,
  display: {
    displayTitle: 'Create File',
    wouldLikeTo: 'create {{{ filePath }}}',
    isCurrently: 'creating {{{ filePath }}}',
    hasAlready: 'created {{{ filePath }}}',
    icon: 'file-plus',
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
// Delete File Tool
// ============================================================================

export const deleteFileDefinition: Tool['definition'] = createToolDefinition(
  'deleteFile',
  'Delete a file or directory from the workspace. Use relative paths only.',
  {
    required: ['targetPath'],
    properties: {
      targetPath: {
        type: 'string',
        description: 'Relative path from workspace root to delete',
      },
    },
  }
);

export const deleteFileTool: Omit<Tool, 'execute'> = {
  definition: deleteFileDefinition,
  display: {
    displayTitle: 'Delete File',
    wouldLikeTo: 'delete {{{ targetPath }}}',
    isCurrently: 'deleting {{{ targetPath }}}',
    hasAlready: 'deleted {{{ targetPath }}}',
    icon: 'trash',
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
// List Directory Tool
// ============================================================================

export const listDirectoryDefinition: Tool['definition'] = createToolDefinition(
  'listDirectory',
  'List files and directories at a given path within the workspace.',
  {
    properties: {
      dirPath: {
        type: 'string',
        description: 'Relative path to directory from workspace root. Use "." for root.',
        default: '.',
      },
    },
  }
);

export const listDirectoryTool: Omit<Tool, 'execute'> = {
  definition: listDirectoryDefinition,
  display: {
    displayTitle: 'List Directory',
    wouldLikeTo: 'list {{{ dirPath }}}',
    isCurrently: 'listing {{{ dirPath }}}',
    hasAlready: 'listed {{{ dirPath }}}',
    icon: 'folder-open',
    group: 'file-operations',
  },
  behavior: {
    readonly: true,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};

// ============================================================================
// Search in Files Tool
// ============================================================================

export const searchInFilesDefinition: Tool['definition'] = createToolDefinition(
  'searchInFiles',
  'Search for a text pattern across all files in the workspace. Returns matching lines with file paths.',
  {
    required: ['pattern'],
    properties: {
      pattern: {
        type: 'string',
        description: 'Text pattern or substring to search for',
      },
      fileExtensions: {
        type: 'array',
        description: 'Filter by extensions e.g. ["ts", "tsx"]',
        items: { type: 'string' },
      },
      dirPath: {
        type: 'string',
        description: 'Optional directory to scope the search, e.g. "src"',
        default: '.',
      },
      maxResults: {
        type: 'integer',
        description: 'Maximum number of matches to return',
        default: 100,
      },
    },
  }
);

export const searchInFilesTool: Omit<Tool, 'execute'> = {
  definition: searchInFilesDefinition,
  display: {
    displayTitle: 'Search Files',
    wouldLikeTo: 'search for "{{{ pattern }}}"',
    isCurrently: 'searching for "{{{ pattern }}}"',
    hasAlready: 'searched for "{{{ pattern }}}"',
    icon: 'search',
    group: 'search',
  },
  behavior: {
    readonly: true,
    isInstant: false,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
    timeoutMs: 30000,
  },
};

// ============================================================================
// Grep Search Tool
// ============================================================================

export const grepSearchDefinition: Tool['definition'] = createToolDefinition(
  'grepSearch',
  'Search for a regex pattern in files. Faster than searchInFiles for simple patterns.',
  {
    required: ['pattern'],
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for',
      },
      dirPath: {
        type: 'string',
        description: 'Directory to search in',
        default: '.',
      },
      include: {
        type: 'string',
        description: 'Glob pattern to include files, e.g. "*.ts"',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Whether the search is case sensitive',
        default: false,
      },
    },
  }
);

export const grepSearchTool: Omit<Tool, 'execute'> = {
  definition: grepSearchDefinition,
  display: {
    displayTitle: 'Grep Search',
    wouldLikeTo: 'grep for "{{{ pattern }}}"',
    isCurrently: 'grepping for "{{{ pattern }}}"',
    hasAlready: 'grepped for "{{{ pattern }}}"',
    icon: 'search-code',
    group: 'search',
  },
  behavior: {
    readonly: true,
    isInstant: false,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
    timeoutMs: 30000,
  },
};

// ============================================================================
// Glob Search Tool
// ============================================================================

export const globSearchDefinition: Tool['definition'] = createToolDefinition(
  'globSearch',
  'Find files matching a glob pattern.',
  {
    required: ['pattern'],
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files, e.g. "**/*.ts" or "src/**/*.tsx"',
      },
    },
  }
);

export const globSearchTool: Omit<Tool, 'execute'> = {
  definition: globSearchDefinition,
  display: {
    displayTitle: 'Find Files',
    wouldLikeTo: 'find files matching "{{{ pattern }}}"',
    isCurrently: 'finding files matching "{{{ pattern }}}"',
    hasAlready: 'found files matching "{{{ pattern }}}"',
    icon: 'files',
    group: 'search',
  },
  behavior: {
    readonly: true,
    isInstant: false,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
    timeoutMs: 15000,
  },
};
