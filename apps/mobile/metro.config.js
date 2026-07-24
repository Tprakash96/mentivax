/**
 * Metro bundler config tuned for a pnpm + Turborepo monorepo.
 *
 * pnpm's isolated node_modules layout means workspace packages
 * (@mentivax/*) live at the repo root, not under apps/mobile. Metro must be
 * told to (a) watch the whole repo so edits in packages/* trigger reloads and
 * (b) resolve modules from both the app's and the root's node_modules.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo so changes in packages/* hot-reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then fall back to the repo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Do not "hoist" — respect pnpm's isolated layout.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
