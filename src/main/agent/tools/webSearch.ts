import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { tavily } from '@tavily/core';
import { loadSettings } from '../../appdata';

export const webSearchTool = createTool({
  id: 'webSearch',
  description: 'Search the web for real-time information using Tavily. Use this to find current docs, news, code examples, or any online information.',
  inputSchema: z.object({
    query: z.string().describe('The search query to look up on the web'),
    maxResults: z.number().optional().default(5).describe('Maximum number of results to return'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
      score: z.number().optional(),
    })),
    answer: z.string().optional(),
  }),
  execute: async ({ context, ...inputs }: any) => {
    const { query, maxResults } = inputs;
    const settings = loadSettings();
    const apiKey = settings.TAVILY_API_KEY || process.env.TAVILY_API_KEY;

    if (!apiKey) {
      return {
        results: [],
        answer: 'Tavily API key not configured. Please add it in Settings.',
      };
    }

    try {
      const client = tavily({ apiKey });
      const response = await client.search(query, {
        maxResults: maxResults ?? 5,
        searchDepth: 'advanced',
        includeAnswer: true,
      });

      return {
        results: (response.results || []).map((r: any) => ({
          title: r.title || '',
          url: r.url || '',
          content: r.content || '',
          score: r.score,
        })),
        answer: (response as any).answer || undefined,
      };
    } catch (e: any) {
      return {
        results: [],
        answer: `Search failed: ${e.message}`,
      };
    }
  },
});
