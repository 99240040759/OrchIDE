/**
 * Web Tool Definitions
 * 
 * Tools for web operations: search, fetch URL content.
 */

import type { Tool } from '../types';
import { createToolDefinition } from '../registry';

// ============================================================================
// Web Search Tool
// ============================================================================

export const webSearchDefinition: Tool['definition'] = createToolDefinition(
  'webSearch',
  'Search the web for information. Returns relevant results from various sources.',
  {
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      maxResults: {
        type: 'integer',
        description: 'Maximum number of results to return',
        default: 5,
      },
    },
  }
);

export const webSearchTool: Omit<Tool, 'execute'> = {
  definition: webSearchDefinition,
  display: {
    displayTitle: 'Web Search',
    wouldLikeTo: 'search the web for "{{{ query }}}"',
    isCurrently: 'searching the web for "{{{ query }}}"',
    hasAlready: 'searched the web for "{{{ query }}}"',
    icon: 'globe',
    group: 'web',
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
// Fetch URL Tool
// ============================================================================

export const fetchUrlDefinition: Tool['definition'] = createToolDefinition(
  'fetchUrl',
  'Fetch content from a URL. Returns the page content as text or markdown.',
  {
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch',
      },
      format: {
        type: 'string',
        description: 'Output format',
        enum: ['text', 'markdown', 'raw'],
        default: 'markdown',
      },
      maxLength: {
        type: 'integer',
        description: 'Maximum content length to return',
        default: 50000,
      },
    },
  }
);

export const fetchUrlTool: Omit<Tool, 'execute'> = {
  definition: fetchUrlDefinition,
  display: {
    displayTitle: 'Fetch URL',
    wouldLikeTo: 'fetch content from {{{ url }}}',
    isCurrently: 'fetching content from {{{ url }}}',
    hasAlready: 'fetched content from {{{ url }}}',
    icon: 'link',
    group: 'web',
  },
  behavior: {
    readonly: true,
    isInstant: false,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
    timeoutMs: 30000,
  },
};
