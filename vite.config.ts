/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 15000,
  },
});
