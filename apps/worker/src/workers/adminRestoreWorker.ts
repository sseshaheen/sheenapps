/**
 * Admin Restore Worker
 *
 * BullMQ worker that processes database restore jobs.
 * This ensures restores complete even if the server restarts.
 */

import { Worker, Job } from 'bullmq';
import { RestoreJobData } from '../queue/adminRestoreQueue';
import { getInhouseRestoreService } from '../services/inhouse/InhouseRestoreService';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

const isTestMode = process.env.NODE_ENV === 'test';
const shouldCreateWorker = !isTestMode || process.env.USE_REDIS_IN_TEST === 'true';

export const adminRestoreWorker: Worker<RestoreJobData> | null = shouldCreateWorker
  ? new Worker<RestoreJobData>(
      'admin-restores',
      async (job: Job<RestoreJobData>) => {
        const { restoreId, backupId, adminId } = job.data;

        console.log(`[AdminRestoreWorker] Processing restore: ${restoreId}, backup: ${backupId}`);

        try {
          const restoreService = getInhouseRestoreService();

          // Check if restore is still pending (not already completed/failed)
          const result = await restoreService.getRestoreStatus(restoreId);
          if (!result) {
            console.warn(`[AdminRestoreWorker] Restore ${restoreId} not found, skipping`);
            return { status: 'not_found', restoreId };
          }

          const restoreStatus = result.restore.status;
          if (restoreStatus === 'completed') {
            console.log(`[AdminRestoreWorker] Restore ${restoreId} already completed`);
            return { status: 'already_completed', restoreId };
          }

          if (restoreStatus === 'failed') {
            console.log(`[AdminRestoreWorker] Restore ${restoreId} already failed`);
            return { status: 'already_failed', restoreId };
          }

          // Execute the restore
          await restoreService.executeRestore(restoreId);

          console.log(`[AdminRestoreWorker] Restore ${restoreId} completed successfully`);
          return { status: 'completed', restoreId };
        } catch (error) {
          console.error(`[AdminRestoreWorker] Restore ${restoreId} failed:`, error);

          // The restore service should mark the restore as failed internally
          // We just rethrow to let BullMQ record the failure
          throw error;
        }
      },
      {
        connection,
        concurrency: 1, // Only one restore at a time to avoid DB contention
      }
    )
  : null;

// Graceful shutdown
if (adminRestoreWorker) {
  process.on('SIGTERM', async () => {
    console.log('[AdminRestoreWorker] Shutting down gracefully...');
    await adminRestoreWorker.close();
  });
}
