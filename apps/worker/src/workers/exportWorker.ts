import { Worker, Job, Queue } from 'bullmq';
import { exportJobsService } from '../services/exportJobsService';
import { zipExportService } from '../services/zipExportService';
import { r2ExportUpload } from '../services/r2ExportUpload';
import type { ExportQueueJob, ExportQueueResult, ExportProgress } from '../types/projectExport';
import path from 'path';
import { PassThrough } from 'stream';
import crypto from 'crypto';

/**
 * Bull queue worker for processing export jobs asynchronously
 * Handles the full export pipeline: scanning -> zipping -> uploading
 */
export class ExportWorker {
  private worker: Worker;
  private queue: Queue<ExportQueueJob, ExportQueueResult>;
  private redisConnection: any;

  constructor() {
    // Redis connection configuration
    this.redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
    };

    // Create queue
    this.queue = new Queue('project-exports', {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Create worker with concurrency limit
    this.worker = new Worker(
      'project-exports',
      async (job: Job<ExportQueueJob>) => {
        return this.processExportJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency: parseInt(process.env.EXPORT_WORKER_CONCURRENCY || '3'), // Max 3 simultaneous exports
        limiter: {
          max: parseInt(process.env.EXPORT_WORKER_MAX_JOBS || '50'), // 50 jobs per second max
          duration: 1000,
        },
      }
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      console.log(`Export job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Export job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (err) => {
      console.error('Export worker error:', err);
    });

    console.log('Export worker started with concurrency:', this.worker.opts.concurrency);
  }

  /**
   * Add export job to queue
   */
  async addExportJob(jobData: ExportQueueJob): Promise<string> {
    const job = await this.queue.add('export-project', jobData, {
      jobId: jobData.jobId, // Use export job ID as Bull job ID
      delay: 0,
      priority: 1, // Normal priority
    });

    console.log(`Added export job ${jobData.jobId} to queue`);
    return job.id || jobData.jobId;
  }

  /**
   * Process individual export job
   */
  private async processExportJob(job: Job<ExportQueueJob>): Promise<ExportQueueResult> {
    const { jobId, projectId, userId, versionId, exportType, options } = job.data;
    
    console.log(`Processing export job ${jobId} for project ${projectId}`);

    try {
      // Update job status to processing
      await exportJobsService.updateExportJob(jobId, {
        status: 'processing',
        startedAt: new Date(),
        progress: {
          phase: 'scanning',
          filesScanned: 0,
          bytesWritten: 0
        }
      });

      // Determine project path
      const projectPath = this.getProjectPath(projectId, versionId);
      
      // Progress callback to update database
      const onProgress = async (progress: ExportProgress) => {
        await exportJobsService.updateExportJob(jobId, { progress });
        
        // Update Bull job progress for monitoring
        if (progress.filesScanned > 0) {
          const percentage = progress.estimatedTotalFiles 
            ? Math.round((progress.filesScanned / progress.estimatedTotalFiles) * 100)
            : 0;
          await job.updateProgress(percentage);
        }
      };

      // Step 1: Create ZIP stream
      await onProgress({
        phase: 'scanning',
        filesScanned: 0,
        bytesWritten: 0,
        message: 'Scanning project files...'
      });

      const { stream: zipStream, metadata } = await zipExportService.createZipStream(
        projectPath,
        options,
        onProgress
      );

      // Generate R2 key
      const r2Key = r2ExportUpload.generateR2Key(userId, projectId, jobId, exportType);

      // Step 2: Upload to R2 with progress tracking
      await onProgress({
        phase: 'uploading',
        filesScanned: metadata.totalFiles,
        bytesWritten: 0,
        estimatedTotalFiles: metadata.totalFiles,
        message: 'Uploading to cloud storage...'
      });

      let uploadedBytes = 0;
      const progressTracker = r2ExportUpload.createUploadProgressTracker((bytes) => {
        uploadedBytes += bytes;
      });

      // Create pass-through for both progress tracking and hash generation
      const hashStream = new PassThrough();
      const uploadStream = new PassThrough();

      // Pipe zip stream to both hash and upload streams
      zipStream.pipe(hashStream);
      hashStream.pipe(progressTracker);
      progressTracker.pipe(uploadStream);

      // Upload to R2
      const uploadResultPromise = r2ExportUpload.uploadStream(
        uploadStream,
        r2Key,
        {
          userId,
          projectId,
          jobId,
          versionId,
          fileCount: metadata.totalFiles,
          originalSize: metadata.estimatedSize,
          contentType: 'application/zip'
        }
      );

      // Generate hash for integrity
      const hashPromise = zipExportService.generateArchiveHash(hashStream);

      // Enhanced error handling with archiver backpressure
      const uploadP = uploadResultPromise.catch(err => {
        // Stop the zip stream if upload fails
        if (zipStream.destroy) {
          zipStream.destroy();
        }
        if (hashStream.destroy) {
          hashStream.destroy();
        }
        throw err;
      });

      // Wait for both upload and hash generation
      const [uploadResult, exportHash] = await Promise.all([uploadP, hashPromise]);

      // Calculate compression ratio
      const compressionRatio = metadata.estimatedSize > 0 
        ? uploadResult.size / metadata.estimatedSize 
        : 0;

      // Validate compression ratio for zip bomb detection
      if (!zipExportService.validateCompressionRatio(metadata.estimatedSize, uploadResult.size)) {
        throw new Error('Export failed: suspicious compression ratio detected');
      }

      // Step 3: Update job as completed
      await exportJobsService.updateExportJob(jobId, {
        status: 'completed',
        completedAt: new Date(),
        r2Key,
        uncompressedSizeBytes: metadata.estimatedSize,
        fileCount: metadata.totalFiles,
        zipSizeBytes: uploadResult.size,
        compressionRatio,
        exportHash,
        progress: {
          phase: 'completed',
          filesScanned: metadata.totalFiles,
          bytesWritten: uploadResult.size,
          estimatedTotalFiles: metadata.totalFiles,
          message: 'Export completed successfully'
        }
      });

      console.log(`Export job ${jobId} completed: ${metadata.totalFiles} files, ${(uploadResult.size / 1024 / 1024).toFixed(2)}MB`);

      return {
        success: true,
        r2Key,
        zipSizeBytes: uploadResult.size,
        fileCount: metadata.totalFiles,
        compressionRatio,
        exportHash
      };

    } catch (error) {
      console.error(`Export job ${jobId} failed:`, error);

      // Update job as failed
      await exportJobsService.updateExportJob(jobId, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        retryCount: (job.attemptsMade || 0)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get project file path based on project ID and version
   */
  private getProjectPath(projectId: string, versionId?: string): string {
    // This should be configured based on your project storage structure
    const baseProjectsPath = process.env.PROJECTS_BASE_PATH || '/tmp/projects';
    
    if (versionId) {
      // Path to specific version
      return path.join(baseProjectsPath, projectId, 'versions', versionId);
    } else {
      // Path to latest/current version
      return path.join(baseProjectsPath, projectId, 'current');
    }
  }

  /**
   * Get queue status and metrics
   */
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
      this.queue.getCompleted(),
      this.queue.getFailed(),
      this.queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Get job details by ID
   */
  async getJob(jobId: string): Promise<Job<ExportQueueJob> | undefined> {
    return this.queue.getJob(jobId);
  }

  /**
   * Remove job from queue (cleanup)
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  /**
   * Pause queue processing
   */
  async pauseQueue(): Promise<void> {
    await this.queue.pause();
    console.log('Export queue paused');
  }

  /**
   * Resume queue processing
   */
  async resumeQueue(): Promise<void> {
    await this.queue.resume();
    console.log('Export queue resumed');
  }

  /**
   * Clean up old jobs
   */
  async cleanJobs(): Promise<void> {
    // Remove completed jobs older than 24 hours
    await this.queue.clean(24 * 60 * 60 * 1000, 100, 'completed');
    
    // Remove failed jobs older than 7 days
    await this.queue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed');
    
    console.log('Cleaned up old export jobs');
  }

  /**
   * Get worker health status
   */
  getWorkerHealth(): {
    isRunning: boolean;
    concurrency: number;
    processed: number;
    failed: number;
  } {
    return {
      isRunning: !this.worker.closing,
      concurrency: this.worker.opts.concurrency || 1,
      processed: (this.worker as any).processed || 0,
      failed: (this.worker as any).failed || 0,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down export worker...');
    
    // Close worker (waits for active jobs to complete)
    await this.worker.close();
    
    // Close queue connection
    await this.queue.close();
    
    console.log('Export worker shutdown complete');
  }
}

// Export singleton instance
export const exportWorker = new ExportWorker();

// Graceful shutdown on process termination
process.on('SIGTERM', () => {
  exportWorker.shutdown().then(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  exportWorker.shutdown().then(() => {
    process.exit(0);
  });
});