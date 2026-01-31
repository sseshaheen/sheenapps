/**
 * In-House Storage Service
 *
 * Storage operations for Easy Mode projects.
 * Manages signed URLs, file uploads, and R2 operations.
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
// Separate bucket for user uploads (not build artifacts)
const R2_STORAGE_BUCKET = process.env.R2_STORAGE_BUCKET || 'sheenapps-user-storage';

// S3 client for R2
const s3Client = R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY ? new S3Client({
  region: 'auto',
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
}) : null;

// =============================================================================
// TYPES
// =============================================================================

export interface SignedUploadOptions {
  path: string;
  contentType: string;
  maxSizeBytes?: number;
  expiresIn?: string; // '1h', '24h', etc.
  public?: boolean;
  metadata?: Record<string, string>;
}

export interface SignedUploadResult {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
  path: string;
  publicUrl?: string;
}

export interface SignedDownloadOptions {
  path: string;
  expiresIn?: string;
  downloadFilename?: string;
}

export interface SignedDownloadResult {
  url: string;
  expiresAt: string;
}

export interface ListFilesOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export interface FileMetadata {
  path: string;
  size: number;
  contentType?: string;
  lastModified: string;
  etag?: string;
  metadata?: Record<string, string>;
}

export interface ListFilesResult {
  files: FileMetadata[];
  nextCursor?: string;
  totalCount?: number;
}

export interface DeleteFilesResult {
  deleted: string[];
  failed: Array<{ path: string; error: string }>;
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseStorageService {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * Get the R2 key prefix for this project
   */
  private getKeyPrefix(): string {
    return `projects/${this.projectId}/`;
  }

  /**
   * Validate and normalize a file path to prevent path traversal attacks
   */
  private validateAndNormalizePath(path: string): string {
    // SECURITY: Check for percent-encoded traversal BEFORE decoding
    // This catches %2e%2e%2f (../), %2e (.), %2f (/), %5c (\)
    const lowerPath = path.toLowerCase()
    if (
      lowerPath.includes('%2e') || // Encoded .
      lowerPath.includes('%2f') || // Encoded /
      lowerPath.includes('%5c') || // Encoded \
      lowerPath.includes('%00')    // Null byte
    ) {
      throw new Error('Invalid path: encoded path traversal not allowed')
    }

    // Decode any percent-encoded characters
    let decoded: string
    try {
      decoded = decodeURIComponent(path)
    } catch {
      decoded = path
    }

    // SECURITY: Check for traversal AFTER decoding too (belt and suspenders)
    if (decoded.includes('..') || decoded.includes('\\')) {
      throw new Error('Invalid path: path traversal not allowed')
    }

    // Remove leading slash
    const normalized = decoded.startsWith('/') ? decoded.slice(1) : decoded

    // Split into segments and validate each
    const segments = normalized.split('/')
    for (const segment of segments) {
      // Reject path traversal attempts
      if (segment === '.' || segment === '..') {
        throw new Error('Invalid path: path traversal not allowed')
      }
      // Reject empty segments (double slashes)
      if (segment === '') {
        continue // Allow but skip empty segments
      }
      // Reject control characters
      if (/[\x00-\x1f\x7f]/.test(segment)) {
        throw new Error('Invalid path: control characters not allowed')
      }
      // Reject backslashes (Windows path separator)
      if (segment.includes('\\')) {
        throw new Error('Invalid path: backslashes not allowed')
      }
    }

    // Filter out empty segments and rejoin
    const cleanSegments = segments.filter(s => s !== '')
    if (cleanSegments.length === 0) {
      throw new Error('Invalid path: path cannot be empty')
    }

    return `${this.getKeyPrefix()}${cleanSegments.join('/')}`
  }

  /**
   * Get the full R2 key for a file path
   */
  private getFullKey(path: string): string {
    return this.validateAndNormalizePath(path);
  }

  /**
   * Parse expiration string to seconds
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)(s|m|h|d)$/);
    if (!match) {
      return 3600; // Default 1 hour
    }
    // match[1] and match[2] are guaranteed to exist after the regex match check above
    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 3600;
    }
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(path: string): string {
    const key = this.getFullKey(path);
    // Public bucket URL - configure in Cloudflare dashboard
    return `https://${R2_STORAGE_BUCKET}.${CF_ACCOUNT_ID}.r2.dev/${key}`;
  }

  /**
   * Create a signed URL for uploading
   */
  async createSignedUploadUrl(options: SignedUploadOptions): Promise<SignedUploadResult> {
    if (!s3Client) {
      throw new Error('Storage service not configured');
    }

    const key = this.getFullKey(options.path);
    const expiresInSeconds = this.parseExpiresIn(options.expiresIn || '1h');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    // Create PutObject command
    const command = new PutObjectCommand({
      Bucket: R2_STORAGE_BUCKET,
      Key: key,
      ContentType: options.contentType,
      ...(options.maxSizeBytes ? { ContentLength: options.maxSizeBytes } : {}),
      ...(options.metadata ? { Metadata: options.metadata } : {}),
    });

    // Generate signed URL
    const url = await getSignedUrl(s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    const result: SignedUploadResult = {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': options.contentType,
      },
      expiresAt,
      path: options.path,
    };

    // Include public URL if requested
    if (options.public) {
      result.publicUrl = this.getPublicUrl(options.path);
    }

    return result;
  }

  /**
   * Create a signed URL for downloading
   */
  async createSignedDownloadUrl(options: SignedDownloadOptions): Promise<SignedDownloadResult> {
    if (!s3Client) {
      throw new Error('Storage service not configured');
    }

    const key = this.getFullKey(options.path);
    const expiresInSeconds = this.parseExpiresIn(options.expiresIn || '1h');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    // Create GetObject command
    const command = new GetObjectCommand({
      Bucket: R2_STORAGE_BUCKET,
      Key: key,
      ...(options.downloadFilename ? {
        ResponseContentDisposition: `attachment; filename="${options.downloadFilename}"`,
      } : {}),
    });

    // Generate signed URL
    const url = await getSignedUrl(s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      url,
      expiresAt,
    };
  }

  /**
   * Upload a file directly (server-side only)
   */
  async upload(path: string, content: Buffer, contentType: string, metadata?: Record<string, string>): Promise<FileMetadata> {
    if (!s3Client) {
      throw new Error('Storage service not configured');
    }

    const key = this.getFullKey(path);

    const command = new PutObjectCommand({
      Bucket: R2_STORAGE_BUCKET,
      Key: key,
      Body: content,
      ContentType: contentType,
      ContentLength: content.length,
      ...(metadata ? { Metadata: metadata } : {}),
    });

    await s3Client.send(command);

    return {
      path,
      size: content.length,
      contentType,
      lastModified: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * List files in storage
   */
  async list(options: ListFilesOptions = {}): Promise<ListFilesResult> {
    if (!s3Client) {
      throw new Error('Storage service not configured');
    }

    const prefix = options.prefix
      ? this.getFullKey(options.prefix)
      : this.getKeyPrefix();

    const command = new ListObjectsV2Command({
      Bucket: R2_STORAGE_BUCKET,
      Prefix: prefix,
      MaxKeys: options.limit || 100,
      ...(options.cursor ? { ContinuationToken: options.cursor } : {}),
    });

    const response = await s3Client.send(command);

    const files: FileMetadata[] = (response.Contents || []).map(obj => ({
      // Remove project prefix from path
      path: obj.Key?.replace(this.getKeyPrefix(), '') || '',
      size: obj.Size || 0,
      lastModified: obj.LastModified?.toISOString() || new Date().toISOString(),
      etag: obj.ETag,
    }));

    return {
      files,
      nextCursor: response.NextContinuationToken,
      totalCount: response.KeyCount,
    };
  }

  /**
   * Get file metadata
   */
  async getMetadata(path: string): Promise<FileMetadata | null> {
    if (!s3Client) {
      throw new Error('Storage service not configured');
    }

    const key = this.getFullKey(path);

    try {
      const command = new HeadObjectCommand({
        Bucket: R2_STORAGE_BUCKET,
        Key: key,
      });

      const response = await s3Client.send(command);

      return {
        path,
        size: response.ContentLength || 0,
        contentType: response.ContentType,
        lastModified: response.LastModified?.toISOString() || new Date().toISOString(),
        etag: response.ETag,
        metadata: response.Metadata,
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete files from storage
   */
  async delete(paths: string[]): Promise<DeleteFilesResult> {
    if (!s3Client) {
      throw new Error('Storage service not configured');
    }

    const deleted: string[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    for (const path of paths) {
      try {
        const key = this.getFullKey(path);
        const command = new DeleteObjectCommand({
          Bucket: R2_STORAGE_BUCKET,
          Key: key,
        });
        await s3Client.send(command);
        deleted.push(path);
      } catch (error: any) {
        failed.push({
          path,
          error: error.message || 'Unknown error',
        });
      }
    }

    return { deleted, failed };
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

const SERVICE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 100;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  service: InhouseStorageService;
  createdAt: number;
}

const serviceCache = new Map<string, CacheEntry>();

function cleanupServiceCache(): void {
  const now = Date.now();

  // Remove entries older than TTL
  for (const [key, entry] of serviceCache) {
    if (now - entry.createdAt > SERVICE_TTL_MS) {
      serviceCache.delete(key);
    }
  }

  // Enforce max size by removing oldest entries
  if (serviceCache.size > MAX_CACHE_SIZE) {
    const entries = [...serviceCache.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    for (const [key] of toDelete) {
      serviceCache.delete(key);
    }
  }
}

export function getInhouseStorageService(projectId: string): InhouseStorageService {
  const cached = serviceCache.get(projectId);
  const now = Date.now();

  // Return cached if exists and not expired
  if (cached && now - cached.createdAt < SERVICE_TTL_MS) {
    return cached.service;
  }

  // Create new service instance
  const service = new InhouseStorageService(projectId);
  serviceCache.set(projectId, { service, createdAt: now });
  return service;
}

// Run cleanup periodically
setInterval(cleanupServiceCache, CLEANUP_INTERVAL_MS);
