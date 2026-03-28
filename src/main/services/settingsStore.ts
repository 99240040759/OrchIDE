/**
 * Settings Store Service
 * 
 * Centralized settings management using electron-store.
 * Provides type-safe access to application settings with automatic persistence.
 * 
 * Features:
 * - Type-safe settings with Zod validation
 * - Automatic JSON persistence
 * - Schema migration support
 * - Encryption support (can be enabled)
 * - Default values handling
 * 
 * Usage:
 *   import { settingsStore } from './services/settingsStore';
 *   
 *   // Get a setting
 *   const apiKey = settingsStore.get('OPENAI_API_KEY');
 *   
 *   // Set a setting
 *   settingsStore.set('theme', 'dark');
 *   
 *   // Get all settings
 *   const allSettings = getAllSettings();
 */

import ElectronStore from 'electron-store';
import type { AppSettings } from '../../shared/types/settings';
import { SettingsSchema, DEFAULT_SETTINGS } from '../../shared/types/settings';
import { app } from 'electron';
import * as path from 'node:path';

/**
 * Custom data path for OrchIDE settings
 * Matches the existing ~/.appData/Orch/ structure
 */
const APP_DATA_PATH = path.join(app.getPath('appData'), 'Orch');

/**
 * Settings store singleton instance
 * 
 * Note: ElectronStore extends Conf which provides methods that aren't fully typed
 * We cast to 'any' where needed to access these methods
 */
const _settingsStore = new ElectronStore<AppSettings>({
  name: 'settings',
  cwd: APP_DATA_PATH,
  defaults: DEFAULT_SETTINGS,
  clearInvalidConfig: true,
  accessPropertiesByDotNotation: true,
}) as any;

export const settingsStore = _settingsStore as ElectronStore<AppSettings> & {
  store: AppSettings;
  set(key: keyof AppSettings, value: any): void;
  set(object: Partial<AppSettings>): void;
  get<K extends keyof AppSettings>(key: K): AppSettings[K];
  has(key: keyof AppSettings): boolean;
  delete(key: keyof AppSettings): void;
  clear(): void;
  path: string;
  onDidChange(key: string, callback: (newValue: any, oldValue: any) => void): () => void;
};

/**
 * Helper function to get all settings as a plain object
 * Useful for compatibility with existing code
 */
export function getAllSettings(): AppSettings {
  return settingsStore.store;
}

/**
 * Helper function to update multiple settings at once
 * Validates the entire settings object after update
 */
export function updateSettings(updates: Partial<AppSettings>): void {
  const currentSettings = settingsStore.store;
  const newSettings = { ...currentSettings, ...updates };
  
  // Validate with Zod schema
  const result = SettingsSchema.safeParse(newSettings);
  
  if (!result.success) {
    console.error('[SettingsStore] Validation error:', result.error);
    throw new Error(`Invalid settings: ${result.error.message}`);
  }
  
  // Update store - use set with object to update multiple keys
  settingsStore.set(updates);
}

/**
 * Helper function to reset settings to defaults
 */
export function resetSettings(): void {
  settingsStore.clear();
}

/**
 * Helper function to check if a setting exists
 */
export function hasSetting(key: keyof AppSettings): boolean {
  return settingsStore.has(key);
}

/**
 * Helper function to delete a specific setting
 */
export function deleteSetting(key: keyof AppSettings): void {
  settingsStore.delete(key);
}

/**
 * Watch for settings changes
 * Useful for reacting to settings updates
 */
export function watchSettings(
  key: keyof AppSettings,
  callback: (newValue: any, oldValue: any) => void
): () => void {
  const handler = settingsStore.onDidChange(key as string, callback);
  return handler;
}

/**
 * Migration helper: Import settings from old JSON format
 * This helps transition from the previous loadSettings/saveSettings implementation
 */
export function migrateFromLegacySettings(legacySettings: Record<string, any>): void {
  console.log('[SettingsStore] Migrating from legacy settings format...');
  
  try {
    // Validate legacy settings
    const result = SettingsSchema.safeParse(legacySettings);
    
    if (result.success) {
      // Merge with existing settings (don't overwrite everything)
      updateSettings(result.data);
      console.log('[SettingsStore] Migration successful');
    } else {
      console.warn('[SettingsStore] Legacy settings validation failed:', result.error);
      // Still attempt to import valid fields
      const validFields: Record<string, any> = {};
      for (const [key, value] of Object.entries(legacySettings)) {
        try {
          settingsStore.set(key as any, value);
          validFields[key] = value;
        } catch (err) {
          console.warn(`[SettingsStore] Skipping invalid field: ${key}`, err);
        }
      }
      if (Object.keys(validFields).length > 0) {
        console.log(`[SettingsStore] Partially migrated ${Object.keys(validFields).length} fields`);
      }
    }
  } catch (error) {
    console.error('[SettingsStore] Migration error:', error);
    throw error;
  }
}

// Log store initialization
console.log('[SettingsStore] Initialized at:', settingsStore.path);
