import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  // `tsconfig.json` sets `jsx: preserve` because Next.js does its own JSX
  // transform. Vitest has no such downstream step, so it has to transform JSX
  // itself — without this, importing the invoice PDF document fails to parse.
  // The key is `oxc` and not `esbuild`: Vite 8 transforms with Oxc, and an
  // `esbuild` block here is silently ignored rather than rejected.
  oxc: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
