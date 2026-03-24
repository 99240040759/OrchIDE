/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';

// @ts-ignore
const platform = window.electron?.platform || 'unknown';
document.body.classList.add(`platform-${platform}`);

// Handle Windows Controls Overlay geometry changes (Industry Grade)
if ('windowControlsOverlay' in navigator) {
  // @ts-ignore
  navigator.windowControlsOverlay.addEventListener('geometrychange', (e: any) => {
    // The browser/Electron will update `env(titlebar-area-*)` CSS variables automatically.
    // We can also perform JS logic here if needed.
    console.log('Title bar geometry changed', e.titlebarAreaRect);
  });
}

console.log('OrchIDE Initialized');
