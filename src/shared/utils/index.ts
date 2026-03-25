/**
 * Shared utilities index
 * Re-exports browser-safe utility functions for use in both renderer and main processes
 *
 * Note: fileUtils.ts contains Node.js-specific code and should be imported directly
 * when needed in the main process
 */

export * from './languageUtils';
export * from './pathUtils';

// fileUtils is NOT exported here as it uses Node.js fs module
// Import it directly: import { ... } from '../shared/utils/fileUtils'
