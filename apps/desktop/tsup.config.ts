import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
  entry: {
    'main/index': 'src/main/index.ts',
    'preload/index': 'src/preload/index.ts',
  },
  format: ['cjs'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  // Mark electron and all node built-ins as external
  external: [
    'electron',
    'path',
    'fs',
    'child_process',
    'events',
    'stream',
    'crypto',
    'util',
    'os',
  ],
  // Bundle workspace packages so we always use latest code
  noExternal: ['@claude-agent/core', 'nanoid', 'eventemitter3', 'simple-git'],
  // Ensure proper module resolution
  shims: false,
  // Watch core package for changes too
  ignoreWatch: ['node_modules', 'dist'],
  // Resolve from source for better watch support
  esbuildOptions(options) {
    options.alias = {
      '@claude-agent/core': path.join(__dirname, '../../packages/core/src'),
    };
  },
});
