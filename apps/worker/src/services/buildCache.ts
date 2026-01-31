import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { calcProjectFingerprint } from '../utils/projectFingerprint';

export const cacheDisabled = process.env.BUILD_CACHE_DISABLED === '1';

export interface CacheMetadata {
  created: number;
  framework: string;
  packageHash: string;
  lockfileHash: string;
  buildCommand: string;
  sourceHash?: string;
  version: 'v1' | 'v2' | 'v1-fallback';
}

export interface CacheResult {
  hit: boolean;
  cachePath?: string;
  metadata?: CacheMetadata;
}

export class BuildCache {
  private cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.join(os.homedir(), 'sheenapps-worker-cache', 'builds');
  }

  async ensureCacheDir(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Generate v1 cache key (legacy, without source files)
   */
  private generateV1Key(
    packageJsonContent: string,
    lockfileContent: string,
    framework: string,
    buildCommand: string
  ): { key: string; metadata: CacheMetadata } {
    const packageHash = crypto.createHash('md5').update(packageJsonContent).digest('hex');
    const lockfileHash = crypto.createHash('md5').update(lockfileContent).digest('hex');

    const cacheKey = crypto.createHash('md5')
      .update(packageJsonContent)
      .update(lockfileContent)
      .update(framework)
      .update(buildCommand)
      .digest('hex');

    const metadata: CacheMetadata = {
      created: Date.now(),
      framework,
      packageHash,
      lockfileHash,
      buildCommand,
      version: 'v1'
    };

    return { key: cacheKey, metadata };
  }

  async generateCacheKey(
    projectPath: string,
    framework: string,
    buildCommand: string
  ): Promise<{ key: string; metadata: CacheMetadata }> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');

    // Try to find lockfile
    const lockfilePaths = [
      path.join(projectPath, 'package-lock.json'),
      path.join(projectPath, 'pnpm-lock.yaml'),
      path.join(projectPath, 'yarn.lock')
    ];

    let lockfileContent = '';
    for (const lockfilePath of lockfilePaths) {
      try {
        lockfileContent = await fs.readFile(lockfilePath, 'utf8');
        break;
      } catch {
        // Continue to next lockfile
      }
    }

    // Try to calculate source file fingerprint (v2), fallback to v1 on error
    let sourceHash: string;
    let version: 'v2' | 'v1-fallback';
    
    try {
      sourceHash = await calcProjectFingerprint(projectPath);
      version = 'v2';
      console.log(`[BuildCache] Generated v2 cache key with source fingerprint`);
    } catch (err) {
      console.warn(`[BuildCache] Source fingerprint failed, falling back to v1:`, err);
      return {
        ...this.generateV1Key(packageJsonContent, lockfileContent, framework, buildCommand),
        metadata: {
          ...this.generateV1Key(packageJsonContent, lockfileContent, framework, buildCommand).metadata,
          version: 'v1-fallback'
        }
      };
    }

    const packageHash = crypto.createHash('md5').update(packageJsonContent).digest('hex');
    const lockfileHash = crypto.createHash('md5').update(lockfileContent).digest('hex');

    // Generate v2 cache key with source files included
    const cacheKey = crypto.createHash('md5')
      .update(packageJsonContent)
      .update(lockfileContent)
      .update(sourceHash) // NEW: Include source file hash
      .update(framework)
      .update(buildCommand)
      .digest('hex');

    const metadata: CacheMetadata = {
      created: Date.now(),
      framework,
      packageHash,
      lockfileHash,
      buildCommand,
      sourceHash,
      version
    };

    return { key: cacheKey, metadata };
  }

  async get(projectPath: string, framework: string, buildCommand: string): Promise<CacheResult> {
    if (cacheDisabled) {
      console.log('[BuildCache] Cache disabled via BUILD_CACHE_DISABLED=1');
      return { hit: false };
    }
    
    try {
      await this.ensureCacheDir();

      const { key } = await this.generateCacheKey(projectPath, framework, buildCommand);
      const cachePath = path.join(this.cacheDir, key);

      // Check if cache exists
      try {
        await fs.access(cachePath);
        const metadataPath = path.join(cachePath, '.cache-meta.json');
        const metadataContent = await fs.readFile(metadataPath, 'utf8');
        const metadata: CacheMetadata = JSON.parse(metadataContent);

        console.log(`[BuildCache] Cache hit for key: ${key}`);
        return {
          hit: true,
          cachePath,
          metadata
        };
      } catch {
        console.log(`[BuildCache] Cache miss for key: ${key}`);
        return { hit: false };
      }
    } catch (error) {
      console.error('[BuildCache] Error checking cache:', error);
      return { hit: false };
    }
  }

  async set(
    projectPath: string, 
    buildOutputPath: string, 
    framework: string, 
    buildCommand: string
  ): Promise<boolean> {
    if (cacheDisabled) {
      console.log('[BuildCache] Cache disabled via BUILD_CACHE_DISABLED=1, skipping cache storage');
      return false;
    }
    
    try {
      await this.ensureCacheDir();

      const { key, metadata } = await this.generateCacheKey(projectPath, framework, buildCommand);
      const cachePath = path.join(this.cacheDir, key);

      // Copy build output to cache
      await this.copyDirectory(buildOutputPath, cachePath);

      // Store metadata
      const metadataPath = path.join(cachePath, '.cache-meta.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      console.log(`[BuildCache] Cached build output to: ${cachePath}`);
      return true;
    } catch (error) {
      console.error('[BuildCache] Error storing cache:', error);
      return false;
    }
  }

  async restore(cachePath: string, targetPath: string): Promise<boolean> {
    try {
      // Ensure target directory is clean
      await fs.rm(targetPath, { recursive: true, force: true });
      
      // Copy from cache (excluding metadata)
      await this.copyDirectory(cachePath, targetPath, ['.cache-meta.json']);

      console.log(`[BuildCache] Restored build from cache to: ${targetPath}`);
      return true;
    } catch (error) {
      console.error('[BuildCache] Error restoring from cache:', error);
      return false;
    }
  }

  private async copyDirectory(source: string, target: string, exclude: string[] = []): Promise<void> {
    await fs.mkdir(target, { recursive: true });

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath, exclude);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  async cleanup(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      await this.ensureCacheDir();
      const entries = await fs.readdir(this.cacheDir, { withFileTypes: true });
      let cleaned = 0;

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const cachePath = path.join(this.cacheDir, entry.name);
        const metadataPath = path.join(cachePath, '.cache-meta.json');

        try {
          const stats = await fs.stat(metadataPath);
          const age = Date.now() - stats.mtime.getTime();

          if (age > maxAgeMs) {
            await fs.rm(cachePath, { recursive: true });
            cleaned++;
            console.log(`[BuildCache] Cleaned expired cache: ${entry.name}`);
          }
        } catch {
          // If no metadata, clean it anyway
          await fs.rm(cachePath, { recursive: true, force: true });
          cleaned++;
        }
      }

      console.log(`[BuildCache] Cleaned ${cleaned} expired cache entries`);
      return cleaned;
    } catch (error) {
      console.error('[BuildCache] Error during cleanup:', error);
      return 0;
    }
  }

  async getCacheStats(): Promise<{
    totalEntries: number;
    totalSizeBytes: number;
    oldestEntry: number;
    newestEntry: number;
  }> {
    try {
      await this.ensureCacheDir();
      const entries = await fs.readdir(this.cacheDir, { withFileTypes: true });
      
      let totalSize = 0;
      let oldest = Date.now();
      let newest = 0;
      let validEntries = 0;

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const cachePath = path.join(this.cacheDir, entry.name);
        const metadataPath = path.join(cachePath, '.cache-meta.json');

        try {
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          oldest = Math.min(oldest, metadata.created);
          newest = Math.max(newest, metadata.created);
          validEntries++;

          // Calculate directory size
          const size = await this.getDirectorySize(cachePath);
          totalSize += size;
        } catch {
          // Skip invalid cache entries
        }
      }

      return {
        totalEntries: validEntries,
        totalSizeBytes: totalSize,
        oldestEntry: oldest,
        newestEntry: newest
      };
    } catch (error) {
      console.error('[BuildCache] Error getting stats:', error);
      return {
        totalEntries: 0,
        totalSizeBytes: 0,
        oldestEntry: 0,
        newestEntry: 0
      };
    }
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += await this.getDirectorySize(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        size += stats.size;
      }
    }

    return size;
  }
}

// Singleton instance
let buildCacheInstance: BuildCache | null = null;

export function getBuildCache(): BuildCache {
  if (!buildCacheInstance) {
    buildCacheInstance = new BuildCache();
  }
  return buildCacheInstance;
}