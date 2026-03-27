/**
 * Type-safe accessor for the OrchIDE preload API
 * Provides proper typing for window.orchide access
 */

import type { OrchideAPI } from '../../types/electron.d';

/**
 * Get the OrchIDE API from the window object.
 * Returns undefined if the preload script hasn't been loaded.
 */
export function getOrchideAPI(): OrchideAPI | undefined {
  return (window as Window & { orchide?: OrchideAPI }).orchide;
}

/**
 * Get the OrchIDE API, throwing if not available.
 * Use this when you're certain the API should be present.
 */
export function requireOrchideAPI(): OrchideAPI {
  const api = getOrchideAPI();
  if (!api) {
    throw new Error('OrchIDE API not available. Preload script may not have loaded.');
  }
  return api;
}
