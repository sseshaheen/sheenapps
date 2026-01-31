import { Queue, QueueEvents } from 'bullmq';
import { unifiedLogger } from '../services/unifiedLogger';

export interface MigrationJobData {
  migrationId: string;
  userId: string;
  sourceUrl: string;
  userPrompt?: string;
}

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

// Create migration queue only if not in test mode or if Redis is expected
const isTestMode = process.env.NODE_ENV === 'test';
const shouldCreateQueues = !isTestMode || process.env.USE_REDIS_IN_TEST === 'true';

export const migrationQueue: Queue<MigrationJobData> | null = shouldCreateQueues ? new Queue<MigrationJobData>('migrations', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
}) : null;

export const migrationQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('migrations', { connection }) : null;

/**
 * Enqueue migration with idempotency
 * @param data - Migration job data
 * @returns Job ID
 */
export async function enqueueMigration(data: MigrationJobData): Promise<string> {
  if (!migrationQueue) {
    throw new Error('Migration queue is not available. This may happen in test mode without USE_REDIS_IN_TEST=true, or if Redis connection failed.');
  }

  const job = await migrationQueue.add(
    'migration.process',
    data,
    {
      jobId: `migration:${data.migrationId}`, // Idempotent - same migrationId = same job
      priority: 5, // Lower priority than builds (priority 10)
    }
  );

  unifiedLogger.system('startup', 'info', 'Migration job enqueued', {
    migrationId: data.migrationId,
    jobId: job.id,
  });

  return job.id!;
}
