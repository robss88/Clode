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
      // Resolve workspace packages to source for hot reloading
      '@claude-agent/ui': path.join(__dirname, '../../packages/ui/src'),
      '@claude-agent/core': path.join(__dirname, '../../packages/core/src'),
    },
  },
  // Use the UI package's PostCSS/Tailwind config
  css: {
    postcss: path.join(__dirname, '../../packages/ui'),
  },
  server: {
    port: 5173,
    // Watch workspace packages for changes
    watch: {
      ignored: ['!**/node_modules/@claude-agent/**'],
    },
  },
  // Optimize deps to exclude workspace packages (they're aliased to source)
  optimizeDeps: {
    exclude: ['@claude-agent/ui', '@claude-agent/core'],
  },
});
