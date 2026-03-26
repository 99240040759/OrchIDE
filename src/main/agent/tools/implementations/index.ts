/**
 * Tool Implementations Index
 * 
 * Central registration of all tool implementations.
 */

import type { Tool } from '../types';
import { ALL_TOOL_DEFINITIONS } from '../definitions';

// Import implementations
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

import {
  updateTaskProgressImpl,
  createArtifactImpl,
  reportFileChangedImpl,
} from './agentTools';

import {
  webSearchImpl,
  fetchUrlImpl,
} from './webTools';

import {
  runTerminalCommandImpl,
} from './terminalTools';

// ============================================================================
// Complete Tool Registry
// ============================================================================

/**
 * All tools with their definitions and implementations combined.
 */
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
  
  // Agent
  updateTaskProgress: {
    ...ALL_TOOL_DEFINITIONS.updateTaskProgress,
    execute: updateTaskProgressImpl,
  },
  createArtifact: {
    ...ALL_TOOL_DEFINITIONS.createArtifact,
    execute: createArtifactImpl,
  },
  reportFileChanged: {
    ...ALL_TOOL_DEFINITIONS.reportFileChanged,
    execute: reportFileChangedImpl,
  },
};

/**
 * Get tool names grouped by category
 */
export const TOOL_GROUPS = {
  file: ['readFile', 'writeFile', 'createFile', 'deleteFile', 'listDirectory'],
  search: ['searchInFiles', 'grepSearch', 'globSearch'],
  web: ['webSearch', 'fetchUrl'],
  terminal: ['runTerminalCommand'],
  agent: ['updateTaskProgress', 'createArtifact', 'reportFileChanged'],
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
      ];
    case 'implementation':
      return Object.values(ALL_TOOLS);
    default:
      return Object.values(ALL_TOOLS);
  }
}
