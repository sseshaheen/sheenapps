import { CronJob } from 'cron';
import { pool } from '../services/database';
import { pricingCatalogService } from '../services/pricingCatalogService';

// PostgreSQL advisory lock ID for monthly rollover (unique number)
const MONTHLY_ROLLOVER_LOCK_ID = 12347;

// Metrics emitting function
async function emitMetric(name: string, value: number): Promise<void> {
  try {
    console.log(`[Metrics] ${name}: ${value}`);
    // TODO: Integrate with actual metrics system
  } catch (error) {
    console.error(`[Monthly Rollover] Failed to emit metric ${name}:`, error);
  }
}

// Alert operations team function
async function alertOps(message: string, details?: any): Promise<void> {
  try {
    console.error(`[ALERT] ${message}`, details);
    // TODO: Integrate with actual alerting system
  } catch (error) {
    console.error(`[Monthly Rollover] Failed to send alert:`, error);
  }
}

export class MonthlyRolloverJob {
  private cronJob: CronJob;
  private isRunning: boolean = false;

  constructor() {
    // Run monthly on the 1st at 00:15 UTC (after daily bonus reset)
    this.cronJob = new CronJob(
      '15 0 1 * *',
      () => this.run(),
      null,
      false,
      'UTC'
    );
  }

  start() {
    this.cronJob.start();
    console.log('✅ Monthly rollover job scheduled (monthly on 1st at 00:15 UTC)');
  }

  stop() {
    this.cronJob.stop();
    console.log('🛑 Monthly rollover job stopped');
  }

  async runNow() {
    console.log('[Monthly Rollover] Manual execution requested');
    await this.run();
  }

  private async run() {
    if (this.isRunning) {
      console.log('[Monthly Rollover] Job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);

    try {
      console.log(`[Monthly Rollover] Starting monthly rollover for ${lastMonth} -> ${thisMonth}`);
      
      const result = await this.processMonthlyRolloverWithLock(thisMonth, lastMonth);
      
      const duration = Date.now() - startTime;
      console.log(`[Monthly Rollover] Completed successfully: ${result.subscriptionsProcessed} subscriptions, ${result.totalSecondsRolledOver} seconds rolled over, ${result.totalSecondsDiscarded} seconds discarded in ${duration}ms`);
      
      // Emit success metrics
      await emitMetric('monthly_rollover.subscriptions_processed', result.subscriptionsProcessed);
      await emitMetric('monthly_rollover.seconds_rolled_over', result.totalSecondsRolledOver);
      await emitMetric('monthly_rollover.seconds_discarded', result.totalSecondsDiscarded);
      await emitMetric('monthly_rollover.bonus_caps_reset', result.bonusCapsReset);
      await emitMetric('monthly_rollover.duration_ms', duration);
      await emitMetric('monthly_rollover.success', 1);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[Monthly Rollover] Failed:', error);
      
      // Emit failure metrics
      await emitMetric('monthly_rollover.success', 0);
      await emitMetric('monthly_rollover.duration_ms', duration);
      await alertOps('Monthly rollover failed', { 
        error: error instanceof Error ? error.message : String(error),
        duration,
        thisMonth,
        lastMonth
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process monthly rollover with advisory lock for exactly-once execution
   */
  private async processMonthlyRolloverWithLock(
    thisMonth: string, 
    lastMonth: string
  ): Promise<{ 
    subscriptionsProcessed: number; 
    totalSecondsRolledOver: number;
    totalSecondsDiscarded: number;
    bonusCapsReset: number;
  }> {
    if (!pool) {
      throw new Error('Database pool not available');
    }

    // Try to acquire advisory lock
    console.log('[Monthly Rollover] Attempting to acquire PostgreSQL advisory lock...');
    const lockResult = await pool.query(
      'SELECT pg_try_advisory_lock($1) as acquired',
      [MONTHLY_ROLLOVER_LOCK_ID]
    );
    
    const lockAcquired = lockResult.rows[0]?.acquired;
    
    if (!lockAcquired) {
      console.log('[Monthly Rollover] Advisory lock already held - skipping execution');
      return { 
        subscriptionsProcessed: 0, 
        totalSecondsRolledOver: 0, 
        totalSecondsDiscarded: 0,
        bonusCapsReset: 0
      };
    }
    
    console.log('[Monthly Rollover] Advisory lock acquired successfully');
    
    try {
      // Get active pricing catalog for rollover caps
      const catalog = await pricingCatalogService.getActiveCatalog();
      const rolloverCaps = new Map<string, number>();
      
      for (const subscription of catalog.subscriptions) {
        if (subscription.rolloverCap) {
          rolloverCaps.set(subscription.key, subscription.rolloverCap * 60); // Convert minutes to seconds
        }
      }

      // Process rollover for active subscriptions
      console.log('[Monthly Rollover] Processing subscription rollovers...');
      
      const rolloverResult = await pool.query(`
        WITH subscription_users AS (
          SELECT DISTINCT 
            ub.user_id,
            pi.item_key as plan_key,
            pi.rollover_cap_seconds
          FROM user_ai_time_balance ub
          JOIN billing_subscriptions bs ON bs.user_id = ub.user_id AND bs.status = 'active'
          JOIN pricing_items pi ON pi.id = bs.pricing_item_id
          WHERE pi.rollover_cap_seconds > 0
        ),
        rollover_processing AS (
          UPDATE user_ai_time_balance ub
          SET 
            second_buckets = (
              SELECT jsonb_agg(
                CASE 
                  -- Convert unused subscription seconds to rollover buckets
                  WHEN bucket->>'source' = 'subscription' 
                    AND (bucket->>'seconds')::INTEGER > (bucket->>'consumed')::INTEGER 
                  THEN
                    -- Create rollover bucket with cap applied
                    jsonb_build_object(
                      'id', 'rollover-' || extract(epoch from now())::text || '-' || (bucket->>'id'),
                      'source', 'rollover',
                      'seconds', LEAST(
                        (bucket->>'seconds')::INTEGER - (bucket->>'consumed')::INTEGER,
                        su.rollover_cap_seconds
                      ),
                      'consumed', 0,
                      'expires_at', (NOW() + INTERVAL '90 days')::text,
                      'created_at', NOW()::text
                    )
                  -- Keep non-subscription buckets as-is
                  WHEN bucket->>'source' != 'subscription' THEN bucket
                  -- Remove fully consumed subscription buckets
                  ELSE NULL
                END
              ) FILTER (WHERE 
                CASE 
                  WHEN bucket->>'source' = 'subscription' 
                    AND (bucket->>'seconds')::INTEGER > (bucket->>'consumed')::INTEGER 
                  THEN TRUE
                  WHEN bucket->>'source' != 'subscription' THEN TRUE
                  ELSE FALSE
                END
              )
              FROM jsonb_array_elements(ub.second_buckets) bucket
            ),
            -- Reset monthly bonus tracking
            bonus_month_year = $1,
            bonus_used_this_month = 0,
            updated_at = NOW()
          FROM subscription_users su
          WHERE ub.user_id = su.user_id
          RETURNING 
            ub.user_id,
            su.plan_key,
            su.rollover_cap_seconds,
            (
              SELECT COALESCE(SUM((bucket->>'seconds')::INTEGER - (bucket->>'consumed')::INTEGER), 0)
              FROM jsonb_array_elements(ub.second_buckets) bucket
              WHERE bucket->>'source' = 'subscription'
                AND (bucket->>'seconds')::INTEGER > (bucket->>'consumed')::INTEGER
            ) as seconds_available_for_rollover
        ),
        rollover_stats AS (
          SELECT 
            COUNT(*) as subscriptions_processed,
            COALESCE(SUM(
              LEAST(seconds_available_for_rollover, rollover_cap_seconds)
            ), 0) as total_seconds_rolled_over,
            COALESCE(SUM(
              GREATEST(0, seconds_available_for_rollover - rollover_cap_seconds)
            ), 0) as total_seconds_discarded
          FROM rollover_processing
        ),
        bonus_reset_stats AS (
          UPDATE user_ai_time_balance 
          SET 
            bonus_month_year = $1,
            bonus_used_this_month = 0
          WHERE bonus_month_year != $1
          RETURNING user_id
        )
        SELECT 
          rs.subscriptions_processed,
          rs.total_seconds_rolled_over,
          rs.total_seconds_discarded,
          (SELECT COUNT(*) FROM bonus_reset_stats) as bonus_caps_reset
        FROM rollover_stats rs
      `, [thisMonth]);
      
      const stats = rolloverResult.rows[0] || {};
      const subscriptionsProcessed = parseInt(stats.subscriptions_processed || '0');
      const totalSecondsRolledOver = parseInt(stats.total_seconds_rolled_over || '0');
      const totalSecondsDiscarded = parseInt(stats.total_seconds_discarded || '0');
      const bonusCapsReset = parseInt(stats.bonus_caps_reset || '0');
      
      console.log(`[Monthly Rollover] Rollover completed: ${subscriptionsProcessed} subscriptions processed`);
      console.log(`[Monthly Rollover] Seconds rolled over: ${totalSecondsRolledOver} (${Math.floor(totalSecondsRolledOver / 60)} minutes)`);
      console.log(`[Monthly Rollover] Seconds discarded: ${totalSecondsDiscarded} (${Math.floor(totalSecondsDiscarded / 60)} minutes)`);
      console.log(`[Monthly Rollover] Bonus caps reset: ${bonusCapsReset} users`);

      // Log discarded seconds for monitoring
      if (totalSecondsDiscarded > 0) {
        await alertOps(`Monthly rollover discarded ${Math.floor(totalSecondsDiscarded / 60)} minutes due to caps`, {
          totalSecondsDiscarded,
          subscriptionsProcessed,
          month: thisMonth
        });
      }
      
      return { 
        subscriptionsProcessed, 
        totalSecondsRolledOver, 
        totalSecondsDiscarded,
        bonusCapsReset
      };
      
    } finally {
      // Always release the advisory lock
      try {
        await pool.query('SELECT pg_advisory_unlock($1)', [MONTHLY_ROLLOVER_LOCK_ID]);
        console.log('[Monthly Rollover] Advisory lock released');
      } catch (unlockError) {
        console.error('[Monthly Rollover] Failed to release advisory lock:', unlockError);
        await alertOps('Failed to release monthly rollover advisory lock', { 
          error: unlockError,
          lockId: MONTHLY_ROLLOVER_LOCK_ID 
        });
      }
    }
  }

  /**
   * Get status information about the monthly rollover job
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    isScheduled: boolean;
    nextRun?: string;
    lastProcessedMonth?: string;
  }> {
    const status: {
      isRunning: boolean;
      isScheduled: boolean;
      nextRun?: string;
      lastProcessedMonth?: string;
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

      // Check last processed month from user records
      if (pool) {
        const result = await pool.query(`
          SELECT bonus_month_year
          FROM user_ai_time_balance 
          WHERE bonus_month_year IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 1
        `);
        
        if (result.rows.length > 0) {
          status.lastProcessedMonth = result.rows[0].bonus_month_year;
        }
      }

    } catch (error) {
      console.error('[Monthly Rollover] Failed to get full status:', error);
    }

    return status;
  }
}

// Singleton instance
export const monthlyRolloverJob = new MonthlyRolloverJob();