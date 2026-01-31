import * as path from 'path';
import * as fs from 'fs/promises';
import { isMatch } from 'micromatch';

export interface PathSecurityResult {
  allowed: boolean;
  reason?: string;
  canonicalPath?: string;
}

export interface FileMetadata {
  path: string;
  size: number;
  isDirectory: boolean;
  isBinary: boolean;
  mtime: Date;
  extension: string;
}

/**
 * WorkspacePathValidator - Production-grade path security for advisor workspace
 * Implements canonical path resolution and pattern-based access control
 */
export class WorkspacePathValidator {
  private readonly maxFileSize: number;
  private readonly blockedPatterns: string[];
  private readonly allowedPatterns: string[];

  constructor(
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    blockedPatterns: string[] = [],
    allowedPatterns: string[] = ['**/*']
  ) {
    this.maxFileSize = maxFileSize;
    this.blockedPatterns = [
      // Security-critical patterns (always blocked)
      '**/.env*',
      '**/secrets/**',
      '**/.aws/**',
      '**/.ssh/**',
      '**/id_rsa*',
      '**/id_ed25519*',
      '**/.gnupg/**',
      '**/token*',
      '**/api_key*',
      '**/private_key*',
      '**/.credentials',
      '**/*.db',
      '**/*.sqlite*',
      '**/System Volume Information/**',
      '**/$RECYCLE.BIN/**',
      '**/.DS_Store',
      
      // Build artifacts (configurable via custom patterns)
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/coverage/**',
      '**/.nyc_output/**',
      '**/logs/**',
      '**/*.log',
      
      // VCS directories
      '**/.git/**',
      '**/.svn/**',
      '**/.hg/**',
      
      // Custom blocked patterns
      ...blockedPatterns
    ];
    this.allowedPatterns = allowedPatterns;
  }

  /**
   * Validate and resolve a requested file path against project root
   * Returns canonical path if allowed, or security violation details
   */
  async validatePath(projectRoot: string, requestedPath: string): Promise<PathSecurityResult> {
    try {
      // Step 1: Resolve canonical paths to prevent traversal attacks
      const canonicalProjectRoot = await fs.realpath(projectRoot);
      const requestedAbsolute = path.resolve(canonicalProjectRoot, requestedPath);
      const canonicalRequested = await fs.realpath(requestedAbsolute).catch(() => requestedAbsolute);

      // Step 2: Ensure requested path is within project boundaries
      if (!canonicalRequested.startsWith(canonicalProjectRoot + path.sep) && 
          canonicalRequested !== canonicalProjectRoot) {
        return {
          allowed: false,
          reason: 'Path traversal attempt detected'
        };
      }

      // Step 3: Convert to relative path for pattern matching
      const relativePath = path.relative(canonicalProjectRoot, canonicalRequested);

      // Step 4: Check against blocked patterns (security-first approach)
      for (const pattern of this.blockedPatterns) {
        if (isMatch(relativePath, pattern)) {
          return {
            allowed: false,
            reason: `Path matches blocked pattern: ${pattern}`
          };
        }
      }

      // Step 5: Check against allowed patterns
      // Note: Empty relativePath means the project root itself, which should always be allowed
      // (listing the root directory is a valid operation)
      const isAllowed = relativePath === '' || this.allowedPatterns.some(pattern => isMatch(relativePath, pattern));
      if (!isAllowed) {
        return {
          allowed: false,
          reason: 'Path does not match any allowed patterns'
        };
      }

      return {
        allowed: true,
        canonicalPath: canonicalRequested
      };

    } catch (error) {
      return {
        allowed: false,
        reason: `Path validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get file metadata with binary detection using fs.open() + read() API
   */
  async getFileMetadata(filePath: string): Promise<FileMetadata> {
    const stats = await fs.stat(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    let isBinary = false;
    if (stats.isFile() && stats.size > 0) {
      isBinary = await this.detectBinary(filePath);
    }

    return {
      path: filePath,
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isBinary,
      mtime: stats.mtime,
      extension
    };
  }

  /**
   * Binary file detection using proper fs.open() + read() API
   * Checks first 1024 bytes for null bytes (binary indicator)
   */
  private async detectBinary(filePath: string): Promise<boolean> {
    let fileHandle: fs.FileHandle | null = null;
    
    try {
      fileHandle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(1024);
      const { bytesRead } = await fileHandle.read(buffer, 0, 1024, 0);
      
      // Check for null bytes in the read content
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      // If we can't read the file, assume it's binary to be safe
      return true;
    } finally {
      if (fileHandle) {
        await fileHandle.close();
      }
    }
  }

  /**
   * Check if file size is within allowed limits
   */
  async validateFileSize(filePath: string): Promise<PathSecurityResult> {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size > this.maxFileSize) {
        return {
          allowed: false,
          reason: `File size (${stats.size} bytes) exceeds maximum allowed (${this.maxFileSize} bytes)`
        };
      }

      return { allowed: true };
    } catch (error) {
      return {
        allowed: false,
        reason: `File size validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * List directory contents with security filtering
   */
  async listDirectory(projectRoot: string, requestedPath: string): Promise<{
    files: FileMetadata[];
    totalCount: number;
    filteredCount: number;
  }> {
    const pathValidation = await this.validatePath(projectRoot, requestedPath);
    if (!pathValidation.allowed || !pathValidation.canonicalPath) {
      throw new Error(pathValidation.reason || 'Path validation failed');
    }

    const entries = await fs.readdir(pathValidation.canonicalPath, { withFileTypes: true });
    const files: FileMetadata[] = [];
    let filteredCount = 0;

    for (const entry of entries) {
      const entryPath = path.join(requestedPath, entry.name);
      const entryValidation = await this.validatePath(projectRoot, entryPath);
      
      if (entryValidation.allowed && entryValidation.canonicalPath) {
        try {
          const metadata = await this.getFileMetadata(entryValidation.canonicalPath);
          files.push(metadata);
        } catch (error) {
          // Skip files we can't read
          filteredCount++;
        }
      } else {
        filteredCount++;
      }
    }

    return {
      files,
      totalCount: entries.length,
      filteredCount
    };
  }
}

// Export singleton instance with default configuration
export const workspacePathValidator = new WorkspacePathValidator();