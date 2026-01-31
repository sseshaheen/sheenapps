/**
 * Standard build output directories used across frameworks
 * Centralized to avoid duplication and ensure consistency
 */
export const POSSIBLE_BUILD_DIRS = [
  'dist',        // Vite, Rollup, Webpack default
  'build',       // Create React App, many custom setups
  'out',         // Next.js export
  '.next',       // Next.js build (for SSR/ISR)
  '.svelte-kit', // SvelteKit
  '.output',     // Nuxt 3
  '.nuxt',       // Nuxt 2
  'public',      // Some static site generators
  '_site'        // Jekyll, some static generators
];

/**
 * Get the first existing build directory from the standard list
 */
export async function findBuildDirectory(projectPath: string): Promise<string | null> {
  const { promises: fs } = await import('fs');
  const path = await import('path');
  
  for (const dir of POSSIBLE_BUILD_DIRS) {
    const fullPath = path.join(projectPath, dir);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        console.log(`[Build Directories] Found build output: ${dir}`);
        return fullPath;
      }
    } catch {
      // Directory doesn't exist, continue
    }
  }
  
  console.log('[Build Directories] No standard build directory found');
  return null;
}