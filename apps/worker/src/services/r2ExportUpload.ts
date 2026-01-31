import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable, PassThrough } from 'stream';
import crypto from 'crypto';

/**
 * R2/S3 service for export file uploads and downloads
 * Handles streaming uploads, signed URL generation, and lifecycle management
 */
export class R2ExportUploadService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    const endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
    const region = process.env.R2_REGION || process.env.AWS_REGION || 'auto';
    this.bucket = process.env.R2_BUCKET || process.env.S3_BUCKET || '';

    if (!endpoint || !this.bucket) {
      throw new Error('R2/S3 configuration missing: R2_ENDPOINT and R2_BUCKET required');
    }

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || ''
      },
      forcePathStyle: true // Required for R2 compatibility
    });
  }

  /**
   * Generate R2 key for export file
   */
  generateR2Key(userId: string, projectId: string, jobId: string, exportType: string = 'zip'): string {
    const timestamp = Date.now();
    const hash = crypto.createHash('sha256')
      .update(`${userId}:${projectId}:${jobId}:${timestamp}`)
      .digest('hex')
      .substring(0, 16);
    
    return `exports/${userId}/${projectId}/${jobId}_${hash}.${exportType}`;
  }

  /**
   * Upload stream to R2/S3 with metadata
   */
  async uploadStream(
    stream: Readable,
    r2Key: string,
    metadata: {
      userId: string;
      projectId: string;
      jobId: string;
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      versionId?: string | undefined;
      fileCount?: number | undefined;
      originalSize?: number | undefined;
      contentType?: string | undefined;
    }
  ): Promise<{
    r2Key: string;
    size: number;
    etag: string;
    uploadId: string;
  }> {
    try {
      // Create readable stream with size tracking
      const sizeTracker = new PassThrough();
      let uploadedBytes = 0;

      sizeTracker.on('data', (chunk) => {
        uploadedBytes += chunk.length;
      });

      // Pipe original stream through size tracker
      stream.pipe(sizeTracker);

      const uploadParams = {
        Bucket: this.bucket,
        Key: r2Key,
        Body: sizeTracker,
        ContentType: metadata.contentType || 'application/zip',
        Metadata: {
          'user-id': metadata.userId,
          'project-id': metadata.projectId,
          'job-id': metadata.jobId,
          'version-id': metadata.versionId || 'latest',
          'file-count': metadata.fileCount?.toString() || '0',
          'original-size': metadata.originalSize?.toString() || '0',
          'created-at': new Date().toISOString(),
          'export-source': 'sheenapps-claude-worker'
        },
        // Set content disposition for downloads
        ContentDisposition: `attachment; filename="project-export-${metadata.projectId}.zip"`,
        // Cache control for export files (24-48 hours)
        CacheControl: 'private, max-age=172800', // 48 hours
        // Lifecycle management via metadata
        TaggingDirective: 'REPLACE',
        Tagging: `lifecycle=export&retention=48h&user=${metadata.userId}`
      };

      const command = new PutObjectCommand(uploadParams);
      const result = await this.s3Client.send(command);

      // Wait for stream to finish to get final size
      await new Promise<void>((resolve, reject) => {
        sizeTracker.on('end', resolve);
        sizeTracker.on('error', reject);
      });

      return {
        r2Key,
        size: uploadedBytes,
        etag: result.ETag || '',
        uploadId: crypto.randomUUID() // Generate unique ID for tracking
      };

    } catch (error) {
      console.error('R2 upload failed:', error);
      throw new Error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate signed download URL
   */
  async generateSignedDownloadUrl(
    r2Key: string,
    expiresInSeconds: number = 3600,
    fileName?: string
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: r2Key,
        // Override content disposition if custom filename provided
        ...(fileName && {
          ResponseContentDisposition: `attachment; filename="${fileName}"`
        })
      });

      // Cap expiration to maximum 24 hours for security
      const maxExpiration = 24 * 60 * 60; // 24 hours
      const expiration = Math.min(expiresInSeconds, maxExpiration);

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiration
      });

      return signedUrl;
    } catch (error) {
      console.error('Failed to generate signed URL:', error);
      throw new Error(`Failed to generate download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if export file exists
   */
  async fileExists(r2Key: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: r2Key
      });

      // Just check HEAD to see if object exists
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(r2Key: string): Promise<{
    size: number;
    lastModified: Date;
    etag: string;
    contentType: string;
    metadata: Record<string, string>;
  } | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: r2Key
      });

      const response = await this.s3Client.send(command);

      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag || '',
        contentType: response.ContentType || 'application/octet-stream',
        metadata: response.Metadata || {}
      };
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete export file (for cleanup)
   */
  async deleteFile(r2Key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: r2Key
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return true; // Already deleted
      }
      console.error(`Failed to delete ${r2Key}:`, error);
      return false;
    }
  }

  /**
   * Create multipart upload for large files
   */
  async createMultipartUpload(
    r2Key: string,
    metadata: Record<string, string>
  ): Promise<string> {
    try {
      const { CreateMultipartUploadCommand } = await import('@aws-sdk/client-s3');
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: r2Key,
        ContentType: 'application/zip',
        Metadata: metadata,
        ContentDisposition: `attachment; filename="export.zip"`,
        CacheControl: 'private, max-age=172800'
      });

      const result = await this.s3Client.send(command);
      return result.UploadId || '';
    } catch (error) {
      console.error('Failed to create multipart upload:', error);
      throw error;
    }
  }

  /**
   * Upload single part for multipart upload
   */
  async uploadPart(
    r2Key: string,
    uploadId: string,
    partNumber: number,
    data: Buffer
  ): Promise<{ etag: string; partNumber: number }> {
    try {
      const { UploadPartCommand } = await import('@aws-sdk/client-s3');
      const command = new UploadPartCommand({
        Bucket: this.bucket,
        Key: r2Key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: data
      });

      const result = await this.s3Client.send(command);
      return {
        etag: result.ETag || '',
        partNumber
      };
    } catch (error) {
      console.error(`Failed to upload part ${partNumber}:`, error);
      throw error;
    }
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    r2Key: string,
    uploadId: string,
    parts: Array<{ etag: string; partNumber: number }>
  ): Promise<string> {
    try {
      const { CompleteMultipartUploadCommand } = await import('@aws-sdk/client-s3');
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: r2Key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map(part => ({
            ETag: part.etag,
            PartNumber: part.partNumber
          }))
        }
      });

      const result = await this.s3Client.send(command);
      return result.Location || '';
    } catch (error) {
      console.error('Failed to complete multipart upload:', error);
      throw error;
    }
  }

  /**
   * Abort multipart upload (cleanup)
   */
  async abortMultipartUpload(r2Key: string, uploadId: string): Promise<void> {
    try {
      const { AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: r2Key,
        UploadId: uploadId
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('Failed to abort multipart upload:', error);
      // Don't throw - this is cleanup
    }
  }

  /**
   * List and clean up old export files
   */
  async cleanupExpiredExports(): Promise<number> {
    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: 'exports/',
        MaxKeys: 1000
      });

      const response = await this.s3Client.send(command);
      const now = new Date();
      const maxAge = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
      let deletedCount = 0;

      if (response.Contents) {
        const expiredObjects = response.Contents.filter(obj => {
          if (!obj.LastModified) return false;
          return (now.getTime() - obj.LastModified.getTime()) > maxAge;
        });

        // Delete expired objects
        for (const obj of expiredObjects) {
          if (obj.Key) {
            const deleted = await this.deleteFile(obj.Key);
            if (deleted) {
              deletedCount++;
            }
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} expired export files from R2`);
      }

      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup expired exports:', error);
      return 0;
    }
  }

  /**
   * Validate R2 configuration
   */
  async testConnection(): Promise<boolean> {
    try {
      const { ListBucketsCommand } = await import('@aws-sdk/client-s3');
      const command = new ListBucketsCommand({});
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      console.error('R2 connection test failed:', error);
      return false;
    }
  }

  /**
   * Get upload progress estimate
   */
  createUploadProgressTracker(onProgress: (bytesUploaded: number, totalBytes?: number) => void) {
    return new PassThrough({
      transform(chunk, encoding, callback) {
        onProgress(chunk.length);
        callback(null, chunk);
      }
    });
  }
}

// Export singleton instance
export const r2ExportUpload = new R2ExportUploadService();