import * as fs from 'fs/promises';
import * as path from 'path';
import { workspacePathValidator, type FileMetadata, type PathSecurityResult } from './workspacePathValidator';

export interface FileContent {
  path: string;
  content: string;
  isBinary: boolean;
  size: number;
  mtime: Date;
  encoding: string;
  etag: string;
}

export interface DirectoryListing {
  path: string;
  files: FileMetadata[];
  totalCount: number;
  filteredCount: number;
}

export interface TokenBucket {
  tokens: number;
  lastRefill: Date;
  capacity: number;
  refillRate: number; // tokens per second
}

/**
 * WorkspaceFileAccessService - Secure file access with rate limiting and caching
 * Implements ETag caching and token bucket rate limiting for advisor workspace
 */
export class WorkspaceFileAccessService {
  private rateLimitBuckets = new Map<string, TokenBucket>();
  private readonly DEFAULT_CAPACITY = 100; // burst capacity
  private readonly DEFAULT_REFILL_RATE = 50; // tokens per second
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  constructor() {
    // Cleanup old rate limit entries every 5 minutes
    setInterval(() => {
      this.cleanupRateLimits();
    }, 5 * 60 * 1000);
  }

  /**
   * Read file content with security validation and rate limiting
   */
  async readFile(
    projectRoot: string,
    requestedPath: string,
    advisorId: string,
    options: {
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      ifNoneMatch?: string | undefined; // ETag for caching
      ifModifiedSince?: Date | undefined;
      encoding?: BufferEncoding | undefined;
    } = {}
  ): Promise<FileContent | { notModified: true }> {
    // Rate limiting check
    const rateLimitResult = await this.checkRateLimit(advisorId, 'file_access');
    if (!rateLimitResult.allowed) {
      throw new Error('Rate limit exceeded for file access');
    }

    // Path security validation
    const pathValidation = await workspacePathValidator.validatePath(projectRoot, requestedPath);
    if (!pathValidation.allowed || !pathValidation.canonicalPath) {
      throw new Error(pathValidation.reason || 'File access denied');
    }

    // File size validation
    const sizeValidation = await workspacePathValidator.validateFileSize(pathValidation.canonicalPath);
    if (!sizeValidation.allowed) {
      throw new Error(sizeValidation.reason || 'File too large');
    }

    // Get file metadata
    const metadata = await workspacePathValidator.getFileMetadata(pathValidation.canonicalPath);
    
    if (metadata.isDirectory) {
      throw new Error('Cannot read directory as file');
    }

    // Generate ETag based on file path, size, and mtime
    const etag = this.generateETag(requestedPath, metadata.size, metadata.mtime);

    // Check caching headers
    if (options.ifNoneMatch === etag) {
      return { notModified: true };
    }

    if (options.ifModifiedSince && metadata.mtime <= options.ifModifiedSince) {
      return { notModified: true };
    }

    // Read file content
    let content: string;
    let encoding: BufferEncoding = 'utf8';

    if (metadata.isBinary) {
      // For binary files, return base64 encoded content
      const buffer = await fs.readFile(pathValidation.canonicalPath);
      content = buffer.toString('base64');
      encoding = 'base64';
    } else {
      // For text files, read as UTF-8 with fallback
      try {
        content = await fs.readFile(pathValidation.canonicalPath, options.encoding || 'utf8');
        encoding = options.encoding || 'utf8';
      } catch (error) {
        // Fallback to binary reading if UTF-8 fails
        const buffer = await fs.readFile(pathValidation.canonicalPath);
        content = buffer.toString('base64');
        encoding = 'base64';
      }
    }

    return {
      path: requestedPath,
      content,
      isBinary: metadata.isBinary,
      size: metadata.size,
      mtime: metadata.mtime,
      encoding,
      etag
    };
  }

  /**
   * List directory contents with security filtering
   */
  async listDirectory(
    projectRoot: string,
    requestedPath: string,
    advisorId: string
  ): Promise<DirectoryListing> {
    // Rate limiting check
    const rateLimitResult = await this.checkRateLimit(advisorId, 'directory_list');
    if (!rateLimitResult.allowed) {
      throw new Error('Rate limit exceeded for directory listing');
    }

    // Use path validator's directory listing with security filtering
    const result = await workspacePathValidator.listDirectory(projectRoot, requestedPath);

    return {
      path: requestedPath,
      files: result.files,
      totalCount: result.totalCount,
      filteredCount: result.filteredCount
    };
  }

  /**
   * Get file metadata without reading content
   */
  async getFileMetadata(
    projectRoot: string,
    requestedPath: string,
    advisorId: string
  ): Promise<FileMetadata> {
    // Rate limiting check (lighter rate limit for metadata only)
    const rateLimitResult = await this.checkRateLimit(advisorId, 'metadata');
    if (!rateLimitResult.allowed) {
      throw new Error('Rate limit exceeded for metadata access');
    }

    // Path security validation
    const pathValidation = await workspacePathValidator.validatePath(projectRoot, requestedPath);
    if (!pathValidation.allowed || !pathValidation.canonicalPath) {
      throw new Error(pathValidation.reason || 'File access denied');
    }

    return await workspacePathValidator.getFileMetadata(pathValidation.canonicalPath);
  }

  /**
   * Token bucket rate limiting implementation
   */
  private async checkRateLimit(
    advisorId: string,
    bucketType: 'file_access' | 'directory_list' | 'metadata'
  ): Promise<{ allowed: boolean; tokensRemaining: number }> {
    const bucketKey = `${advisorId}:${bucketType}`;
    const now = new Date();
    
    let bucket = this.rateLimitBuckets.get(bucketKey);
    
    if (!bucket) {
      // Create new bucket
      bucket = {
        tokens: this.DEFAULT_CAPACITY,
        lastRefill: now,
        capacity: this.DEFAULT_CAPACITY,
        refillRate: this.DEFAULT_REFILL_RATE
      };
      this.rateLimitBuckets.set(bucketKey, bucket);
    }

    // Calculate tokens to add based on time elapsed
    const timeDiffSeconds = (now.getTime() - bucket.lastRefill.getTime()) / 1000;
    const tokensToAdd = Math.floor(timeDiffSeconds * bucket.refillRate);
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    // Different costs for different operations
    const cost = this.getRateLimitCost(bucketType);
    
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, tokensRemaining: bucket.tokens };
    } else {
      return { allowed: false, tokensRemaining: bucket.tokens };
    }
  }

  /**
   * Get rate limit cost for different operations
   */
  private getRateLimitCost(bucketType: string): number {
    switch (bucketType) {
      case 'file_access': return 5; // Reading files is expensive
      case 'directory_list': return 2; // Directory listing is moderate
      case 'metadata': return 1; // Metadata is cheap
      default: return 1;
    }
  }

  /**
   * Generate ETag for caching
   */
  private generateETag(filePath: string, size: number, mtime: Date): string {
    const content = `${filePath}-${size}-${mtime.getTime()}`;
    // Simple hash implementation (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `"${Math.abs(hash).toString(36)}"`;
  }

  /**
   * Cleanup old rate limit buckets (older than 1 hour)
   */
  private cleanupRateLimits(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [key, bucket] of this.rateLimitBuckets.entries()) {
      if (bucket.lastRefill < oneHourAgo) {
        this.rateLimitBuckets.delete(key);
      }
    }
  }

  /**
   * Get rate limit status for advisor
   */
  getRateLimitStatus(advisorId: string): Record<string, { tokens: number; capacity: number }> {
    const result: Record<string, { tokens: number; capacity: number }> = {};
    
    for (const [key, bucket] of this.rateLimitBuckets.entries()) {
      if (key.startsWith(`${advisorId}:`)) {
        const bucketType = key.split(':')[1] ?? 'unknown';
        result[bucketType] = {
          tokens: bucket.tokens,
          capacity: bucket.capacity
        };
      }
    }
    
    return result;
  }

  /**
   * Reset rate limits for advisor (admin function)
   */
  resetRateLimits(advisorId: string): void {
    for (const key of this.rateLimitBuckets.keys()) {
      if (key.startsWith(`${advisorId}:`)) {
        this.rateLimitBuckets.delete(key);
      }
    }
  }

  /**
   * Validate if file is suitable for workspace viewing
   */
  async validateFileForWorkspace(filePath: string): Promise<{
    suitable: boolean;
    reason?: string;
    recommendations?: string[];
  }> {
    try {
      const stats = await fs.stat(filePath);
      const extension = path.extname(filePath).toLowerCase();
      
      // Check file size
      if (stats.size > this.MAX_FILE_SIZE) {
        return {
          suitable: false,
          reason: `File too large (${(stats.size / 1024 / 1024).toFixed(1)}MB > 10MB limit)`,
          recommendations: ['Use external viewer', 'Download file locally']
        };
      }

      // Check for common code file extensions
      const codeExtensions = [
        '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
        '.css', '.scss', '.sass', '.html', '.htm', '.xml', '.json', '.yaml', '.yml',
        '.md', '.txt', '.csv', '.sql', '.sh', '.bat', '.ps1', '.php', '.rb', '.go',
        '.rs', '.swift', '.kt', '.scala', '.clj', '.elm', '.vue', '.svelte'
      ];

      const configExtensions = [
        '.gitignore', '.env.example', '.dockerignore', '.prettierrc', '.eslintrc'
      ];

      const isCodeFile = codeExtensions.includes(extension);
      const isConfigFile = configExtensions.includes(extension) || 
                          path.basename(filePath).startsWith('.');

      if (isCodeFile || isConfigFile) {
        return { suitable: true };
      }

      // Check for binary files
      if (stats.size === 0) {
        return { suitable: true }; // Empty files are fine
      }

      // For other files, do a quick binary check
      const metadata = await workspacePathValidator.getFileMetadata(filePath);
      if (metadata.isBinary) {
        return {
          suitable: false,
          reason: 'Binary file not suitable for text editor',
          recommendations: ['Download file', 'Use appropriate viewer application']
        };
      }

      return { suitable: true };

    } catch (error) {
      return {
        suitable: false,
        reason: `Cannot access file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export singleton instance
export const workspaceFileAccessService = new WorkspaceFileAccessService();