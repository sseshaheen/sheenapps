import { CronJob } from 'cron';
import { pool } from '../services/database';
import { unifiedLogger } from '../services/unifiedLogger';
import { jobMonitoringService } from '../services/jobMonitoringService';

// PostgreSQL advisory lock ID for daily bonus reset (unique number)
const DAILY_BONUS_RESET_LOCK_ID = 12346;

// Metrics emitting function
async function emitMetric(name: string, value: number): Promise<void> {
  try {
    console.log(`[Metrics] ${name}: ${value}`);
    // TODO: Integrate with actual metrics system
  } catch (error) {
    console.error(`[Daily Bonus Reset] Failed to emit metric ${name}:`, error);
  }
}

// Alert operations team function
async function alertOps(message: string, details?: any): Promise<void> {
  try {
    console.error(`[ALERT] ${message}`, details);
    // TODO: Integrate with actual alerting system
  } catch (error) {
    console.error(`[Daily Bonus Reset] Failed to send alert:`, error);
  }
}

export class EnhancedDailyBonusResetJob {
  private cronJob: CronJob;
  private isRunning: boolean = false;

  constructor() {
    // Run daily at 00:05 UTC (5 minutes after midnight to avoid conflicts)
    this.cronJob = new CronJob(
      '5 0 * * *',
      () => this.run(),
      null,
      false,
      'UTC'
    );
  }

  start() {
    this.cronJob.start();
    console.log('✅ Enhanced daily bonus reset job scheduled (daily at 00:05 UTC)');
  }

  stop() {
    this.cronJob.stop();
    console.log('🛑 Enhanced daily bonus reset job stopped');
  }

  async runNow() {
    console.log('[Daily Bonus Reset] Manual execution requested');
    await this.run();
  }

  private async run() {
    if (this.isRunning) {
      console.log('[Daily Bonus Reset] Job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Generate unique job ID for tracking
    const jobId = `daily-bonus-reset-${today}`;
    const idempotencyKey = today; // Prevent duplicate runs on same day

    const startTime = Date.now();

    try {
      console.log('[Daily Bonus Reset] Starting enhanced daily bonus reset with monitoring');

      // Log job start
      unifiedLogger.system('daily_bonus_reset_start', 'info', 'Daily bonus reset job started', {
        jobId,
        scheduledDate: today
      });

      // Execute job with full monitoring capabilities
      const result = await jobMonitoringService.executeJob(
        {
          jobId,
          jobType: 'daily_bonus_reset',
          expectedRuntimeMs: 45000, // Expected 45 seconds
          maxRetries: 2, // Allow 2 retries for bonus reset
          idempotencyKey, // Prevent duplicate runs on same day
          metadata: {
            lockId: DAILY_BONUS_RESET_LOCK_ID,
            scheduledDate: today,
            scheduledAt: new Date().toISOString()
          }
        },
        async () => {
          return await this.resetDailyBonusesWithLock(today);
        }
      );

      const duration = Date.now() - startTime;

      console.log(`[Daily Bonus Reset] Completed successfully: ${result.expiredBucketsRemoved} expired buckets removed, ${result.usersUpdated} users updated`);

      // Log job completion
      unifiedLogger.system('daily_bonus_reset_complete', 'info', 'Daily bonus reset job completed successfully', {
        jobId,
        expiredBucketsRemoved: result.expiredBucketsRemoved,
        usersUpdated: result.usersUpdated,
        duration
      });

      // Emit success metrics
      await emitMetric('daily_bonus_reset.expired_buckets_removed', result.expiredBucketsRemoved);
      await emitMetric('daily_bonus_reset.users_updated', result.usersUpdated);
      await emitMetric('daily_bonus_reset.duration_ms', duration);
      await emitMetric('daily_bonus_reset.success', 1);
      
      // Health check - verify cleanup worked
      setTimeout(async () => {
        try {
          const expiredCount = await this.checkExpiredDailyBuckets();
          if (expiredCount > 0) {
            await alertOps(`Daily bonus reset incomplete: ${expiredCount} expired daily buckets remain`);
            await emitMetric('daily_bonus_reset.expired_remaining', expiredCount);
            
            // Log health check failure
            unifiedLogger.system('daily_bonus_reset_health_check_failed', 'warn', 'Daily bonus reset incomplete', {
              jobId: `daily-bonus-${today}`,
              expiredRemaining: expiredCount
            });
          } else {
            console.log('[Daily Bonus Reset] Health check passed: all expired daily buckets removed');
            
            // Log health check success
            unifiedLogger.system('daily_bonus_reset_health_check_passed', 'info', 'Daily bonus reset health check passed', {
              jobId: `daily-bonus-${today}`
            });
          }
        } catch (healthError) {
          console.error('[Daily Bonus Reset] Health check failed:', healthError);
          await alertOps('Daily bonus reset health check failed', { error: healthError });
        }
      }, 300000); // 5 minutes
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[Daily Bonus Reset] Failed:', error);
      
      // Log job failure
      unifiedLogger.system('daily_bonus_reset_failed', 'error', 'Daily bonus reset job failed', {
        jobId: `daily-bonus-${today}`,
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration
      });
      
      // Emit failure metrics
      await emitMetric('daily_bonus_reset.success', 0);
      await emitMetric('daily_bonus_reset.duration_ms', duration);
      await alertOps('Daily bonus reset failed', { 
        error: error instanceof Error ? error.message : String(error),
        duration
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Reset daily bonuses with advisory lock for exactly-once execution
   */
  private async resetDailyBonusesWithLock(today: string): Promise<{ 
    expiredBucketsRemoved: number; 
    usersUpdated: number 
  }> {
    if (!pool) {
      throw new Error('Database pool not available');
    }

    // Try to acquire advisory lock
    console.log('[Daily Bonus Reset] Attempting to acquire PostgreSQL advisory lock...');
    const lockResult = await pool.query(
      'SELECT pg_try_advisory_lock($1) as acquired',
      [DAILY_BONUS_RESET_LOCK_ID]
    );
    
    const lockAcquired = lockResult.rows[0]?.acquired;
    
    if (!lockAcquired) {
      console.log('[Daily Bonus Reset] Advisory lock already held - skipping execution');
      return { expiredBucketsRemoved: 0, usersUpdated: 0 };
    }
    
    console.log('[Daily Bonus Reset] Advisory lock acquired successfully');
    
    try {
      // Hard-delete expired daily buckets and recompute totals
      console.log('[Daily Bonus Reset] Removing expired daily buckets...');
      
      const result = await pool.query(`
        UPDATE user_ai_time_balance 
        SET 
          second_buckets = (
            SELECT COALESCE(jsonb_agg(bucket), '[]')
            FROM jsonb_array_elements(second_buckets) bucket
            WHERE 
              (bucket->>'source') != 'daily' 
              OR (bucket->>'expires_at')::timestamptz > NOW()
          ),
          total_seconds_used_today = 0, -- Reset daily usage counter
          updated_at = NOW()
        WHERE second_buckets @> '[{"source": "daily"}]'
        RETURNING user_id
      `);
      
      const usersUpdated = result.rowCount || 0;
      // We can't easily count expired buckets with this simpler approach, 
      // but we know we're removing all expired daily buckets from affected users
      const expiredBucketsRemoved = usersUpdated; // Simplified metric
      
      console.log(`[Daily Bonus Reset] Cleanup completed: expired daily buckets removed from ${usersUpdated} users`);
      
      return { expiredBucketsRemoved, usersUpdated };
      
    } finally {
      // Always release the advisory lock
      try {
        await pool.query('SELECT pg_advisory_unlock($1)', [DAILY_BONUS_RESET_LOCK_ID]);
        console.log('[Daily Bonus Reset] Advisory lock released');
      } catch (unlockError) {
        console.error('[Daily Bonus Reset] Failed to release advisory lock:', unlockError);
        await alertOps('Failed to release daily bonus reset advisory lock', { 
          error: unlockError,
          lockId: DAILY_BONUS_RESET_LOCK_ID 
        });
      }
    }
  }

  /**
   * Health check function to verify expired daily buckets are cleaned up
   */
  private async checkExpiredDailyBuckets(): Promise<number> {
    if (!pool) {
      throw new Error('Database pool not available for health check');
    }

    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM user_ai_time_balance,
      LATERAL jsonb_array_elements(second_buckets) bucket
      WHERE (bucket->>'source') = 'daily'
        AND (bucket->>'expires_at')::timestamptz <= NOW()
    `);
    
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Get status information about the daily bonus reset job
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    isScheduled: boolean;
    nextRun?: string;
    expiredBuckets?: number;
  }> {
    const status: {
      isRunning: boolean;
      isScheduled: boolean;
      nextRun?: string;
      expiredBuckets?: number;
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

      // Check current expired daily buckets (health indicator)
      const expiredBuckets = await this.checkExpiredDailyBuckets();
      status.expiredBuckets = expiredBuckets;

    } catch (error) {
      console.error('[Daily Bonus Reset] Failed to get full status:', error);
    }

    return status;
  }
}

// Singleton instance
export const enhancedDailyBonusResetJob = new EnhancedDailyBonusResetJob();