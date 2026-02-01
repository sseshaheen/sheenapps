const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project root (monorepo root)
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch workspace packages for changes
config.watchFolders = [
  monorepoRoot,
  path.resolve(monorepoRoot, 'packages/api-contracts'),
  path.resolve(monorepoRoot, 'packages/platform-tokens'),
  path.resolve(monorepoRoot, 'packages/capabilities'),
];

// Let Metro resolve packages from the monorepo root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Ensure Metro can resolve workspace packages
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
