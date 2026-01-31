import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { pool } from './database';
import { getWorkingDirectoryAuditor } from './workingDirectoryAudit';

interface GarbageCollectionResult {
  success: boolean;
  deletedCount: number;
  totalSize: number;
  skippedCount: number;
  errors: string[];
  duration: number;
}

interface OrphanedArtifact {
  key: string;
  size: number;
  lastModified: Date;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  versionId?: string | undefined;
  reason: string;
}

/**
 * R2 Garbage Collector Service
 * 
 * Prevents silent multi-terabyte growth by cleaning up orphaned artifacts.
 * Runs weekly to delete artifacts older than retention period that aren't actively used.
 */
export class R2GarbageCollector {
  private s3Client: S3Client;
  private bucketName: string;
  private auditor = getWorkingDirectoryAuditor();

  constructor() {
    this.bucketName = process.env.R2_BUCKET_NAME!;
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  /**
   * Run garbage collection - delete artifacts older than retention period
   */
  async run(retentionDays: number = 30): Promise<GarbageCollectionResult> {
    const startTime = Date.now();
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    console.log(`[R2 GC] Starting garbage collection - deleting artifacts older than ${retentionDays} days (${cutoffDate.toISOString()})`);

    try {
      // Find orphaned artifacts in R2
      const orphanedArtifacts = await this.findOrphanedArtifacts(cutoffDate);
      
      if (orphanedArtifacts.length === 0) {
        const duration = Date.now() - startTime;
        console.log(`[R2 GC] No orphaned artifacts found - storage is clean! (${duration}ms)`);
        
        await this.auditGarbageCollection({
          deletedCount: 0,
          totalSize: 0,
          skippedCount: 0,
          duration,
          retentionDays
        });

        return {
          success: true,
          deletedCount: 0,
          totalSize: 0,
          skippedCount: 0,
          errors: [],
          duration
        };
      }

      console.log(`[R2 GC] Found ${orphanedArtifacts.length} orphaned artifacts to delete`);

      // Delete orphaned artifacts
      let deletedCount = 0;
      let totalSize = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      for (const artifact of orphanedArtifacts) {
        try {
          await this.s3Client.send(new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: artifact.key
          }));
          
          deletedCount++;
          totalSize += artifact.size;
          
          console.log(`[R2 GC] Deleted: ${artifact.key} (${this.formatFileSize(artifact.size)}) - ${artifact.reason}`);
        } catch (error) {
          const errorMsg = `Failed to delete ${artifact.key}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          skippedCount++;
          console.error(`[R2 GC] ${errorMsg}`);
        }
      }

      const duration = Date.now() - startTime;
      const result = {
        success: errors.length === 0,
        deletedCount,
        totalSize,
        skippedCount,
        errors,
        duration
      };

      // Audit the garbage collection operation
      await this.auditGarbageCollection({
        ...result,
        retentionDays
      });

      console.log(`[R2 GC] Completed: ${deletedCount} deleted, ${this.formatFileSize(totalSize)} freed, ${skippedCount} skipped, ${errors.length} errors (${duration}ms)`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      console.error('[R2 GC] Garbage collection failed:', error);
      
      await this.auditGarbageCollection({
        deletedCount: 0,
        totalSize: 0,
        skippedCount: 0,
        duration,
        retentionDays,
        error: errorMsg
      });

      return {
        success: false,
        deletedCount: 0,
        totalSize: 0,
        skippedCount: 0,
        errors: [errorMsg],
        duration
      };
    }
  }

  /**
   * Find orphaned artifacts in R2 that are safe to delete
   */
  private async findOrphanedArtifacts(cutoffDate: Date): Promise<OrphanedArtifact[]> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    // Get all artifacts in R2
    const r2Objects = await this.listR2Objects();
    
    // Get all artifact URLs still referenced in database
    const dbResult = await pool.query(`
      SELECT DISTINCT artifact_url, version_id, created_at, is_published
      FROM project_versions_metadata 
      WHERE artifact_url IS NOT NULL 
        AND soft_deleted_at IS NULL
    `);
    
    const referencedUrls = new Set(dbResult.rows.map(row => row.artifact_url));
    const publishedVersions = new Set(
      dbResult.rows
        .filter(row => row.is_published)
        .map(row => row.version_id)
    );

    const orphanedArtifacts: OrphanedArtifact[] = [];

    for (const obj of r2Objects) {
      // Skip if not old enough
      if (obj.LastModified && obj.LastModified > cutoffDate) {
        continue;
      }

      // Reconstruct the artifact URL to check against database
      const artifactUrl = `https://${this.bucketName}/${obj.Key}`;
      
      let reason = '';
      let versionId: string | undefined;

      // Extract version ID from key if possible
      const keyMatch = obj.Key?.match(/artifacts\/(.+?)\/(.+?)\/(.+?)\.zip$/);
      if (keyMatch) {
        versionId = keyMatch[3];
      }

      // Determine why this artifact is orphaned
      if (!referencedUrls.has(artifactUrl)) {
        reason = 'Not referenced in database';
      } else if (versionId && publishedVersions.has(versionId)) {
        // Don't delete published versions even if old
        continue;
      } else {
        reason = `Older than ${Math.floor((Date.now() - cutoffDate.getTime()) / (24 * 60 * 60 * 1000))} days and not published`;
      }

      orphanedArtifacts.push({
        key: obj.Key!,
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        versionId,
        reason
      });
    }

    return orphanedArtifacts;
  }

  /**
   * List all objects in R2 bucket
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async listR2Objects(): Promise<Array<{ Key?: string | undefined; Size?: number | undefined; LastModified?: Date | undefined }>> {
    const objects: Array<{ Key?: string | undefined; Size?: number | undefined; LastModified?: Date | undefined }> = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'artifacts/', // Only scan artifact objects
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      });

      const response = await this.s3Client.send(command);
      
      if (response.Contents) {
        objects.push(...response.Contents);
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  /**
   * Audit garbage collection operations
   */
  private async auditGarbageCollection(details: {
    deletedCount: number;
    totalSize: number;
    skippedCount: number;
    duration: number;
    retentionDays: number;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    error?: string | undefined;
  }): Promise<void> {
    try {
      await this.auditor.logOperation({
        operation: 'r2_garbage_collection',
        success: !details.error,
        duration: details.duration,
        details: {
          deletedCount: details.deletedCount,
          totalSizeFreed: details.totalSize,
          skippedCount: details.skippedCount,
          retentionDays: details.retentionDays,
          error: details.error
        }
      });
    } catch (auditError) {
      console.error('[R2 GC] Failed to audit garbage collection:', auditError);
      // Don't fail the garbage collection if audit fails
    }
  }

  /**
   * Format file size for human-readable output
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

// Singleton instance
let r2GarbageCollector: R2GarbageCollector;

export function getR2GarbageCollector(): R2GarbageCollector {
  if (!r2GarbageCollector) {
    r2GarbageCollector = new R2GarbageCollector();
  }
  return r2GarbageCollector;
}