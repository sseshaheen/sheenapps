import { Worker, Job } from 'bullmq';
import { MigrationJobData } from '../queue/migrationQueue';
import { MigrationOrchestratorService } from '../services/migrationOrchestratorService';
import { unifiedLogger } from '../services/unifiedLogger';

const orchestrator = new MigrationOrchestratorService();

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

export const migrationWorker = new Worker<MigrationJobData>(
  'migrations',
  async (job: Job<MigrationJobData>) => {
    const { migrationId, userId } = job.data;

    unifiedLogger.system('startup', 'info', 'Migration job processing started', {
      migrationId,
      jobId: job.id,
      attempt: job.attemptsMade,
    });

    try {
      // CRITICAL: Claim lease to prevent concurrent execution
      const claimed = await orchestrator.claimMigrationLease(migrationId);
      if (!claimed) {
        unifiedLogger.system('startup', 'warn', 'Migration already claimed by another worker', {
          migrationId,
        });
        return { status: 'already_claimed' };
      }

      // Execute pipeline (with resume support)
      await orchestrator.executeMigrationPipeline(migrationId, userId);

      return { status: 'completed', migrationId };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Migration job failed', {
        migrationId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });

      // Mark as failed in DB
      await orchestrator.markMigrationFailed(migrationId, error as Error);

      throw error; // Let BullMQ handle retry logic
    } finally {
      // Always release lease (even on failure)
      await orchestrator.releaseMigrationLease(migrationId);
    }
  },
  {
    connection,
    concurrency: 2, // Max 2 concurrent migrations
    limiter: {
      max: 10,
      duration: 60000, // Max 10 jobs per minute
    },
  }
);

migrationWorker.on('completed', (job) => {
  unifiedLogger.system('startup', 'info', 'Migration job completed', {
    migrationId: job.data.migrationId,
    jobId: job.id,
    duration: Date.now() - job.processedOn!,
  });
});

migrationWorker.on('failed', (job, error) => {
  unifiedLogger.system('error', 'error', 'Migration job failed permanently', {
    migrationId: job?.data.migrationId,
    jobId: job?.id,
    attempts: job?.attemptsMade,
    error: error.message,
  });
});

migrationWorker.on('stalled', (jobId) => {
  unifiedLogger.system('error', 'warn', 'Migration job stalled', { jobId });
});
