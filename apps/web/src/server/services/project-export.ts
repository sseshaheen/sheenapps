/**
 * Project Export Service
 * Handles project downloads and exports with smart URL caching
 * Phase 5 of Worker API Migration Plan
 * 
 * SERVER-ONLY MODULE - Do not import in client components
 */

import 'server-only';
import { getWorkerClient } from './worker-api-client';
import { getCurrentUserId } from '@/utils/auth';
import { logger } from '@/utils/logger';

export interface ExportOptions {
  format: 'zip' | 'tar' | 'folder';
  includeAssets?: boolean;
  includeDependencies?: boolean;
  minifyCode?: boolean;
}

export interface ExportResponse {
  success: boolean;
  downloadUrl?: string;
  exportId?: string;
  expiresAt?: string;
  size?: number;
  error?: string;
  details?: string;
}

export interface CachedExport {
  downloadUrl: string;
  expiresAt: Date;
  size: number;
  options: ExportOptions;
  createdAt: Date;
}

export class ProjectExportService {
  // Smart caching with TTL awareness (23-hour refresh as per plan)
  private static exportCache = new Map<string, CachedExport>();
  private static readonly CACHE_DURATION_HOURS = 23;
  private static readonly CACHE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

  /**
   * Export a project with smart caching
   */
  static async exportProject(
    projectId: string,
    options: ExportOptions = { format: 'zip' },
    userId?: string
  ): Promise<ExportResponse> {
    const effectiveUserId = userId || await getCurrentUserId();
    const cacheKey = this.generateCacheKey(projectId, options, effectiveUserId);

    logger.info(`📦 Exporting project: ${projectId}`, {
      format: options.format,
      userId: effectiveUserId,
      cacheKey
    });

    try {
      // Check cache first
      const cached = this.getCachedExport(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        logger.info(`🎯 Using cached export for project: ${projectId}`, {
          cacheAge: Date.now() - cached.createdAt.getTime(),
          expiresAt: cached.expiresAt.toISOString()
        });

        return {
          success: true,
          downloadUrl: cached.downloadUrl,
          expiresAt: cached.expiresAt.toISOString(),
          size: cached.size
        };
      }

      // Request new export from Worker API
      const exportRequest = {
        userId: effectiveUserId,
        projectId,
        options,
        metadata: {
          requestedAt: new Date().toISOString(),
          clientSource: 'nextjs-dashboard'
        }
      };

      logger.info(`📤 Requesting export from Worker API for project: ${projectId}`);

      const response = await getWorkerClient().post<{
        exportId: string;
        downloadUrl: string;
        expiresAt: string;
        size: number;
        status: 'ready' | 'processing';
      }>('/v1/projects/export', exportRequest);

      logger.info(`✅ Export response received for project ${projectId}:`, {
        exportId: response.exportId,
        status: response.status,
        size: response.size,
        expiresAt: response.expiresAt
      });

      // Cache the result if it's ready
      if (response.status === 'ready' && response.downloadUrl) {
        const cachedExport: CachedExport = {
          downloadUrl: response.downloadUrl,
          expiresAt: new Date(response.expiresAt),
          size: response.size,
          options,
          createdAt: new Date()
        };

        this.exportCache.set(cacheKey, cachedExport);
        logger.info(`💾 Export cached for project: ${projectId}`, {
          cacheKey,
          expiresAt: response.expiresAt
        });
      }

      return {
        success: true,
        downloadUrl: response.downloadUrl,
        exportId: response.exportId,
        expiresAt: response.expiresAt,
        size: response.size
      };

    } catch (error) {
      logger.error(`❌ Export failed for project ${projectId}:`, error);
      
      return {
        success: false,
        error: 'Export failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get export status (for long-running exports)
   */
  static async getExportStatus(
    exportId: string,
    userId?: string
  ): Promise<{
    status: 'processing' | 'ready' | 'failed';
    progress?: number;
    downloadUrl?: string;
    expiresAt?: string;
    error?: string;
  }> {
    const effectiveUserId = userId || await getCurrentUserId();

    try {
      logger.info(`🔍 Checking export status: ${exportId}`);

      const response = await getWorkerClient().get<{
        status: 'processing' | 'ready' | 'failed';
        progress?: number;
        downloadUrl?: string;
        expiresAt?: string;
        error?: string;
      }>(`/v1/exports/${exportId}/status`);

      logger.info(`✅ Export status for ${exportId}:`, {
        status: response.status,
        progress: response.progress,
        hasDownloadUrl: !!response.downloadUrl
      });

      return response;

    } catch (error) {
      logger.error(`❌ Failed to get export status for ${exportId}:`, error);
      throw error;
    }
  }

  /**
   * Download project files directly (streaming)
   */
  static async downloadProject(
    projectId: string,
    options: ExportOptions = { format: 'zip' },
    userId?: string
  ): Promise<{
    blob: Blob;
    filename: string;
    size: number;
  }> {
    const effectiveUserId = userId || await getCurrentUserId();

    try {
      logger.info(`⬇️ Downloading project directly: ${projectId}`, {
        format: options.format,
        userId: effectiveUserId
      });

      // First get the export URL
      const exportResponse = await this.exportProject(projectId, options, effectiveUserId);
      
      if (!exportResponse.success || !exportResponse.downloadUrl) {
        throw new Error(exportResponse.error || 'Export failed');
      }

      // Download the file
      const downloadResponse = await fetch(exportResponse.downloadUrl);
      
      if (!downloadResponse.ok) {
        throw new Error(`Download failed: ${downloadResponse.statusText}`);
      }

      const blob = await downloadResponse.blob();
      const filename = this.generateFilename(projectId, options);

      logger.info(`✅ Project downloaded successfully: ${projectId}`, {
        filename,
        size: blob.size
      });

      return {
        blob,
        filename,
        size: blob.size
      };

    } catch (error) {
      logger.error(`❌ Download failed for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * List recent exports for a user
   */
  static async getUserExports(
    userId?: string,
    limit: number = 10
  ): Promise<{
    exports: Array<{
      exportId: string;
      projectId: string;
      createdAt: string;
      status: string;
      format: string;
      size?: number;
      downloadUrl?: string;
      expiresAt?: string;
    }>;
  }> {
    const effectiveUserId = userId || await getCurrentUserId();

    try {
      logger.info(`📋 Getting user exports: ${effectiveUserId}`, { limit });

      const response = await getWorkerClient().get<{
        exports: Array<{
          exportId: string;
          projectId: string;
          createdAt: string;
          status: string;
          format: string;
          size?: number;
          downloadUrl?: string;
          expiresAt?: string;
        }>;
      }>(`/v1/users/${effectiveUserId}/exports?limit=${limit}`);

      logger.info(`✅ Found ${response.exports.length} exports for user: ${effectiveUserId}`);

      return response;

    } catch (error) {
      logger.error(`❌ Failed to get user exports for ${effectiveUserId}:`, error);
      throw error;
    }
  }

  /**
   * Generate cache key for export caching
   */
  private static generateCacheKey(
    projectId: string,
    options: ExportOptions,
    userId: string
  ): string {
    const optionsStr = JSON.stringify(options);
    const hash = this.simpleHash(optionsStr);
    return `export-${projectId}-${userId}-${hash}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get cached export if available
   */
  private static getCachedExport(cacheKey: string): CachedExport | null {
    return this.exportCache.get(cacheKey) || null;
  }

  /**
   * Check if cached export is still valid
   */
  private static isCacheValid(cached: CachedExport): boolean {
    const now = new Date();
    
    // Check if export URL has expired
    if (cached.expiresAt <= now) {
      logger.debug('export-cache', `🗑️ Cache expired (URL expiry): ${cached.expiresAt.toISOString()} vs ${now.toISOString()}`);
      return false;
    }

    // Check our own cache TTL (23 hours)
    const cacheAge = now.getTime() - cached.createdAt.getTime();
    const maxAge = this.CACHE_DURATION_HOURS * 60 * 60 * 1000;
    
    if (cacheAge > maxAge) {
      logger.debug('export-cache', `🗑️ Cache expired (TTL): ${(cacheAge / (60 * 60 * 1000)).toFixed(1)}h vs ${this.CACHE_DURATION_HOURS}h`);
      return false;
    }

    return true;
  }

  /**
   * Generate filename for download
   */
  private static generateFilename(projectId: string, options: ExportOptions): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const extension = options.format === 'tar' ? 'tar.gz' : options.format;
    return `${projectId}-${timestamp}.${extension}`;
  }

  /**
   * Clean up expired cache entries
   */
  static cleanupCache(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, cached] of this.exportCache.entries()) {
      if (!this.isCacheValid(cached)) {
        this.exportCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 Cleaned up ${cleaned} expired export cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
    totalSize: number;
  } {
    let validEntries = 0;
    let expiredEntries = 0;
    let totalSize = 0;

    for (const cached of this.exportCache.values()) {
      if (this.isCacheValid(cached)) {
        validEntries++;
      } else {
        expiredEntries++;
      }
      totalSize += cached.size || 0;
    }

    return {
      totalEntries: this.exportCache.size,
      validEntries,
      expiredEntries,
      totalSize
    };
  }

  /**
   * Initialize periodic cache cleanup
   */
  static initializeCacheCleanup(): void {
    setInterval(() => {
      this.cleanupCache();
    }, this.CACHE_CHECK_INTERVAL);

    logger.info('🔄 Export cache cleanup initialized', {
      checkIntervalMinutes: this.CACHE_CHECK_INTERVAL / (60 * 1000),
      cacheDurationHours: this.CACHE_DURATION_HOURS
    });
  }

  /**
   * Health check for export service
   */
  static async healthCheck(): Promise<boolean> {
    try {
      // Test basic Worker API connectivity
      const response = await getWorkerClient().get<{ status: string }>('/v1/health');
      return response.status === 'healthy';
    } catch (error) {
      logger.error('❌ Export service health check failed:', error);
      return false;
    }
  }
}