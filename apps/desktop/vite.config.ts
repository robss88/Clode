import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['crypto', 'stream', 'buffer'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron'],
    },
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5173,
  },
});
