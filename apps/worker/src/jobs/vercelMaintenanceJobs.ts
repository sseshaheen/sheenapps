import { CronJob } from 'cron';
import { getPool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';

// =============================================================================
// VERCEL MAINTENANCE JOBS
// =============================================================================
// Scheduled jobs for Vercel integration maintenance and cleanup

const WEBHOOK_CLEANUP_LOCK_ID = 67890; // Unique lock ID for webhook cleanup
const PARTITION_MANAGEMENT_LOCK_ID = 67891; // Unique lock ID for partition management

export class VercelWebhookCleanupJob {
  private cronJob: CronJob;
  private isRunning: boolean = false;
  private logger: ServerLoggingService;

  constructor() {
    this.logger = ServerLoggingService.getInstance();

    // Run daily at 2:00 AM UTC to clean up old webhook dedup records
    this.cronJob = new CronJob(
      '0 2 * * *',
      () => this.run(),
      null,
      false,
      'UTC'
    );
  }

  private async run(): Promise<void> {
    if (this.isRunning) {
      await this.logger.logServerEvent(
        'capacity',
        'warn',
        'Vercel webhook cleanup job already running, skipping'
      );
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    let deletedCount = 0;

    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Use PostgreSQL advisory lock to prevent concurrent execution
        const lockResult = await client.query(
          'SELECT pg_try_advisory_lock($1) as acquired',
          [WEBHOOK_CLEANUP_LOCK_ID]
        );

        if (!lockResult.rows[0].acquired) {
          await this.logger.logServerEvent(
            'capacity',
            'warn',
            'Could not acquire advisory lock for Vercel webhook cleanup'
          );
          return;
        }

        // Delete webhook dedup records older than 7 days
        const deleteResult = await client.query(`
          DELETE FROM vercel_webhook_dedup
          WHERE processed_at < NOW() - INTERVAL '7 days'
        `);

        deletedCount = deleteResult.rowCount || 0;

        await this.logger.logServerEvent(
          'capacity',
          'info',
          'Vercel webhook cleanup completed successfully',
          {
            deletedRecords: deletedCount,
            durationMs: Date.now() - startTime
          }
        );

        // Release the advisory lock
        await client.query('SELECT pg_advisory_unlock($1)', [WEBHOOK_CLEANUP_LOCK_ID]);

      } finally {
        client.release();
      }
    } catch (error) {
      await this.logger.logCriticalError(
        'vercel_webhook_cleanup_failed',
        error as Error,
        {
          durationMs: Date.now() - startTime,
          deletedCount
        }
      );
    } finally {
      this.isRunning = false;
    }
  }

  start(): void {
    this.cronJob.start();
    console.log('✅ Vercel webhook cleanup job started (daily at 2:00 AM UTC)');
  }

  stop(): void {
    this.cronJob.stop();
    console.log('⏹️  Vercel webhook cleanup job stopped');
  }

  getNextRun(): Date {
    return this.cronJob.nextDate().toJSDate();
  }

  isActive(): boolean {
    return this.cronJob.running;
  }
}

export class VercelPartitionMaintenanceJob {
  private cronJob: CronJob;
  private isRunning: boolean = false;
  private logger: ServerLoggingService;

  constructor() {
    this.logger = ServerLoggingService.getInstance();

    // Run monthly on the 1st at 3:00 AM UTC for partition management
    this.cronJob = new CronJob(
      '0 3 1 * *',
      () => this.run(),
      null,
      false,
      'UTC'
    );
  }

  private async run(): Promise<void> {
    if (this.isRunning) {
      await this.logger.logServerEvent(
        'capacity',
        'warn',
        'Vercel partition maintenance job already running, skipping'
      );
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Use PostgreSQL advisory lock to prevent concurrent execution
        const lockResult = await client.query(
          'SELECT pg_try_advisory_lock($1) as acquired',
          [PARTITION_MANAGEMENT_LOCK_ID]
        );

        if (!lockResult.rows[0].acquired) {
          await this.logger.logServerEvent(
            'capacity',
            'warn',
            'Could not acquire advisory lock for Vercel partition maintenance'
          );
          return;
        }

        // Create next month's partition
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1); // First day of next month

        await client.query(
          'SELECT create_vercel_deployments_partition($1)',
          [nextMonth.toISOString().split('T')[0]]
        );

        // Optional: Drop partitions older than 180 days (6 months)
        const oldDate = new Date();
        oldDate.setMonth(oldDate.getMonth() - 6);
        oldDate.setDate(1);

        const oldTableName = 'vercel_deployments_' +
          oldDate.toISOString().slice(0, 7).replace('-', '_');

        try {
          await client.query(`DROP TABLE IF EXISTS ${oldTableName}`);

          await this.logger.logServerEvent(
            'capacity',
            'info',
            'Vercel partition maintenance completed successfully',
            {
              nextMonthPartition: nextMonth.toISOString().slice(0, 7),
              droppedPartition: oldTableName,
              durationMs: Date.now() - startTime
            }
          );
        } catch (dropError) {
          // Log but don't fail if partition drop fails
          await this.logger.logServerEvent(
            'capacity',
            'warn',
            'Failed to drop old partition, but created new one successfully',
            {
              nextMonthPartition: nextMonth.toISOString().slice(0, 7),
              failedToDropPartition: oldTableName,
              error: (dropError as Error).message
            }
          );
        }

        // Release the advisory lock
        await client.query('SELECT pg_advisory_unlock($1)', [PARTITION_MANAGEMENT_LOCK_ID]);

      } finally {
        client.release();
      }
    } catch (error) {
      await this.logger.logCriticalError(
        'vercel_partition_maintenance_failed',
        error as Error,
        {
          durationMs: Date.now() - startTime
        }
      );
    } finally {
      this.isRunning = false;
    }
  }

  start(): void {
    this.cronJob.start();
    console.log('✅ Vercel partition maintenance job started (monthly on 1st at 3:00 AM UTC)');
  }

  stop(): void {
    this.cronJob.stop();
    console.log('⏹️  Vercel partition maintenance job stopped');
  }

  getNextRun(): Date {
    return this.cronJob.nextDate().toJSDate();
  }

  isActive(): boolean {
    return this.cronJob.running;
  }
}

// Export instances for use in server.ts
export const vercelWebhookCleanupJob = new VercelWebhookCleanupJob();
export const vercelPartitionMaintenanceJob = new VercelPartitionMaintenanceJob();

// Health check function for monitoring
export function getVercelJobsHealth() {
  return {
    webhookCleanup: {
      active: vercelWebhookCleanupJob.isActive(),
      nextRun: vercelWebhookCleanupJob.getNextRun()
    },
    partitionMaintenance: {
      active: vercelPartitionMaintenanceJob.isActive(),
      nextRun: vercelPartitionMaintenanceJob.getNextRun()
    }
  };
}
