import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['bufferutil', 'utf-8-validate', 'chokidar', 'gray-matter', '@mastra/core', 'better-sqlite3'],
    },
  },
});
