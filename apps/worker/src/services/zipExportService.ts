import archiver from 'archiver';
import { createReadStream, promises as fs } from 'fs';
import { PassThrough, Readable } from 'stream';
import path from 'path';
import crypto from 'crypto';
import glob from 'fast-glob';
import type { ExportProgress, FileFilterOptions, FileSecurityCheck } from '../types/projectExport';

/**
 * Service for creating secure ZIP exports of project files
 * Includes security checks, file filtering, and progress tracking
 */
export class ZipExportService {
  private readonly DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly DEFAULT_MAX_TOTAL_FILES = 10000;
  private readonly DEFAULT_MAX_ARCHIVE_SIZE = 1024 * 1024 * 1024; // 1GB
  private readonly COMPRESSION_LEVEL = 6; // Default compression

  // Security patterns - files that should never be exported
  private readonly SECURITY_BLOCKED_PATTERNS = [
    // Credentials and secrets
    '**/.env*',
    '**/secrets/**',
    '**/.aws/**',
    '**/.ssh/**',
    '**/id_rsa*',
    '**/id_ed25519*',
    '**/.gnupg/**',
    
    // API keys and tokens
    '**/token*',
    '**/api_key*',
    '**/private_key*',
    '**/.credentials',
    
    // Database files
    '**/*.db',
    '**/*.sqlite*',
    '**/*.mdb',
    
    // System files
    '**/System Volume Information/**',
    '**/$RECYCLE.BIN/**',
    '**/Thumbs.db',
    '**/.DS_Store',
    '**/desktop.ini',
    
    // Large binary files that shouldn't be in source
    '**/*.dmg',
    '**/*.iso',
    '**/*.img',
    '**/*.exe',
    '**/*.msi',
    
    // Internal project files
    '**/.sheenapps-project/**'
  ];

  // VCS and build artifacts to exclude by default
  private readonly VCS_PATTERNS = [
    '**/.git/**',
    '**/.svn/**',
    '**/.hg/**',
    '**/.bzr/**',
    '**/CVS/**',
    '**/.gitignore',
    '**/.gitattributes',
    '**/.gitmodules'
  ];

  private readonly BUILD_ARTIFACTS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/coverage/**',
    '**/.nyc_output/**',
    '**/logs/**',
    '**/*.log',
    '**/tmp/**',
    '**/temp/**'
  ];

  /**
   * Create ZIP export stream for project files
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async createZipStream(
    projectPath: string,
    options: FileFilterOptions = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<{
    stream: Readable;
    metadata: {
      totalFiles: number;
      estimatedSize: number;
      compressionRatio?: number | undefined;
    };
  }> {
    // Validate project path
    const resolvedPath = path.resolve(projectPath);
    await this.validateProjectPath(resolvedPath);

    // Build file list with security checks
    const files = await this.buildFileList(resolvedPath, options);
    
    if (files.length === 0) {
      throw new Error('No files found to export');
    }

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: this.COMPRESSION_LEVEL }
    });

    const passThrough = new PassThrough();
    let processedFiles = 0;
    let totalBytesRead = 0;
    let totalBytesWritten = 0;

    // Track compression ratio
    archive.on('progress', (progress) => {
      totalBytesRead = progress.entries.total;
      totalBytesWritten = progress.entries.processed;
      
      if (onProgress) {
        onProgress({
          phase: 'compressing',
          filesScanned: files.length,
          bytesWritten: totalBytesWritten,
          estimatedTotalFiles: files.length,
          currentFile: files[processedFiles]?.relativePath
        });
      }
    });

    // Error handling with backpressure control
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      passThrough.destroy(err);
    });

    // Pipe archive to pass-through stream
    archive.pipe(passThrough);

    // Add files to archive
    for (const fileInfo of files) {
      try {
        const fileStream = createReadStream(fileInfo.absolutePath);
        
        // Add file to archive with Windows-safe path
        const archivePath = fileInfo.relativePath.replace(/\\/g, '/');
        archive.append(fileStream, { 
          name: archivePath,
          date: fileInfo.stats?.mtime || new Date()
        });

        processedFiles++;

        // Progress callback
        if (onProgress) {
          onProgress({
            phase: 'scanning',
            filesScanned: processedFiles,
            bytesWritten: totalBytesWritten,
            estimatedTotalFiles: files.length,
            currentFile: fileInfo.relativePath
          });
        }

        // Check for zip bomb prevention
        if (totalBytesWritten > this.DEFAULT_MAX_ARCHIVE_SIZE) {
          const compressionRatio = totalBytesRead > 0 ? totalBytesWritten / totalBytesRead : 0;
          if (compressionRatio > 10) { // Suspicious compression ratio
            throw new Error('Export cancelled: suspicious compression ratio detected');
          }
        }

      } catch (error) {
        console.error(`Failed to add file ${fileInfo.relativePath}:`, error);
        // Continue with other files, don't fail entire export
      }
    }

    // Finalize archive
    archive.finalize();

    // Calculate estimated size
    const estimatedSize = files.reduce((total, file) => total + (file.stats?.size || 0), 0);

    return {
      stream: passThrough,
      metadata: {
        totalFiles: files.length,
        estimatedSize,
        compressionRatio: totalBytesRead > 0 ? totalBytesWritten / totalBytesRead : undefined
      }
    };
  }

  /**
   * Build list of files to include in export with security checks
   */
  private async buildFileList(
    projectPath: string,
    options: FileFilterOptions
  ): Promise<Array<{
    absolutePath: string;
    relativePath: string;
    stats?: any;
  }>> {
    const maxFileSize = options.maxFileSize || this.DEFAULT_MAX_FILE_SIZE;
    const maxTotalFiles = options.maxTotalFiles || this.DEFAULT_MAX_TOTAL_FILES;

    // Build ignore patterns
    const ignorePatterns = [
      ...this.SECURITY_BLOCKED_PATTERNS, // Always blocked
      ...this.VCS_PATTERNS,
      ...(options.includeNodeModules ? [] : ['**/node_modules/**']),
      ...(options.includeDotFiles ? [] : ['**/.*']),
      ...this.BUILD_ARTIFACTS,
      ...(options.blockedPatterns || [])
    ];

    // Build include patterns
    const includePatterns = ['**/*'];

    // Use fast-glob to find files
    const globOptions = {
      cwd: projectPath,
      ignore: ignorePatterns,
      dot: options.includeDotFiles || false,
      followSymbolicLinks: false, // Security: don't follow symlinks
      markDirectories: false,
      onlyFiles: true,
      absolute: false,
      stats: true
    };

    try {
      const globResults = await glob(includePatterns, globOptions);
      const files: Array<{
        absolutePath: string;
        relativePath: string;
        stats?: any;
      }> = [];

      let totalSize = 0;

      for (const globResult of globResults) {
        if (files.length >= maxTotalFiles) {
          console.warn(`Reached maximum file limit (${maxTotalFiles}), stopping scan`);
          break;
        }

        const relativePath = typeof globResult === 'string' ? globResult : (globResult as any).path;
        const absolutePath = path.join(projectPath, relativePath);
        const stats = typeof globResult === 'object' ? (globResult as any).stats : null;

        // Additional security checks
        const securityCheck = this.performSecurityCheck(absolutePath, relativePath);
        if (!securityCheck.allowed) {
          console.log(`Blocked file: ${relativePath} - ${securityCheck.reason}`);
          continue;
        }

        // File size check
        const fileSize = stats?.size || 0;
        if (fileSize > maxFileSize) {
          console.log(`Skipping large file: ${relativePath} (${fileSize} bytes)`);
          continue;
        }

        // Extension filtering
        if (options.allowedExtensions?.length) {
          const ext = path.extname(relativePath).toLowerCase();
          if (!options.allowedExtensions.includes(ext)) {
            continue;
          }
        }

        if (options.blockedExtensions?.length) {
          const ext = path.extname(relativePath).toLowerCase();
          if (options.blockedExtensions.includes(ext)) {
            continue;
          }
        }

        totalSize += fileSize;
        files.push({
          absolutePath,
          relativePath,
          stats
        });
      }

      console.log(`Found ${files.length} files for export (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
      return files;

    } catch (error) {
      console.error('Failed to build file list:', error);
      throw new Error(`Failed to scan project files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform additional security checks on file paths
   */
  private performSecurityCheck(absolutePath: string, relativePath: string): FileSecurityCheck {
    // Path traversal prevention
    if (relativePath.includes('..') || relativePath.includes('~')) {
      return {
        path: relativePath,
        allowed: false,
        reason: 'Path traversal attempt detected'
      };
    }

    // Windows path validation
    if (process.platform === 'win32') {
      // Check for Windows reserved names
      const baseName = path.basename(relativePath, path.extname(relativePath)).toUpperCase();
      const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
      
      if (reservedNames.includes(baseName)) {
        return {
          path: relativePath,
          allowed: false,
          reason: 'Windows reserved filename'
        };
      }

      // Check for invalid Windows characters
      if (/[<>:"|?*\x00-\x1f]/.test(relativePath)) {
        return {
          path: relativePath,
          allowed: false,
          reason: 'Invalid Windows filename characters'
        };
      }
    }

    // Normalize and check for hidden system files
    const normalizedPath = path.normalize(relativePath).toLowerCase();
    
    // Check against security patterns
    for (const pattern of this.SECURITY_BLOCKED_PATTERNS) {
      // Simple pattern matching (could be enhanced with proper glob matching)
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.')
        .toLowerCase();
      
      if (new RegExp(regexPattern).test(normalizedPath)) {
        return {
          path: relativePath,
          allowed: false,
          reason: `Matches security block pattern: ${pattern}`
        };
      }
    }

    // Additional checks for suspicious filenames
    const suspicious = [
      'password', 'secret', 'private', 'credential',
      'token', 'key', 'auth', 'cert', 'pem'
    ];

    for (const keyword of suspicious) {
      if (normalizedPath.includes(keyword)) {
        return {
          path: relativePath,
          allowed: false,
          reason: `Contains suspicious keyword: ${keyword}`
        };
      }
    }

    return {
      path: relativePath,
      allowed: true
    };
  }

  /**
   * Validate project path exists and is accessible
   */
  private async validateProjectPath(projectPath: string): Promise<void> {
    try {
      const stats = await fs.stat(projectPath);
      
      if (!stats.isDirectory()) {
        throw new Error('Project path is not a directory');
      }

      // Test read access
      await fs.access(projectPath, fs.constants.R_OK);
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const nodeError = error as NodeJS.ErrnoException;
        
        if (nodeError.code === 'ENOENT') {
          throw new Error('Project directory does not exist');
        }
        if (nodeError.code === 'EACCES') {
          throw new Error('Access denied to project directory');
        }
      }
      
      throw new Error(`Cannot access project directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate file integrity hash
   */
  async generateArchiveHash(archiveStream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      
      archiveStream.on('data', (chunk) => {
        hash.update(chunk);
      });
      
      archiveStream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      archiveStream.on('error', reject);
    });
  }

  /**
   * Get default filter options for export
   */
  getDefaultFilterOptions(): FileFilterOptions {
    return {
      includeDotFiles: false,
      includeNodeModules: false,
      maxFileSize: this.DEFAULT_MAX_FILE_SIZE,
      maxTotalFiles: this.DEFAULT_MAX_TOTAL_FILES,
      blockedExtensions: ['.exe', '.dmg', '.iso', '.img'],
      blockedPatterns: []
    };
  }

  /**
   * Create a safe filename for the export
   */
  createSafeFilename(projectId: string, versionId?: string, timestamp?: Date): string {
    const date = timestamp || new Date();
    const dateStr = date.toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const version = versionId ? `-${versionId.slice(0, 8)}` : '';
    
    return `project-${projectId}${version}-${dateStr}.zip`;
  }

  /**
   * Validate compression ratio to prevent zip bombs
   */
  validateCompressionRatio(originalSize: number, compressedSize: number): boolean {
    if (originalSize === 0) return true;
    
    const ratio = compressedSize / originalSize;
    const maxRatio = 10; // Maximum acceptable compression ratio
    
    return ratio <= maxRatio;
  }
}

// Export singleton instance
export const zipExportService = new ZipExportService();