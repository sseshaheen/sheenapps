import fg from 'fast-glob';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { readFileSync } from 'fs';
import * as path from 'path';

const SHEENIGNORE = '.sheenignore';

/**
 * Load project-specific ignore patterns from .sheenignore file
 */
function loadIgnore(projectPath: string): string[] {
  try { 
    return readFileSync(path.join(projectPath, SHEENIGNORE), 'utf8')
             .split('\n')
             .filter(Boolean)
             .map(line => line.trim())
             .filter(line => !line.startsWith('#')); // Ignore comments
  } catch { 
    return []; 
  }
}

/**
 * Calculate a fingerprint hash of all source files in a project
 * Includes project-specific ignore patterns via .sheenignore
 * Uses SHA-256 for robustness but slices to 96 bits for performance
 */
export async function calcProjectFingerprint(projectPath: string): Promise<string> {
  const basePatterns = [
    'src/**/*.{js,ts,jsx,tsx,vue,svelte,css,scss,sass,less}',
    'public/**',
    'index.html',
    '*.config.{js,ts,cjs,mjs}', // vite.config.ts, next.config.js, etc.
    'tsconfig.json'
  ];

  // Add project-specific ignore patterns
  const ignorePatterns = loadIgnore(projectPath).map(p => '!' + p);
  const globPatterns = basePatterns.concat(ignorePatterns);

  const files = await fg(globPatterns, {
    cwd: projectPath,
    dot: false,
    ignore: [
      '**/*.map', 
      '**/*.test.*', 
      '**/*.stories.*',
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.nuxt/**'
    ]
  });

  // Deterministic order keeps hash stable
  files.sort();

  const hash = createHash('sha256');
  for (const rel of files) {
    hash.update(rel); // include path for uniqueness
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(path.join(projectPath, rel));
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
  }
  
  // Use first 12 bytes (96 bits) of SHA-256 for optimal performance
  // 96 bits provides more than sufficient entropy for cache keys
  return hash.digest('hex').slice(0, 24);
}