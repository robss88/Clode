import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'claude/index': 'src/claude/index.ts',
    'checkpoints/index': 'src/checkpoints/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  // Bundle ESM-only packages into the output
  noExternal: ['nanoid'],
});
