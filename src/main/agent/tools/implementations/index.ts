/**
 * Tool Implementations Index — Antigravity-Level
 *
 * Central registration of all 21 tool implementations.
 */

import type { Tool } from '../types';
import { ALL_TOOL_DEFINITIONS } from '../definitions';

// File tools
import {
  readFileImpl,
  writeFileImpl,
  createFileImpl,
  deleteFileImpl,
  listDirectoryImpl,
  searchInFilesImpl,
  grepSearchImpl,
  globSearchImpl,
} from './fileTools';

// Surgical edit tools
import {
  replaceFileContentImpl,
  multiReplaceFileContentImpl,
} from './editTools';

// Agent tools
import {
  updateTaskProgressImpl,
  createArtifactImpl,
  taskBoundaryImpl,
  notifyUserImpl,
} from './agentTools';

// Web tools
import {
  webSearchImpl,
  fetchUrlImpl,
} from './webTools';

// Terminal tools
import {
  runTerminalCommandImpl,
  startTerminalCommandImpl,
  getCommandStatusImpl,
  sendCommandInputImpl,
} from './terminalTools';

// AST Tools
import {
  astFindDefinitionImpl,
  astDocumentSymbolsImpl,
  astGlobalSearchImpl,
} from './astTools';

// ============================================================================
// Complete Tool Registry
// ============================================================================

export const ALL_TOOLS: Record<string, Tool> = {
  // File operations
  readFile: {
    ...ALL_TOOL_DEFINITIONS.readFile,
    execute: readFileImpl,
  },
  writeFile: {
    ...ALL_TOOL_DEFINITIONS.writeFile,
    execute: writeFileImpl,
  },
  createFile: {
    ...ALL_TOOL_DEFINITIONS.createFile,
    execute: createFileImpl,
  },
  deleteFile: {
    ...ALL_TOOL_DEFINITIONS.deleteFile,
    execute: deleteFileImpl,
  },
  listDirectory: {
    ...ALL_TOOL_DEFINITIONS.listDirectory,
    execute: listDirectoryImpl,
  },

  // Surgical edits
  replaceFileContent: {
    ...ALL_TOOL_DEFINITIONS.replaceFileContent,
    execute: replaceFileContentImpl,
  },
  multiReplaceFileContent: {
    ...ALL_TOOL_DEFINITIONS.multiReplaceFileContent,
    execute: multiReplaceFileContentImpl,
  },

  // Search
  searchInFiles: {
    ...ALL_TOOL_DEFINITIONS.searchInFiles,
    execute: searchInFilesImpl,
  },
  grepSearch: {
    ...ALL_TOOL_DEFINITIONS.grepSearch,
    execute: grepSearchImpl,
  },
  globSearch: {
    ...ALL_TOOL_DEFINITIONS.globSearch,
    execute: globSearchImpl,
  },

  // Web
  webSearch: {
    ...ALL_TOOL_DEFINITIONS.webSearch,
    execute: webSearchImpl,
  },
  fetchUrl: {
    ...ALL_TOOL_DEFINITIONS.fetchUrl,
    execute: fetchUrlImpl,
  },

  // Terminal
  runTerminalCommand: {
    ...ALL_TOOL_DEFINITIONS.runTerminalCommand,
    execute: runTerminalCommandImpl,
  },
  startTerminalCommand: {
    ...ALL_TOOL_DEFINITIONS.startTerminalCommand,
    execute: startTerminalCommandImpl,
  },
  getCommandStatus: {
    ...ALL_TOOL_DEFINITIONS.getCommandStatus,
    execute: getCommandStatusImpl,
  },
  sendCommandInput: {
    ...ALL_TOOL_DEFINITIONS.sendCommandInput,
    execute: sendCommandInputImpl,
  },

  // Agent
  updateTaskProgress: {
    ...ALL_TOOL_DEFINITIONS.updateTaskProgress,
    execute: updateTaskProgressImpl,
  },
  createArtifact: {
    ...ALL_TOOL_DEFINITIONS.createArtifact,
    execute: createArtifactImpl,
  },
  taskBoundary: {
    ...ALL_TOOL_DEFINITIONS.taskBoundary,
    execute: taskBoundaryImpl,
  },
  notifyUser: {
    ...ALL_TOOL_DEFINITIONS.notifyUser,
    execute: notifyUserImpl,
  },

  // AST Tools
  astFindDefinition: {
    ...ALL_TOOL_DEFINITIONS.astFindDefinition,
    execute: astFindDefinitionImpl,
  },
  astDocumentSymbols: {
    ...ALL_TOOL_DEFINITIONS.astDocumentSymbols,
    execute: astDocumentSymbolsImpl,
  },
  astGlobalSearch: {
    ...ALL_TOOL_DEFINITIONS.astGlobalSearch,
    execute: astGlobalSearchImpl,
  },
};

/**
 * Tool groups for UI organization
 */
export const TOOL_GROUPS = {
  file: ['readFile', 'writeFile', 'createFile', 'deleteFile', 'listDirectory', 'replaceFileContent', 'multiReplaceFileContent'],
  search: ['searchInFiles', 'grepSearch', 'globSearch'],
  web: ['webSearch', 'fetchUrl'],
  terminal: ['runTerminalCommand', 'startTerminalCommand', 'getCommandStatus', 'sendCommandInput'],
  agent: ['updateTaskProgress', 'createArtifact', 'taskBoundary', 'notifyUser'],
  ast: ['astFindDefinition', 'astDocumentSymbols', 'astGlobalSearch'],
} as const;

/**
 * Get OpenAI-compatible tool definitions for LLM
 */
export function getToolDefinitionsForLLM(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return Object.values(ALL_TOOLS).map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.definition.function.name,
      description: tool.definition.function.description,
      parameters: tool.definition.function.parameters as unknown as Record<string, unknown>,
    },
  }));
}

/**
 * Get a subset of tools for specific purposes
 */
export function getToolsForPurpose(purpose: 'planning' | 'implementation' | 'research'): Tool[] {
  switch (purpose) {
    case 'planning':
      return [
        ALL_TOOLS.listDirectory,
        ALL_TOOLS.readFile,
        ALL_TOOLS.searchInFiles,
        ALL_TOOLS.globSearch,
        ALL_TOOLS.taskBoundary,
        ALL_TOOLS.notifyUser,
        ALL_TOOLS.updateTaskProgress,
        ALL_TOOLS.astDocumentSymbols,
        ALL_TOOLS.astGlobalSearch,
      ];
    case 'research':
      return [
        ALL_TOOLS.readFile,
        ALL_TOOLS.listDirectory,
        ALL_TOOLS.searchInFiles,
        ALL_TOOLS.grepSearch,
        ALL_TOOLS.globSearch,
        ALL_TOOLS.webSearch,
        ALL_TOOLS.fetchUrl,
        ALL_TOOLS.taskBoundary,
        ALL_TOOLS.astFindDefinition,
        ALL_TOOLS.astDocumentSymbols,
        ALL_TOOLS.astGlobalSearch,
      ];
    case 'implementation':
      return Object.values(ALL_TOOLS);
    default:
      return Object.values(ALL_TOOLS);
  }
}
