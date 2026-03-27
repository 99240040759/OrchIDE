import type { Tool } from '../types';
import { createToolDefinition } from '../registry';

// ============================================================================
// Find Definition Tool
// ============================================================================

export const astFindDefinitionDef: Tool['definition'] = createToolDefinition(
  'astFindDefinition',
  'Instantly find the file and exact line number where a class, function, struct, or interface is defined across the workspace using the AST index.',
  {
    required: ['symbolName'],
    properties: {
      symbolName: {
        type: 'string',
        description: 'Exact name of the class, function, interface, or variable to locate (e.g. "AuthController")',
      },
    },
  }
);

export const astFindDefinitionTool: Omit<Tool, 'execute'> = {
  definition: astFindDefinitionDef,
  display: {
    displayTitle: 'Find Definition',
    wouldLikeTo: 'find definition of {{{ symbolName }}}',
    isCurrently: 'finding definition of {{{ symbolName }}}',
    hasAlready: 'found definition of {{{ symbolName }}}',
    icon: 'text-cursor',
    group: 'ast',
  },
  behavior: {
    readonly: true,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};

// ============================================================================
// Document Symbols Tool
// ============================================================================

export const astDocumentSymbolsDef: Tool['definition'] = createToolDefinition(
  'astDocumentSymbols',
  'Get a lightweight semantic outline (classes, functions, interfaces) of a specific file without reading its full contents.',
  {
    required: ['filePath'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Relative path to the file from workspace root',
      },
    },
  }
);

export const astDocumentSymbolsTool: Omit<Tool, 'execute'> = {
  definition: astDocumentSymbolsDef,
  display: {
    displayTitle: 'Document Symbols',
    wouldLikeTo: 'get outline of {{{ filePath }}}',
    isCurrently: 'getting outline of {{{ filePath }}}',
    hasAlready: 'got outline of {{{ filePath }}}',
    icon: 'list-tree',
    group: 'ast',
  },
  behavior: {
    readonly: true,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};

// ============================================================================
// Global Search Tool
// ============================================================================

export const astGlobalSearchDef: Tool['definition'] = createToolDefinition(
  'astGlobalSearch',
  'Perform a lightning fast prefix search for any symbol across the entire workspace using the AST database.',
  {
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: 'Partial or full name of the symbol to search for',
      },
      limit: {
        type: 'integer',
        description: 'Maximum results to return (default 20)',
        default: 20
      }
    },
  }
);

export const astGlobalSearchTool: Omit<Tool, 'execute'> = {
  definition: astGlobalSearchDef,
  display: {
    displayTitle: 'AST Search',
    wouldLikeTo: 'search AST for "{{{ query }}}"',
    isCurrently: 'searching AST for "{{{ query }}}"',
    hasAlready: 'searched AST for "{{{ query }}}"',
    icon: 'search-code',
    group: 'ast',
  },
  behavior: {
    readonly: true,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};
