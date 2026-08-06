import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** The monorepo root — where the single .env everything shares lives. */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Read the *root* .env, not apps/web/.env. The repo documents one .env at the
  // root (see .env.example) and PORT/VITE_API_URL are set there for the API and
  // clients alike; without this, VITE_API_URL was silently ignored here and the
  // client fell back to its hardcoded default.
  const env = loadEnv(mode, repoRoot, '');

  return {
    plugins: [react()],
    envDir: repoRoot,
    server: {
      // WEB_PORT lets a machine that already has something on 5173 pin its own
      // port, so `pnpm dev` is deterministic instead of drifting to 5174/5175.
      port: Number(env.WEB_PORT) || 5173,
      strictPort: Boolean(env.WEB_PORT),
    },
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
  };
});
