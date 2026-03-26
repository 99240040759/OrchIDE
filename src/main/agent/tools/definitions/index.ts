/**
 * Tool Definitions Index
 * 
 * Exports all tool definitions for easy import.
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

// Agent tools
export {
  updateTaskProgressDefinition,
  updateTaskProgressTool,
  createArtifactDefinition,
  createArtifactTool,
  reportFileChangedDefinition,
  reportFileChangedTool,
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
} from './terminalTools';

// All tool definitions for quick access
import { readFileTool, writeFileTool, createFileTool, deleteFileTool, listDirectoryTool, searchInFilesTool, grepSearchTool, globSearchTool } from './fileTools';
import { updateTaskProgressTool, createArtifactTool, reportFileChangedTool } from './agentTools';
import { webSearchTool, fetchUrlTool } from './webTools';
import { runTerminalCommandTool } from './terminalTools';

export const ALL_TOOL_DEFINITIONS = {
  // File operations
  readFile: readFileTool,
  writeFile: writeFileTool,
  createFile: createFileTool,
  deleteFile: deleteFileTool,
  listDirectory: listDirectoryTool,
  
  // Search
  searchInFiles: searchInFilesTool,
  grepSearch: grepSearchTool,
  globSearch: globSearchTool,
  
  // Web
  webSearch: webSearchTool,
  fetchUrl: fetchUrlTool,
  
  // Terminal
  runTerminalCommand: runTerminalCommandTool,
  
  // Agent
  updateTaskProgress: updateTaskProgressTool,
  createArtifact: createArtifactTool,
  reportFileChanged: reportFileChangedTool,
};

export type ToolName = keyof typeof ALL_TOOL_DEFINITIONS;
