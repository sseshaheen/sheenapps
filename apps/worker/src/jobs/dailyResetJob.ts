import { CronJob } from 'cron';
import { pool } from '../services/database';
import { jobMonitoringService } from '../services/jobMonitoringService';

// PostgreSQL advisory lock ID for daily reset (arbitrary unique number)
const DAILY_RESET_LOCK_ID = 12345;

// Metrics emitting function (simplified for now)
async function emitMetric(name: string, value: number): Promise<void> {
  try {
    // In production, this would send to your metrics system (DataDog, CloudWatch, etc.)
    console.log(`[Metrics] ${name}: ${value}`);
    
    // TODO: Integrate with actual metrics system
    // await metricsClient.gauge(name, value, {
    //   timestamp: Date.now(),
    //   tags: ['service:worker', 'job:daily_reset']
    // });
  } catch (error) {
    console.error(`[Daily Reset] Failed to emit metric ${name}:`, error);
  }
}

// Alert operations team function (simplified for now)
async function alertOps(message: string, details?: any): Promise<void> {
  try {
    console.error(`[ALERT] ${message}`, details);
    
    // TODO: Integrate with actual alerting system (PagerDuty, Slack, etc.)
    // await alertingClient.sendAlert({
    //   severity: 'error',
    //   message,
    //   details,
    //   service: 'worker',
    //   component: 'daily_reset_job'
    // });
  } catch (error) {
    console.error(`[Daily Reset] Failed to send alert:`, error);
  }
}

export class DailyResetJob {
  private cronJob: CronJob;
  private isRunning: boolean = false;

  constructor() {
    // Run daily at midnight UTC (00:00)
    this.cronJob = new CronJob(
      '0 0 * * *',
      () => this.run(),
      null,
      false,
      'UTC'
    );
  }

  start() {
    this.cronJob.start();
    console.log('✅ Daily AI time reset job scheduled (daily at midnight UTC)');
  }

  stop() {
    this.cronJob.stop();
    console.log('🛑 Daily AI time reset job stopped');
  }

  async runNow() {
    console.log('[Daily Reset] Manual execution requested');
    await this.run();
  }

  private async run() {
    if (this.isRunning) {
      console.log('[Daily Reset] Job already running, skipping...');
      return;
    }

    this.isRunning = true;

    // Generate unique job ID with timestamp for idempotency
    const jobId = `daily-reset-${new Date().toISOString().split('T')[0]}`;
    const idempotencyKey = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;

    try {
      console.log('[Daily Reset] Starting daily AI time gift reset with monitoring');

      // Execute job with full monitoring capabilities
      const result = await jobMonitoringService.executeJob(
        {
          jobId,
          jobType: 'daily_reset',
          expectedRuntimeMs: 30000, // Expected 30 seconds
          maxRetries: 2, // Allow 2 retries for daily reset
          idempotencyKey, // Prevent duplicate runs on same day
          metadata: {
            lockId: DAILY_RESET_LOCK_ID,
            scheduledAt: new Date().toISOString()
          }
        },
        async () => {
          return await this.resetDailyAllocationWithAdvisoryLock();
        }
      );

      console.log(`[Daily Reset] Completed successfully: ${result.usersReset} users reset`);

      // Legacy metrics for backward compatibility
      await emitMetric('daily_reset.users_reset', result.usersReset);
      await emitMetric('daily_reset.timestamp', Date.now());

      // Health check - verify reset worked (run after 5 minutes)
      setTimeout(async () => {
        try {
          const unresetCount = await this.checkUnresetUsers();
          if (unresetCount > 0) {
            await alertOps(`Daily reset incomplete: ${unresetCount} users not reset`);
            await emitMetric('daily_reset.incomplete_users', unresetCount);
          } else {
            console.log('[Daily Reset] Health check passed: all users reset successfully');
          }
        } catch (healthError) {
          console.error('[Daily Reset] Health check failed:', healthError);
          await alertOps('Daily reset health check failed', { error: healthError });
        }
      }, 300000); // 5 minutes

    } catch (error) {
      console.error('[Daily Reset] Failed:', error);

      // Legacy failure metrics for backward compatibility
      await emitMetric('daily_reset.success', 0);
      await alertOps('Daily reset failed', {
        error: error instanceof Error ? error.message : String(error),
        jobId
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Reset daily allocation using PostgreSQL advisory locks for exactly-once execution
   */
  private async resetDailyAllocationWithAdvisoryLock(): Promise<{ usersReset: number }> {
    if (!pool) {
      throw new Error('Database pool not available');
    }

    // Try to acquire advisory lock
    console.log('[Daily Reset] Attempting to acquire PostgreSQL advisory lock...');
    const lockResult = await pool.query(
      'SELECT pg_try_advisory_lock($1) as acquired',
      [DAILY_RESET_LOCK_ID]
    );
    
    const lockAcquired = lockResult.rows[0]?.acquired;
    
    if (!lockAcquired) {
      console.log('[Daily Reset] Advisory lock already held by another instance - skipping execution');
      throw new Error('Daily reset already running in another worker instance');
    }
    
    console.log('[Daily Reset] Advisory lock acquired successfully');
    
    try {
      // Perform the actual reset with enhanced logic from Phase 2 plan
      console.log('[Daily Reset] Resetting daily counters for all users...');
      
      const result = await pool.query(`
        UPDATE user_ai_time_balance
        SET
          daily_gift_used_today = 0,
          total_seconds_used_today = 0,  -- Prevents chart double-counting at midnight
          updated_at = NOW()
        WHERE daily_gift_used_today > 0
           OR total_seconds_used_today > 0
        RETURNING user_id
      `);
      
      const usersReset = result.rowCount || 0;
      console.log(`[Daily Reset] Reset completed: ${usersReset} users had their daily counters reset`);
      
      return { usersReset };
      
    } finally {
      // Always release the advisory lock
      try {
        await pool.query('SELECT pg_advisory_unlock($1)', [DAILY_RESET_LOCK_ID]);
        console.log('[Daily Reset] Advisory lock released');
      } catch (unlockError) {
        console.error('[Daily Reset] Failed to release advisory lock:', unlockError);
        // This is critical - the lock might remain held until connection closes
        await alertOps('Failed to release daily reset advisory lock', { 
          error: unlockError,
          lockId: DAILY_RESET_LOCK_ID 
        });
      }
    }
  }

  /**
   * Health check function to verify daily reset worked correctly
   */
  private async checkUnresetUsers(): Promise<number> {
    if (!pool) {
      throw new Error('Database pool not available for health check');
    }

    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM user_ai_time_balance
      WHERE daily_gift_used_today > 0 
         OR total_seconds_used_today > 0
    `);
    
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Get status information about the daily reset job
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    isScheduled: boolean;
    nextRun?: string;
    lastRun?: string;
    unresetUsers?: number;
  }> {
    const status: {
      isRunning: boolean;
      isScheduled: boolean;
      nextRun?: string;
      lastRun?: string;
      unresetUsers?: number;
    } = {
      isRunning: this.isRunning,
      isScheduled: this.cronJob.running
    };

    try {
      // Get next scheduled run time
      if (this.cronJob.running) {
        const nextDate = this.cronJob.nextDate();
        if (nextDate) {
          status.nextRun = nextDate.toString();
        }
      }

      // Check current unreset users (health indicator)
      const unresetUsers = await this.checkUnresetUsers();
      status.unresetUsers = unresetUsers;

    } catch (error) {
      console.error('[Daily Reset] Failed to get full status:', error);
    }

    return status;
  }
}

// Singleton instance
export const dailyResetJob = new DailyResetJob();

// Ensure cleanup on shutdown
process.on('beforeExit', () => {
  dailyResetJob.stop();
});

process.on('SIGINT', () => {
  console.log('[Daily Reset] Received SIGINT, stopping daily reset job...');
  dailyResetJob.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Daily Reset] Received SIGTERM, stopping daily reset job...');
  dailyResetJob.stop();
  process.exit(0);
});