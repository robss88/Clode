import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: path.join(__dirname, '../../dist/webview'),
    emptyOutDir: true,
    // IIFE format — VS Code webviews load scripts via <script src="...">
    rollupOptions: {
      input: path.join(__dirname, 'index.tsx'),
      output: {
        entryFileNames: 'index.js',
        assetFileNames: 'index.[ext]',
        format: 'iife',
      },
    },
    cssCodeSplit: false,
    sourcemap: false,
  },
  resolve: {
    alias: {
      // Resolve workspace packages to source for direct imports
      '@claude-agent/ui': path.join(__dirname, '../../../../packages/ui/src'),
      '@claude-agent/core': path.join(__dirname, '../../../../packages/core/src'),
    },
  },
  css: {
    postcss: __dirname,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
