/**
 * Asset Pipeline Service - Phase 5 (Week 6, Days 4-5)
 *
 * Selective asset downloading with optimization:
 * - Same-origin images (always download)
 * - Logo/brand assets (always download)
 * - Size-capped downloads (< 8MB per file)
 * - WebP optimization with Sharp
 * - Font downloading (Google Fonts only)
 *
 * Expert Insight: "Selective downloading avoids becoming an asset siphon,
 * reduces bandwidth costs, and mitigates licensing issues."
 */

import { unifiedLogger } from './unifiedLogger';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Optional Sharp import - will fall back to passthrough if not available
let sharp: typeof import('sharp') | null = null;
try {
  sharp = require('sharp');
} catch {
  unifiedLogger.system('startup', 'warn', 'Sharp not installed, image optimization disabled');
}

// =========================================================================
// TYPES
// =========================================================================

export interface AssetUrl {
  url: string;
  type: 'image' | 'font' | 'script' | 'style' | 'other';
  context: 'html' | 'css' | 'inline';
  sourcePage?: string;
}

export interface DownloadedAsset {
  url: string;
  buffer: Buffer;
  mimeType: string;
  size: number;
  filename: string;
  hash: string;
}

export interface ProcessedAsset {
  originalUrl: string;
  localPath: string;
  content: Buffer;
  mimeType: string;
  size: number;
  optimized: boolean;
  metadata?: {
    originalSize?: number | undefined;
    compressionRatio?: number | undefined;
    width?: number | undefined;
    height?: number | undefined;
  } | undefined;
}

export interface AssetPipelineResult {
  processed: ProcessedAsset[];
  skipped: { url: string; reason: string }[];
  failed: { url: string; error: string }[];
  stats: {
    totalUrls: number;
    downloaded: number;
    optimized: number;
    skipped: number;
    failed: number;
    totalSizeBytes: number;
    savedBytes: number;
  };
}

// =========================================================================
// CONFIGURATION
// =========================================================================

// Size limits
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB max per file
const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024; // 50MB max total

// Domains to skip (stock photo sites, CDNs with licensing concerns)
const BLOCKLIST_DOMAINS = [
  'shutterstock.com',
  'istockphoto.com',
  'gettyimages.com',
  'adobe.stock.com',
  'unsplash.com', // Free but attribution required
  'pexels.com',
  'pixabay.com',
  'depositphotos.com',
  'dreamstime.com',
  '123rf.com',
];

// Domains always allowed (fonts, common CDNs)
const ALLOWLIST_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
];

// Timeouts
const DOWNLOAD_TIMEOUT_MS = 30000; // 30 seconds
const CONCURRENT_DOWNLOADS = 5;

// =========================================================================
// ASSET PIPELINE SERVICE
// =========================================================================

export class AssetPipelineService {
  private sourceOrigin: string = '';
  private downloadedSize = 0;
  private cache = new Map<string, DownloadedAsset>();

  /**
   * Process all assets for a migration
   */
  async processAssets(
    assetUrls: AssetUrl[],
    sourceUrl: string,
    outputDir: string
  ): Promise<AssetPipelineResult> {
    this.sourceOrigin = new URL(sourceUrl).origin;
    this.downloadedSize = 0;

    const result: AssetPipelineResult = {
      processed: [],
      skipped: [],
      failed: [],
      stats: {
        totalUrls: assetUrls.length,
        downloaded: 0,
        optimized: 0,
        skipped: 0,
        failed: 0,
        totalSizeBytes: 0,
        savedBytes: 0,
      },
    };

    // Deduplicate URLs
    const uniqueUrls = this.deduplicateUrls(assetUrls);
    unifiedLogger.system('startup', 'info', 'Starting asset pipeline', {
      totalUrls: assetUrls.length,
      uniqueUrls: uniqueUrls.length,
      sourceOrigin: this.sourceOrigin,
    });

    // Create output directories
    await this.ensureOutputDirs(outputDir);

    // Process in batches with concurrency limit
    const batches = this.chunk(uniqueUrls, CONCURRENT_DOWNLOADS);

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(asset => this.processAsset(asset, outputDir))
      );

      for (const batchResult of batchResults) {
        if (batchResult.status === 'processed') {
          result.processed.push(batchResult.asset!);
          result.stats.downloaded++;
          result.stats.totalSizeBytes += batchResult.asset!.size;
          if (batchResult.asset!.optimized) {
            result.stats.optimized++;
            result.stats.savedBytes += batchResult.savedBytes || 0;
          }
        } else if (batchResult.status === 'skipped') {
          result.skipped.push({ url: batchResult.url, reason: batchResult.reason! });
          result.stats.skipped++;
        } else {
          result.failed.push({ url: batchResult.url, error: batchResult.error! });
          result.stats.failed++;
        }
      }

      // Check total size limit
      if (this.downloadedSize > MAX_TOTAL_SIZE_BYTES) {
        unifiedLogger.system('startup', 'warn', 'Total asset size limit reached', {
          downloaded: this.downloadedSize,
          limit: MAX_TOTAL_SIZE_BYTES,
        });
        break;
      }
    }

    unifiedLogger.system('startup', 'info', 'Asset pipeline complete', result.stats);

    return result;
  }

  /**
   * Process a single asset
   */
  private async processAsset(
    asset: AssetUrl,
    outputDir: string
  ): Promise<{
    status: 'processed' | 'skipped' | 'failed';
    url: string;
    asset?: ProcessedAsset;
    reason?: string;
    error?: string;
    savedBytes?: number;
  }> {
    try {
      // Check if should skip
      const skipReason = this.shouldSkipAsset(asset);
      if (skipReason) {
        return { status: 'skipped', url: asset.url, reason: skipReason };
      }

      // Download asset
      const downloaded = await this.downloadAsset(asset.url);
      if (!downloaded) {
        return { status: 'failed', url: asset.url, error: 'Download failed' };
      }

      // Check size limit
      if (downloaded.size > MAX_FILE_SIZE_BYTES) {
        return {
          status: 'skipped',
          url: asset.url,
          reason: `File too large: ${(downloaded.size / 1024 / 1024).toFixed(1)}MB > ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit`,
        };
      }

      // Process based on type
      let processed: ProcessedAsset;
      let savedBytes = 0;

      if (asset.type === 'image' && this.isOptimizableImage(downloaded.mimeType)) {
        const optimized = await this.optimizeImage(downloaded, outputDir);
        savedBytes = downloaded.size - optimized.size;
        processed = optimized;
      } else {
        processed = await this.saveAsset(downloaded, outputDir, asset.type);
      }

      this.downloadedSize += processed.size;

      return { status: 'processed', url: asset.url, asset: processed, savedBytes };
    } catch (error) {
      return { status: 'failed', url: asset.url, error: (error as Error).message };
    }
  }

  /**
   * Check if asset should be skipped
   */
  private shouldSkipAsset(asset: AssetUrl): string | null {
    try {
      const url = new URL(asset.url);

      // Check blocklist
      for (const domain of BLOCKLIST_DOMAINS) {
        if (url.hostname.includes(domain)) {
          return `Blocklisted domain: ${domain}`;
        }
      }

      // Check if same-origin or allowlisted
      const isSameOrigin = url.origin === this.sourceOrigin;
      const isAllowlisted = ALLOWLIST_DOMAINS.some(d => url.hostname.includes(d));

      if (!isSameOrigin && !isAllowlisted) {
        return `External domain not in allowlist: ${url.hostname}`;
      }

      // Skip data URLs
      if (asset.url.startsWith('data:')) {
        return 'Data URL (already inline)';
      }

      return null;
    } catch {
      return 'Invalid URL';
    }
  }

  /**
   * Download an asset with timeout and caching
   */
  private async downloadAsset(url: string): Promise<DownloadedAsset | null> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached) {
      unifiedLogger.system('startup', 'info', 'Asset cache hit', { url });
      return cached;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SheenappsBot/1.0)',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        unifiedLogger.system('startup', 'warn', 'Asset download failed', {
          url,
          status: response.status,
        });
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const mimeType = response.headers.get('content-type') || 'application/octet-stream';
      const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 8);
      const filename = this.generateFilename(url, hash, mimeType);

      const asset: DownloadedAsset = {
        url,
        buffer,
        mimeType,
        size: buffer.length,
        filename,
        hash,
      };

      // Cache the downloaded asset
      this.cache.set(url, asset);

      unifiedLogger.system('startup', 'info', 'Asset downloaded', {
        url,
        size: buffer.length,
        mimeType,
      });

      return asset;
    } catch (error) {
      unifiedLogger.system('startup', 'warn', 'Asset download error', {
        url,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Optimize an image using Sharp
   */
  private async optimizeImage(
    asset: DownloadedAsset,
    outputDir: string
  ): Promise<ProcessedAsset> {
    const localPath = `public/images/${asset.filename}.webp`;
    const fullPath = path.join(outputDir, localPath);

    // If Sharp is not available, just save as-is
    if (!sharp) {
      return this.saveAsset(asset, outputDir, 'image');
    }

    try {
      const image = sharp(asset.buffer);
      const metadata = await image.metadata();

      // Convert to WebP with quality 85
      const webpBuffer = await image
        .webp({ quality: 85 })
        .toBuffer();

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, webpBuffer);

      unifiedLogger.system('startup', 'info', 'Image optimized', {
        original: asset.url,
        originalSize: asset.size,
        optimizedSize: webpBuffer.length,
        compressionRatio: (asset.size / webpBuffer.length).toFixed(2),
      });

      return {
        originalUrl: asset.url,
        localPath,
        content: webpBuffer,
        mimeType: 'image/webp',
        size: webpBuffer.length,
        optimized: true,
        metadata: {
          originalSize: asset.size,
          compressionRatio: asset.size / webpBuffer.length,
          width: metadata.width ?? undefined,
          height: metadata.height ?? undefined,
        },
      };
    } catch (error) {
      unifiedLogger.system('startup', 'warn', 'Image optimization failed, using original', {
        url: asset.url,
        error: (error as Error).message,
      });

      // Fall back to saving original
      return this.saveAsset(asset, outputDir, 'image');
    }
  }

  /**
   * Save asset to disk without optimization
   */
  private async saveAsset(
    asset: DownloadedAsset,
    outputDir: string,
    type: string
  ): Promise<ProcessedAsset> {
    const subdir = this.getSubdirForType(type);
    const extension = this.getExtensionFromMimeType(asset.mimeType);
    const localPath = `public/${subdir}/${asset.filename}${extension}`;
    const fullPath = path.join(outputDir, localPath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, asset.buffer);

    return {
      originalUrl: asset.url,
      localPath,
      content: asset.buffer,
      mimeType: asset.mimeType,
      size: asset.size,
      optimized: false,
    };
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  private deduplicateUrls(assets: AssetUrl[]): AssetUrl[] {
    const seen = new Set<string>();
    return assets.filter(asset => {
      if (seen.has(asset.url)) return false;
      seen.add(asset.url);
      return true;
    });
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private isOptimizableImage(mimeType: string): boolean {
    return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);
  }

  private generateFilename(url: string, hash: string, mimeType: string): string {
    try {
      const parsed = new URL(url);
      const basename = path.basename(parsed.pathname);
      // Remove extension if present, use hash for uniqueness
      const name = basename.replace(/\.[^.]+$/, '');
      // Sanitize filename
      const sanitized = name.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 50);
      return sanitized ? `${sanitized}-${hash}` : hash;
    } catch {
      return hash;
    }
  }

  private getSubdirForType(type: string): string {
    switch (type) {
      case 'image':
        return 'images';
      case 'font':
        return 'fonts';
      case 'script':
        return 'js';
      case 'style':
        return 'css';
      default:
        return 'assets';
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'font/woff': '.woff',
      'font/woff2': '.woff2',
      'font/ttf': '.ttf',
      'text/css': '.css',
      'application/javascript': '.js',
      'text/javascript': '.js',
    };
    return map[mimeType] || '';
  }

  private async ensureOutputDirs(outputDir: string): Promise<void> {
    const dirs = ['public/images', 'public/fonts', 'public/assets'];
    for (const dir of dirs) {
      await fs.mkdir(path.join(outputDir, dir), { recursive: true });
    }
  }

  /**
   * Clear the download cache
   */
  clearCache(): void {
    this.cache.clear();
    this.downloadedSize = 0;
  }
}
