/**
 * Application Settings Types
 * 
 * Centralized type definitions for application settings.
 * Used by both main and renderer processes.
 */

import { z } from 'zod';

/**
 * Settings schema validation using Zod
 */
export const SettingsSchema = z.object({
  /**
   * OpenAI API key for agent functionality
   */
  OPENAI_API_KEY: z.string().optional(),

  /**
   * Anthropic API key for Claude models
   */
  ANTHROPIC_API_KEY: z.string().optional(),

  /**
   * Default LLM model to use
   */
  DEFAULT_MODEL: z.string().optional(),

  /**
   * User preferences
   */
  theme: z.enum(['light', 'dark', 'system']).optional().default('dark'),
  
  /**
   * Editor preferences
   */
  editorFontSize: z.number().min(8).max(32).optional().default(13),
  editorFontFamily: z.string().optional(),
  
  /**
   * Terminal preferences
   */
  terminalFontSize: z.number().min(8).max(32).optional().default(12),
  
  /**
   * Agent behavior settings
   */
  autoApproveTools: z.boolean().optional().default(false),
  maxContextMessages: z.number().min(5).max(100).optional().default(20),
  
  /**
   * Last opened workspace path
   */
  lastWorkspacePath: z.string().optional(),
  
  /**
   * Window state
   */
  windowBounds: z.object({
    width: z.number(),
    height: z.number(),
    x: z.number().optional(),
    y: z.number().optional(),
  }).optional(),
});

/**
 * TypeScript type inferred from Zod schema
 */
export type AppSettings = z.infer<typeof SettingsSchema>;

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Partial<AppSettings> = {
  theme: 'dark',
  editorFontSize: 13,
  terminalFontSize: 12,
  autoApproveTools: false,
  maxContextMessages: 20,
};

/**
 * Partial settings type for updates
 */
export type SettingsUpdate = Partial<AppSettings>;
