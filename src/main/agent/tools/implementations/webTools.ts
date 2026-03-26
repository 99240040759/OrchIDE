/**
 * Web Tool Implementations
 * 
 * Tools for web operations.
 */

import type { Tool, ToolContext, ToolResult } from '../types';

// ============================================================================
// Web Search Implementation
// ============================================================================

export const webSearchImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const query = args.query as string;
  const maxResults = (args.maxResults as number) ?? 5;

  // Check if Tavily API key is configured
  const tavilyApiKey = context.settings?.TAVILY_API_KEY || process.env.TAVILY_API_KEY;
  
  if (!tavilyApiKey) {
    return {
      output: [{
        name: 'Web Search',
        description: `Results for "${query}"`,
        content: JSON.stringify({
          query,
          note: 'Web search not configured. To enable, set TAVILY_API_KEY in settings.',
          results: [],
        }, null, 2),
      }],
      success: true,
      metadata: { searchConfigured: false },
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    if (context.signal) {
      context.signal.addEventListener('abort', () => controller.abort());
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: true,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        output: [{
          name: 'Error',
          description: 'Web search failed',
          content: `Tavily API error: ${response.status} - ${errorText}`,
          icon: 'error',
        }],
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json() as {
      answer?: string;
      results: Array<{
        title: string;
        url: string;
        content: string;
        score: number;
      }>;
    };

    const formattedResults = data.results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));

    return {
      output: [{
        name: 'Web Search Results',
        description: `Found ${formattedResults.length} results for "${query}"`,
        content: JSON.stringify({
          query,
          answer: data.answer,
          results: formattedResults,
        }, null, 2),
      }],
      success: true,
      metadata: { resultCount: formattedResults.length },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: [{
        name: 'Error',
        description: 'Web search failed',
        content: `Error searching: ${message}`,
        icon: 'error',
      }],
      success: false,
      error: message,
    };
  }
};

// ============================================================================
// Fetch URL Implementation
// ============================================================================

export const fetchUrlImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const url = args.url as string;
  const format = (args.format as string) ?? 'markdown';
  const maxLength = (args.maxLength as number) ?? 50000;

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        output: [{
          name: 'Error',
          description: 'Invalid URL protocol',
          content: `Only http and https URLs are supported`,
          icon: 'error',
        }],
        success: false,
        error: 'Invalid URL protocol',
      };
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    // Use context signal if available
    if (context.signal) {
      context.signal.addEventListener('abort', () => controller.abort());
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OrchIDE-Agent/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        output: [{
          name: 'Error',
          description: 'Failed to fetch URL',
          content: `HTTP ${response.status}: ${response.statusText}`,
          icon: 'error',
        }],
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    let content = await response.text();
    
    // Truncate if too long
    if (content.length > maxLength) {
      content = content.slice(0, maxLength) + '\n\n[Content truncated...]';
    }

    // Convert HTML to text/markdown if requested
    if (format === 'text' || format === 'markdown') {
      content = htmlToText(content);
    }

    return {
      output: [{
        name: 'URL Content',
        description: url,
        content,
        uri: { type: 'url', value: url },
      }],
      success: true,
      metadata: { 
        contentLength: content.length,
        contentType: response.headers.get('content-type'),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: [{
        name: 'Error',
        description: 'Failed to fetch URL',
        content: `Error fetching ${url}: ${message}`,
        icon: 'error',
      }],
      success: false,
      error: message,
    };
  }
};

/**
 * Simple HTML to text conversion
 */
function htmlToText(html: string): string {
  // Remove scripts and styles
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Replace common block elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
  text = text.replace(/<(br|hr)[^>]*\/?>/gi, '\n');
  
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n[ \t]+/g, '\n');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}
