/**
 * Tool Definitions Index — Antigravity-Level
 *
 * Exports all tool definitions for registration.
 */

// File tools
export {
  readFileDefinition,
  readFileTool,
  writeFileDefinition,
  writeFileTool,
  createFileDefinition,
  createFileTool,
  deleteFileDefinition,
  deleteFileTool,
  listDirectoryDefinition,
  listDirectoryTool,
  searchInFilesDefinition,
  searchInFilesTool,
  grepSearchDefinition,
  grepSearchTool,
  globSearchDefinition,
  globSearchTool,
} from './fileTools';

// Surgical edit tools
export {
  replaceFileContentDefinition,
  replaceFileContentTool,
  multiReplaceFileContentDefinition,
  multiReplaceFileContentTool,
} from './editTools';

// Agent tools
export {
  updateTaskProgressDefinition,
  updateTaskProgressTool,
  createArtifactDefinition,
  createArtifactTool,
  taskBoundaryDefinition,
  taskBoundaryTool,
  notifyUserDefinition,
  notifyUserTool,
} from './agentTools';

// Web tools
export {
  webSearchDefinition,
  webSearchTool,
  fetchUrlDefinition,
  fetchUrlTool,
} from './webTools';

// Terminal tools
export {
  runTerminalCommandDefinition,
  runTerminalCommandTool,
  startTerminalCommandDefinition,
  startTerminalCommandTool,
  getCommandStatusDefinition,
  getCommandStatusTool,
  sendCommandInputDefinition,
  sendCommandInputTool,
} from './terminalTools';

// AST Tools
export {
  astFindDefinitionDef,
  astFindDefinitionTool,
  astDocumentSymbolsDef,
  astDocumentSymbolsTool,
  astGlobalSearchDef,
  astGlobalSearchTool,
} from './astTools';

// ==========================================================================
// All tool definitions map
// ==========================================================================

import { readFileTool, writeFileTool, createFileTool, deleteFileTool, listDirectoryTool, searchInFilesTool, grepSearchTool, globSearchTool } from './fileTools';
import { replaceFileContentTool, multiReplaceFileContentTool } from './editTools';
import { updateTaskProgressTool, createArtifactTool, taskBoundaryTool, notifyUserTool } from './agentTools';
import { webSearchTool, fetchUrlTool } from './webTools';
import { runTerminalCommandTool, startTerminalCommandTool, getCommandStatusTool, sendCommandInputTool } from './terminalTools';
import { astFindDefinitionTool, astDocumentSymbolsTool, astGlobalSearchTool } from './astTools';

export const ALL_TOOL_DEFINITIONS = {
  // File operations
  readFile: readFileTool,
  writeFile: writeFileTool,
  createFile: createFileTool,
  deleteFile: deleteFileTool,
  listDirectory: listDirectoryTool,

  // Surgical edits
  replaceFileContent: replaceFileContentTool,
  multiReplaceFileContent: multiReplaceFileContentTool,

  // Search
  searchInFiles: searchInFilesTool,
  grepSearch: grepSearchTool,
  globSearch: globSearchTool,

  // Web
  webSearch: webSearchTool,
  fetchUrl: fetchUrlTool,

  // Terminal
  runTerminalCommand: runTerminalCommandTool,
  startTerminalCommand: startTerminalCommandTool,
  getCommandStatus: getCommandStatusTool,
  sendCommandInput: sendCommandInputTool,

  // Agent
  updateTaskProgress: updateTaskProgressTool,
  createArtifact: createArtifactTool,
  taskBoundary: taskBoundaryTool,
  notifyUser: notifyUserTool,

  // AST Tools
  astFindDefinition: astFindDefinitionTool,
  astDocumentSymbols: astDocumentSymbolsTool,
  astGlobalSearch: astGlobalSearchTool,
};

export type ToolName = keyof typeof ALL_TOOL_DEFINITIONS;
