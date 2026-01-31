/**
 * Admin Restore Queue
 *
 * BullMQ queue for database restore operations.
 * Restores are long-running operations that should be queued
 * rather than run inline in request handlers.
 */

import { Queue, QueueEvents } from 'bullmq';

export interface RestoreJobData {
  restoreId: string;
  backupId: string;
  adminId: string;
}

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

const isTestMode = process.env.NODE_ENV === 'test';
const shouldCreateQueues = !isTestMode || process.env.USE_REDIS_IN_TEST === 'true';

export const adminRestoreQueue: Queue<RestoreJobData> | null = shouldCreateQueues
  ? new Queue<RestoreJobData>('admin-restores', {
      connection,
      defaultJobOptions: {
        attempts: 1, // Restores should not auto-retry - manual intervention needed
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    })
  : null;

export const adminRestoreQueueEvents: QueueEvents | null = shouldCreateQueues
  ? new QueueEvents('admin-restores', { connection })
  : null;

/**
 * Enqueue a restore job with idempotency
 */
export async function enqueueRestore(data: RestoreJobData): Promise<string> {
  if (!adminRestoreQueue) {
    throw new Error('Admin restore queue is not available');
  }

  const job = await adminRestoreQueue.add('restore.execute', data, {
    jobId: `restore:${data.restoreId}`, // Idempotent - same restoreId = same job
  });

  console.log(`[AdminRestoreQueue] Restore job enqueued: ${data.restoreId}, jobId: ${job.id}`);

  return job.id!;
}
