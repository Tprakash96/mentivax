import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  optimizeDeps: {
    // Pre-bundle our CommonJS workspace packages so named imports resolve.
    include: ['@mentivax/core', '@mentivax/api-client', '@mentivax/ui'],
  },
  build: {
    commonjsOptions: {
      // Workspace packages resolve outside node_modules (pnpm symlinks), so
      // extend the commonjs plugin to transform them too.
      include: [/packages\//, /node_modules/],
      transformMixedEsModules: true,
    },
  },
});
