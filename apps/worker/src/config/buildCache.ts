import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Shared pnpm store configuration
const PNPM_STORE_DIR = process.env.PNPM_STORE_DIR || path.join(os.homedir(), '.pnpm-cache');

// Initialize pnpm with shared store
export async function initializePnpmCache(): Promise<void> {
  try {
    // Create store directory if it doesn't exist
    await fs.mkdir(PNPM_STORE_DIR, { recursive: true });

    // Set global pnpm store directory
    await execCommand(`pnpm config set store-dir ${PNPM_STORE_DIR}`);

    // Set other performance optimizations
    await execCommand('pnpm config set verify-store-integrity false'); // Faster installs
    await execCommand('pnpm config set package-import-method copy'); // Better for containers

    console.log(`✅ pnpm cache initialized at: ${PNPM_STORE_DIR}`);
  } catch (error) {
    console.error('Failed to initialize pnpm cache:', error);
  }
}

// Get pnpm install command with cache
export function getPnpmInstallCommand(_projectDir: string): string {
  return `pnpm install --no-frozen-lockfile --store-dir ${PNPM_STORE_DIR} --cache-dir ${PNPM_STORE_DIR}/.cache`;
}

// Clean old packages from cache
export async function pruneCache(_maxAgeInDays: number = 30): Promise<void> {
  try {
    await execCommand(`pnpm store prune --store-dir ${PNPM_STORE_DIR}`);
    console.log('✅ pnpm cache pruned');
  } catch (error) {
    console.error('Failed to prune pnpm cache:', error);
  }
}

// Get cache statistics
export async function getCacheStats(): Promise<{
  size: number;
  packages: number;
}> {
  try {
    // Get store status
    const output = await execCommand(`pnpm store status --store-dir ${PNPM_STORE_DIR}`);

    // Parse output (this is simplified, actual parsing would be more complex)
    const sizeMatch = output.match(/Total size: ([0-9.]+) ([KMG]B)/);
    const packagesMatch = output.match(/Packages: (\d+)/);

    let size = 0;
    if (sizeMatch && sizeMatch[1] && sizeMatch[2]) {
      const value = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2];
      size = unit === 'KB' ? value * 1024 :
             unit === 'MB' ? value * 1024 * 1024 :
             unit === 'GB' ? value * 1024 * 1024 * 1024 : value;
    }

    return {
      size,
      packages: parseInt(packagesMatch?.[1] || '0'),
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return { size: 0, packages: 0 };
  }
}

// Execute command helper
function execCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    if (!cmd) {
      reject(new Error('Empty command'));
      return;
    }

    const child = spawn(cmd, args, {
      env: process.env,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed: ${stderr}`));
      }
    });
  });
}

// Warm cache by pre-installing common packages
export async function warmCache(commonPackages: string[] = []): Promise<void> {
  const defaultPackages = [
    'react@latest',
    'react-dom@latest',
    'next@latest',
    'vue@latest',
    'svelte@latest',
    'vite@latest',
    'typescript@latest',
    'tailwindcss@latest',
    '@types/react@latest',
    '@types/node@latest',
  ];

  const packagesToWarm = [...defaultPackages, ...commonPackages];

  try {
    const tempDir = path.join(os.tmpdir(), 'pnpm-warm-cache');
    await fs.mkdir(tempDir, { recursive: true });

    // Create a temporary package.json
    const packageJson = {
      name: 'cache-warmer',
      private: true,
      dependencies: packagesToWarm.reduce((acc, pkg) => {
        const atIndex = pkg.lastIndexOf('@');
        // Handle scoped packages (e.g., @types/react@latest) and regular packages
        const name = atIndex > 0 ? pkg.slice(0, atIndex) : pkg;
        const version = atIndex > 0 ? pkg.slice(atIndex + 1) : 'latest';
        acc[name] = version || 'latest';
        return acc;
      }, {} as Record<string, string>),
    };

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Install to warm the cache
    await execCommand(`cd ${tempDir} && ${getPnpmInstallCommand(tempDir)}`);

    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });

    console.log('✅ Cache warmed with common packages');
  } catch (error) {
    console.error('Failed to warm cache:', error);
  }
}
