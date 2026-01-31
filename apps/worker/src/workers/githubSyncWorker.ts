import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { GitHubSyncJobData, githubSyncQueue } from '../queue/modularQueues';
import { getGitHubSyncFromService } from '../services/githubSyncFromService';
import { getGitHubSyncToService } from '../services/githubSyncToService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { emitGitHubSyncEvent, GitHubSyncEvent } from '../services/eventService';
import { mapErrorToGitHubCode } from '../services/githubErrorService';

export class GitHubSyncWorker {
  private worker: Worker<GitHubSyncJobData> | undefined;
  private redis: Redis;
  private loggingService: ServerLoggingService;
  private syncFromService = getGitHubSyncFromService();
  private syncToService = getGitHubSyncToService();

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null, // Required for BullMQ
    });

    this.loggingService = ServerLoggingService.getInstance();
  }

  /**
   * Start the GitHub sync worker
   */
  async start(): Promise<void> {
    if (this.worker) {
      console.log('⚠️ GitHub sync worker already started');
      return;
    }

    // Only start if GitHub sync is enabled and configured
    if (!this.isGitHubSyncEnabled()) {
      console.log('⚠️ GitHub sync not configured, skipping worker startup');
      return;
    }

    try {
      this.worker = new Worker<GitHubSyncJobData>(
        'github-sync',
        async (job: Job<GitHubSyncJobData>) => this.processJob(job),
        {
          connection: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: null,
          },
          concurrency: parseInt(process.env.GITHUB_SYNC_CONCURRENCY || '2'), // Conservative concurrency
          limiter: {
            max: 5, // Max 5 sync operations per interval
            duration: 60000, // Per minute
          },
        }
      );

      this.setupEventHandlers();
      console.log('✅ GitHub sync worker started');

    } catch (error) {
      await this.loggingService.logCriticalError(
        'github_sync_worker_start_failed',
        error as Error,
        {}
      );
      throw error;
    }
  }

  /**
   * Stop the GitHub sync worker
   */
  async stop(): Promise<void> {
    if (!this.worker) {
      return;
    }

    try {
      console.log('🔄 Stopping GitHub sync worker...');
      await this.worker.close();
      await this.redis.quit();
      this.worker = undefined;
      console.log('✅ GitHub sync worker stopped');
    } catch (error) {
      await this.loggingService.logCriticalError(
        'github_sync_worker_stop_failed',
        error as Error,
        {}
      );
    }
  }

  /**
   * Process a GitHub sync job with GitHub SSE events
   */
  private async processJob(job: Job<GitHubSyncJobData>): Promise<void> {
    const { operation, projectId, deliveryId } = job.data;
    const operationId = job.id as string;
    const buildId = `github-${projectId}`;  // Use consistent buildId format

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Processing GitHub sync job',
      {
        jobId: job.id,
        jobName: job.name,
        operation,
        projectId,
        deliveryId,
        attempt: job.attemptsMade + 1
      }
    );

    // Expert requirement: Terminal event guarantee with try/catch/finally
    let result: any = null;
    let syncError: any = null;

    try {
      // Emit GitHub sync started event
      await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_STARTED, {
        operationId,
        projectId,
        direction: this.getDirectionFromOperation(operation),
        syncMode: 'protected_pr', // Default, will be updated by services
        jobName: job.name
      });

      // Update initial progress
      await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
        operationId,
        projectId,
        message: 'Initializing sync operation...',
        percent: 5
      });

      // Process the sync operation
      switch (job.name) {
        case 'sync-from-github':
          result = await this.syncFromService.processGitHubSyncJob(job);
          break;

        case 'sync-to-github':
          result = await this.syncToService.processGitHubSyncToJob(job);
          break;

        case 'process-github-sync':
          // Generic sync job - determine direction based on operation
          if (operation === 'pull' || operation === 'webhook') {
            result = await this.syncFromService.processGitHubSyncJob(job);
          } else if (operation === 'push') {
            result = await this.syncToService.processGitHubSyncToJob(job);
          } else {
            throw new Error(`Unknown GitHub sync operation: ${operation}`);
          }
          break;

        default:
          throw new Error(`Unknown GitHub sync job type: ${job.name}`);
      }

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub sync job completed successfully',
        {
          jobId: job.id,
          jobName: job.name,
          operation,
          projectId,
          processingTime: Date.now() - job.timestamp,
          result: result ? { 
            filesChanged: result.filesChanged || 0,
            commitSha: result.commitSha,
            prUrl: result.prUrl 
          } : null
        }
      );

    } catch (error: any) {
      syncError = error;
      
      await this.loggingService.logCriticalError(
        'github_sync_job_failed',
        error,
        {
          jobId: job.id,
          jobName: job.name,
          operation,
          projectId,
          deliveryId,
          attempt: job.attemptsMade + 1
        }
      );

    } finally {
      // Expert requirement: Terminal event guarantee - always emit completion or failure
      // IMPORTANT: Wrap event emission in try/catch to preserve original error
      if (syncError) {
        // Map error to standardized GitHub error
        const githubError = mapErrorToGitHubCode(syncError);

        try {
          await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_FAILED, {
            operationId,
            projectId,
            status: 'failed',
            error_code: githubError.error_code,
            message: githubError.error,
            retryable: githubError.retryable,
            retryAfter: githubError.retryAfter,
            recovery_url: githubError.recovery_url,
            details: {
              originalError: syncError.message,
              step: 'sync_operation',
              context: { operation, jobName: job.name }
            }
          });
        } catch (emitError) {
          // Log but don't mask the original error
          console.error('[GitHubSyncWorker] Failed to emit SYNC_FAILED event:', emitError);
        }

        // Re-throw to trigger BullMQ retry logic
        throw syncError;
      } else {
        // Emit successful completion - best effort
        try {
          await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_COMPLETED, {
            operationId,
            projectId,
            status: 'success',
            direction: this.getDirectionFromOperation(operation),
            filesChanged: result?.filesChanged || 0,
            insertions: result?.insertions,
            deletions: result?.deletions,
            commitSha: result?.commitSha,
            prUrl: result?.prUrl,
            branchName: result?.branchName,
            duration: Date.now() - job.timestamp
          });
        } catch (emitError) {
          console.error('[GitHubSyncWorker] Failed to emit SYNC_COMPLETED event:', emitError);
        }
      }
    }
  }

  /**
   * Helper to get sync direction from operation
   */
  private getDirectionFromOperation(operation?: string): 'to_github' | 'from_github' {
    if (operation === 'push') return 'to_github';
    if (operation === 'pull' || operation === 'webhook') return 'from_github';
    return 'from_github'; // Default fallback
  }

  /**
   * Setup event handlers for the worker
   */
  private setupEventHandlers(): void {
    if (!this.worker) return;

    // Job completed successfully
    this.worker.on('completed', async (job: Job<GitHubSyncJobData>) => {
      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub sync job completed',
        {
          jobId: job.id,
          jobName: job.name,
          projectId: job.data.projectId,
          processingTime: Date.now() - job.timestamp
        }
      );
    });

    // Job failed
    this.worker.on('failed', async (job: Job<GitHubSyncJobData> | undefined, error: Error) => {
      if (job) {
        await this.loggingService.logCriticalError(
          'github_sync_job_failed',
          error,
          {
            jobId: job.id,
            jobName: job.name,
            projectId: job.data.projectId,
            attempts: job.attemptsMade,
            maxAttempts: job.opts?.attempts || 3
          }
        );

        // If this was the final attempt, log as critical
        if (job.attemptsMade >= (job.opts?.attempts || 3)) {
          await this.loggingService.logServerEvent(
            'error',
            'error',
            'GitHub sync job permanently failed after all retries',
            {
              jobId: job.id,
              jobName: job.name,
              projectId: job.data.projectId,
              finalError: error.message
            }
          );
        }
      } else {
        await this.loggingService.logCriticalError(
          'github_sync_unknown_job_failed',
          error,
          {}
        );
      }
    });

    // Job stalled (taking too long)
    this.worker.on('stalled', async (jobId: string) => {
      await this.loggingService.logServerEvent(
        'error',
        'warn',
        'GitHub sync job stalled',
        { jobId }
      );
    });

    // Worker error
    this.worker.on('error', async (error: Error) => {
      await this.loggingService.logCriticalError(
        'github_sync_worker_error',
        error,
        {}
      );
    });

    // Worker ready
    this.worker.on('ready', async () => {
      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub sync worker ready',
        {}
      );
    });
  }

  /**
   * Check if GitHub sync is properly configured
   */
  private isGitHubSyncEnabled(): boolean {
    const requiredVars = [
      'GITHUB_APP_ID',
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_WEBHOOK_SECRET'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.log(`⚠️ GitHub sync disabled - missing environment variables: ${missingVars.join(', ')}`);
      return false;
    }

    // Check if GitHub sync is explicitly disabled
    if (process.env.GITHUB_SYNC_ENABLED === 'false') {
      console.log('⚠️ GitHub sync disabled via GITHUB_SYNC_ENABLED=false');
      return false;
    }

    return true;
  }

  /**
   * Get worker status
   */
  getStatus(): {
    running: boolean;
    configured: boolean;
    queueSize?: number;
    processing?: number;
  } {
    const configured = this.isGitHubSyncEnabled();
    
    return {
      running: !!this.worker,
      configured
    };
  }
}

// Singleton instance
let githubSyncWorkerInstance: GitHubSyncWorker | null = null;

/**
 * Get the singleton GitHub sync worker instance
 */
export function getGitHubSyncWorker(): GitHubSyncWorker {
  if (!githubSyncWorkerInstance) {
    githubSyncWorkerInstance = new GitHubSyncWorker();
  }
  return githubSyncWorkerInstance;
}

/**
 * Start the GitHub sync worker
 */
export async function startGitHubSyncWorker(): Promise<void> {
  const worker = getGitHubSyncWorker();
  await worker.start();
}

/**
 * Stop the GitHub sync worker
 */
export async function stopGitHubSyncWorker(): Promise<void> {
  if (githubSyncWorkerInstance) {
    await githubSyncWorkerInstance.stop();
    githubSyncWorkerInstance = null;
  }
}