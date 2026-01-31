import cron, { ScheduledTask } from 'node-cron';
import { updateExchangeRates } from './updateExchangeRates';
import { ServerLoggingService } from '../services/serverLoggingService';
import { syncDispatchKvFromDb } from '../services/dispatchKvService';
import { getInhouseBackupService } from '../services/inhouse/InhouseBackupService';
import { getInhouseRestoreService } from '../services/inhouse/InhouseRestoreService';
import { pool } from '../services/database';
import { businessKpiRollupJob } from './businessKpiRollupJob';
import { dailyDigestJob } from './dailyDigestJob';

const loggingService = ServerLoggingService.getInstance();

// =============================================================================
// MODULE-LEVEL STATE (prevents duplicate scheduling)
// =============================================================================

let initialized = false;
let tasks: ScheduledTask[] = [];

// =============================================================================
// ADVISORY LOCK HELPER (prevents cross-instance overlap)
// =============================================================================

/**
 * Execute a function with a Postgres advisory lock.
 * Returns null if lock couldn't be acquired (another instance is running the job).
 */
async function withPgAdvisoryLock<T>(lockKey: number, fn: () => Promise<T>): Promise<T | null> {
  if (!pool) {
    console.warn('[ScheduledJobs] No database pool available, running without lock');
    return fn();
  }

  const client = await pool.connect();
  try {
    // pg_try_advisory_lock returns boolean - non-blocking attempt
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [lockKey]);
    if (!rows?.[0]?.locked) {
      return null; // Another instance holds the lock
    }

    return await fn();
  } finally {
    // Best-effort unlock (safe to call even if we didn't lock)
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => {});
    client.release();
  }
}

/**
 * Wraps a scheduled job with duration logging.
 * Logs execution time for monitoring and debugging.
 */
async function withJobTiming<T>(
  jobName: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    console.log(`[ScheduledJobs] ${jobName} completed in ${durationMs}ms`);
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`[ScheduledJobs] ${jobName} failed after ${durationMs}ms:`, error);
    throw error;
  }
}

// Advisory lock keys (stable per job type)
const LOCK_KEYS = {
  DAILY_BACKUP: 2001,
  BACKUP_CLEANUP: 2002,
  EXCHANGE_RATES: 2003,
  VIEW_REFRESH: 2004,
  DISPATCH_SYNC: 2005,
  ACTIVITY_LOG_CLEANUP: 2006,
  BUSINESS_KPI_ROLLUP: 2007,
  WEBHOOK_EVENTS_CLEANUP: 2008,
  WEBHOOK_STUCK_REAPER: 2009,
  DAILY_DIGEST: 2010,
  WORKFLOW_STUCK_REAPER: 2011,
};

/**
 * Schedule all recurring jobs
 */
export function initializeScheduledJobs(): void {
  // Guard: prevent duplicate scheduling (PM2 cluster, hot reload, etc.)
  if (initialized) {
    console.log('[ScheduledJobs] Already initialized — skipping');
    return;
  }
  initialized = true;
  tasks = [];

  console.log('[ScheduledJobs] Initializing scheduled jobs...');
  const CRON_TZ = { timezone: 'UTC' };

  // =============================================================================
  // DAILY BACKUP - Runs at 2 AM UTC
  // =============================================================================
  // Runs daily backups for all Easy Mode projects without a backup for today
  tasks.push(cron.schedule('0 2 * * *', async () => {
    const ran = await withPgAdvisoryLock(LOCK_KEYS.DAILY_BACKUP, async () => {
      return withJobTiming('daily-backup', async () => {
        console.log('[ScheduledJobs] Running daily Easy Mode backups...');
        const backupService = getInhouseBackupService();
        const results = await backupService.runDailyBackups();

        console.log(`[ScheduledJobs] Daily backups complete: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);

        // Alert if any failures
        if (results.failed > 0) {
          await loggingService.logCriticalError('daily_backup_failures', new Error(`${results.failed} backup(s) failed`), {
            job: 'daily-backup',
            schedule: '0 2 * * *',
            success: results.success,
            failed: results.failed,
            skipped: results.skipped
          });
        }
        return results;
      });
    });

    if (ran === null) {
      console.log('[ScheduledJobs] daily-backup skipped (lock held by another instance)');
    }
  }, CRON_TZ));

  // =============================================================================
  // BACKUP CLEANUP - Runs at 3 AM UTC
  // =============================================================================
  // Cleans up expired backups according to retention policy
  // Also cleans up old restore schemas (when InhouseRestoreService is implemented)
  tasks.push(cron.schedule('0 3 * * *', async () => {
    const ran = await withPgAdvisoryLock(LOCK_KEYS.BACKUP_CLEANUP, async () => {
      console.log('[ScheduledJobs] Running backup cleanup...');
      const backupService = getInhouseBackupService();

      // 1. Cleanup expired backups
      const backupCleanup = await backupService.cleanupExpiredBackups();
      console.log(`[ScheduledJobs] Expired backups cleanup: ${backupCleanup.deleted} deleted, ${backupCleanup.failed} failed`);

      // 2. Cleanup old restore schemas
      const restoreService = getInhouseRestoreService();
      const schemaCleanup = await restoreService.cleanupOldSchemas();
      console.log(`[ScheduledJobs] Old restore schemas cleanup: ${schemaCleanup.cleaned} cleaned, ${schemaCleanup.failed} failed`);

      // Alert if any failures
      if (backupCleanup.failed > 0) {
        await loggingService.logCriticalError('backup_cleanup_failures', new Error(`${backupCleanup.failed} cleanup(s) failed`), {
          job: 'backup-cleanup',
          schedule: '0 3 * * *',
          backupsDeleted: backupCleanup.deleted,
          backupsFailed: backupCleanup.failed
        });
      }
      return { backupCleanup, schemaCleanup };
    });

    if (ran === null) {
      console.log('[ScheduledJobs] backup-cleanup skipped (lock held by another instance)');
    }
  }, CRON_TZ));

  // =============================================================================
  // ACTIVITY LOG CLEANUP - DISABLED
  // =============================================================================
  // Retention disabled to preserve historical data for analysis.
  // TODO: Implement archival strategy before re-enabling.
  // See: INHOUSE_ADMIN_PLAN.md
  //
  // Original schedule: '15 3 * * *' (3:15 AM UTC daily, 30-day retention)

  // =============================================================================
  // EXCHANGE RATES - Runs at 2 AM UTC (moved to 2:30 AM to avoid backup conflict)
  // =============================================================================
  // Update exchange rates daily at 2:30 AM UTC
  tasks.push(cron.schedule('30 2 * * *', async () => {
    const ran = await withPgAdvisoryLock(LOCK_KEYS.EXCHANGE_RATES, async () => {
      console.log('[ScheduledJobs] Running daily exchange rate update...');
      await updateExchangeRates();
      return true;
    });

    if (ran === null) {
      console.log('[ScheduledJobs] exchange-rates skipped (lock held by another instance)');
    }
  }, CRON_TZ));

  // =============================================================================
  // BUSINESS KPI ROLLUP - Runs every 15 minutes
  // =============================================================================
  // Frequent rollup keeps dashboard KPIs near-real-time.
  // Full 7-day backfill still runs in the job to self-heal gaps.
  tasks.push(cron.schedule('*/15 * * * *', async () => {
    const ran = await withPgAdvisoryLock(LOCK_KEYS.BUSINESS_KPI_ROLLUP, async () => {
      return withJobTiming('business-kpi-rollup', async () => {
        console.log('[ScheduledJobs] Running business KPI rollup...');
        await businessKpiRollupJob();
        return true;
      });
    });

    if (ran === null) {
      console.log('[ScheduledJobs] business-kpi-rollup skipped (lock held by another instance)');
    }
  }, CRON_TZ));

  // =============================================================================
  // DAILY DIGEST - Runs every hour at :05
  // =============================================================================
  // Sends daily digest emails to projects with digest_next_at <= now()
  // Uses scheduler-driven approach: each project stores its next send time
  tasks.push(cron.schedule('5 * * * *', async () => {
    const ran = await withPgAdvisoryLock(LOCK_KEYS.DAILY_DIGEST, async () => {
      return withJobTiming('daily-digest', async () => {
        console.log('[ScheduledJobs] Running daily digest job...');
        const result = await dailyDigestJob();
        console.log(`[ScheduledJobs] Daily digest complete: ${result.sent} sent, ${result.failed} failed`);
        return result;
      });
    });

    if (ran === null) {
      console.log('[ScheduledJobs] daily-digest skipped (lock held by another instance)');
    }
  }, CRON_TZ));

  // =============================================================================
  // WEBHOOK EVENTS CLEANUP - Runs at 4:30 AM UTC
  // =============================================================================
  // Cleanup old completed/failed webhook events and Stripe processed events (30 day retention)
  // Part of easy-mode-email-enhancements-plan.md (Enhancement 3)
  tasks.push(cron.schedule('30 4 * * *', async () => {
    const ran = await withPgAdvisoryLock(LOCK_KEYS.WEBHOOK_EVENTS_CLEANUP, async () => {
      console.log('[ScheduledJobs] Running webhook events cleanup...');

      const retentionDays = parseInt(process.env.WEBHOOK_EVENTS_RETENTION_DAYS || '30', 10);
      let webhookEventsDeleted = 0;
      let stripeEventsDeleted = 0;

      try {
        // 1. Cleanup old completed webhook events (keep failed for debugging)
        // Using make_interval with parameterized query to avoid SQL string interpolation
        const webhookResult = await pool?.query(`
          DELETE FROM inhouse_webhook_events
          WHERE status = 'completed'
            AND received_at < NOW() - make_interval(days => $1)
        `, [retentionDays]);
        webhookEventsDeleted = webhookResult?.rowCount || 0;

        // 2. Cleanup old Stripe processed events
        const stripeResult = await pool?.query(`
          DELETE FROM stripe_processed_events
          WHERE processed_at < NOW() - make_interval(days => $1)
        `, [retentionDays]);
        stripeEventsDeleted = stripeResult?.rowCount || 0;

        console.log(`[ScheduledJobs] Webhook events cleanup: ${webhookEventsDeleted} webhook events, ${stripeEventsDeleted} Stripe events deleted`);

        return { webhookEventsDeleted, stripeEventsDeleted };
      } catch (error) {
        console.error('[ScheduledJobs] Webhook events cleanup failed:', error);
        await loggingService.logCriticalError('webhook_events_cleanup_failed', error as Error, {
          job: 'webhook-events-cleanup',
          schedule: '30 4 * * *',
          retentionDays,
        });
        return { webhookEventsDeleted, stripeEventsDeleted, error: true };
      }
    });

    if (ran === null) {
      console.log('[ScheduledJobs] webhook-events-cleanup skipped (lock held by another instance)');
    }
  }, CRON_TZ));

  // =============================================================================
  // WEBHOOK STUCK EVENT REAPER - Runs every 15 minutes
  // =============================================================================
  // Recovers stuck webhook events (processing for > 60 minutes) by resetting to retrying
  // Events that exceed MAX_RETRIES are transitioned to 'failed' permanently
  // Part of easy-mode-email-enhancements-plan.md (Enhancement 3)
  const MAX_WEBHOOK_RETRIES = 12; // ~4 hours of exponential backoff before giving up

  tasks.push(cron.schedule('*/15 * * * *', async () => {
    const ran = await withPgAdvisoryLock(LOCK_KEYS.WEBHOOK_STUCK_REAPER, async () => {
      if (!pool) {
        console.error('[ScheduledJobs] Webhook stuck reaper: No database pool available');
        return { reapedCount: 0, failedCount: 0, error: true };
      }

      try {
        // 1. Reap stuck events that can still retry
        const reapResult = await pool.query(`
          UPDATE inhouse_webhook_events
          SET status = 'retrying',
              last_error = COALESCE(last_error, 'stuck_processing_reaped'),
              retry_count = retry_count + 1,
              next_retry_at = NOW() + (INTERVAL '5 minutes' * LEAST(retry_count + 1, 12)),
              updated_at = NOW()
          WHERE status = 'processing'
            AND updated_at < NOW() - INTERVAL '60 minutes'
            AND retry_count < $1
          RETURNING id
        `, [MAX_WEBHOOK_RETRIES]);

        const reapedCount = reapResult?.rowCount || 0;

        // 2. Mark events that exceeded max retries as permanently failed
        const failResult = await pool.query(`
          UPDATE inhouse_webhook_events
          SET status = 'failed',
              last_error = COALESCE(last_error, 'max_retries_exceeded'),
              next_retry_at = NULL,
              updated_at = NOW()
          WHERE status IN ('processing', 'retrying')
            AND retry_count >= $1
          RETURNING id
        `, [MAX_WEBHOOK_RETRIES]);

        const failedCount = failResult?.rowCount || 0;

        if (reapedCount > 0) {
          console.warn(`[ScheduledJobs] Reaped ${reapedCount} stuck webhook events`);
        }
        if (failedCount > 0) {
          console.error(`[ScheduledJobs] Marked ${failedCount} webhook events as permanently failed (max retries exceeded)`);
          await loggingService.logCriticalError('webhook_events_max_retries', new Error(`${failedCount} events exceeded max retries`), {
            job: 'webhook-stuck-reaper',
            failedCount,
            maxRetries: MAX_WEBHOOK_RETRIES,
          });
        }

        return { reapedCount, failedCount };
      } catch (error) {
        console.error('[ScheduledJobs] Webhook stuck reaper failed:', error);
        return { reapedCount: 0, failedCount: 0, error: true };
      }
    });

    // Don't log skips for frequent jobs to reduce noise
  }, CRON_TZ));

  // =============================================================================
  // MATERIALIZED VIEWS - Runs at 3:30 AM UTC (moved to avoid backup cleanup conflict)
  // =============================================================================
  // Refresh materialized views daily at 3:30 AM UTC
  tasks.push(cron.schedule('30 3 * * *', async () => {
    const ran = await withPgAdvisoryLock(LOCK_KEYS.VIEW_REFRESH, async () => {
      console.log('[ScheduledJobs] Refreshing revenue metrics views...');
      const { pool: dbPool } = await import('../services/database');

      // Run REFRESH CONCURRENTLY commands individually (not in a transaction)
      // This allows for concurrent refresh without locking reads
      const views = [
        'mv_mrr_by_currency',
        'mv_mrr_usd_normalized',
        'mv_customer_ltv_summary',
        'mv_monthly_revenue_history',
        'mv_arpu_metrics'
      ];

      let failedCount = 0;
      const failedViews: string[] = [];

      for (const view of views) {
        try {
          await dbPool?.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`);
          console.log(`[ScheduledJobs] Refreshed ${view}`);
        } catch (err) {
          failedCount++;
          failedViews.push(view);
          console.error(`[ScheduledJobs] Failed to refresh ${view}:`, err);
          // Continue with other views even if one fails
        }
      }

      // Log critical if ANY views failed (not just on total failure)
      if (failedCount > 0) {
        await loggingService.logCriticalError('view_refresh_partial_failure', new Error(`${failedCount} view(s) failed to refresh`), {
          job: 'refreshRevenueMetrics',
          schedule: '30 3 * * *',
          failedViews,
          totalViews: views.length
        });
      }

      console.log('[ScheduledJobs] Revenue metrics views refresh completed');
      return { refreshed: views.length - failedCount, failed: failedCount };
    });

    if (ran === null) {
      console.log('[ScheduledJobs] view-refresh skipped (lock held by another instance)');
    }
  }, CRON_TZ));

  const dispatchSyncEnabled = process.env.DISPATCH_KV_SYNC_ENABLED !== 'false';
  const dispatchSchedule = process.env.DISPATCH_KV_SYNC_CRON || '0 4 * * *';

  if (dispatchSyncEnabled) {
    tasks.push(cron.schedule(dispatchSchedule, async () => {
      const ran = await withPgAdvisoryLock(LOCK_KEYS.DISPATCH_SYNC, async () => {
        console.log('[ScheduledJobs] Running dispatch KV sync...');
        await syncDispatchKvFromDb();
        return true;
      });

      if (ran === null) {
        console.log('[ScheduledJobs] dispatch-kv-sync skipped (lock held by another instance)');
      }
    }, CRON_TZ));

    setTimeout(async () => {
      console.log('[ScheduledJobs] Running startup dispatch KV sync...');
      try {
        await syncDispatchKvFromDb();
      } catch (error) {
        await loggingService.logCriticalError('startup_dispatch_kv_sync_failed', error as Error, {
          job: 'dispatchKvSync',
          schedule: 'startup'
        });
      }
    }, 60_000);
  }

  // =============================================================================
  // WORKFLOW STUCK RUN REAPER - Runs every 15 minutes
  // =============================================================================
  // Detects workflow runs stuck in 'running' state past lease expiry.
  // Marks them as failed so they don't block future executions.
  // The acquireLease() mechanism can also recover these reactively, but this
  // proactive reaper ensures they're cleaned up promptly.
  const MAX_WORKFLOW_ATTEMPTS = 3;

  tasks.push(cron.schedule('*/15 * * * *', async () => {
    const ran = await withPgAdvisoryLock(LOCK_KEYS.WORKFLOW_STUCK_REAPER, async () => {
      if (!pool) {
        console.error('[ScheduledJobs] Workflow stuck reaper: No database pool available');
        return { reapedCount: 0 };
      }

      try {
        // Mark stuck runs (expired lease + exceeded max attempts) as failed
        const result = await pool.query(`
          UPDATE workflow_runs
          SET status = 'failed',
              completed_at = NOW(),
              result = jsonb_build_object('errorSummary', 'Reaped: stuck in running state past lease expiry'),
              lease_expires_at = NULL
          WHERE status = 'running'
            AND lease_expires_at < NOW()
            AND attempts >= $1
          RETURNING id, project_id, action_id
        `, [MAX_WORKFLOW_ATTEMPTS]);

        const reapedCount = result?.rowCount || 0;

        if (reapedCount > 0) {
          console.warn(`[ScheduledJobs] Reaped ${reapedCount} stuck workflow runs`);
          await loggingService.logCriticalError('workflow_stuck_runs_reaped', new Error(`${reapedCount} workflow runs reaped`), {
            job: 'workflow-stuck-reaper',
            reapedCount,
            maxAttempts: MAX_WORKFLOW_ATTEMPTS,
            runIds: result.rows.map((r: { id: string }) => r.id),
          });
        }

        return { reapedCount };
      } catch (error) {
        console.error('[ScheduledJobs] Workflow stuck reaper failed:', error);
        return { reapedCount: 0, error: true };
      }
    });

    // Don't log skips for frequent jobs to reduce noise
  }, CRON_TZ));

  console.log('[ScheduledJobs] Scheduled jobs initialized');
}

/**
 * Stop all scheduled jobs gracefully.
 * Call this on process shutdown (SIGTERM, SIGINT).
 */
export function stopScheduledJobs(): void {
  for (const task of tasks) {
    task.stop();
  }
  tasks = [];
  initialized = false;
  console.log('[ScheduledJobs] Scheduled jobs stopped');
}

// Hook process signals for graceful shutdown
process.on('SIGTERM', () => stopScheduledJobs());
process.on('SIGINT', () => stopScheduledJobs());

// Optional: Manual triggers for testing
export async function runExchangeRateUpdate(): Promise<void> {
  await updateExchangeRates();
}

export async function runDailyBackups(): Promise<{ success: number; failed: number; skipped: number }> {
  const backupService = getInhouseBackupService();
  return await backupService.runDailyBackups();
}

export async function runBackupCleanup(): Promise<{ deleted: number; failed: number }> {
  const backupService = getInhouseBackupService();
  return await backupService.cleanupExpiredBackups();
}

export async function runViewRefresh(): Promise<void> {
  const { pool: dbPool } = await import('../services/database');

  // Run REFRESH CONCURRENTLY commands individually
  const views = [
    'mv_mrr_by_currency',
    'mv_mrr_usd_normalized',
    'mv_customer_ltv_summary',
    'mv_monthly_revenue_history',
    'mv_arpu_metrics'
  ];

  for (const view of views) {
    try {
      await dbPool?.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`);
      console.log(`[Manual Refresh] Refreshed ${view}`);
    } catch (err) {
      console.error(`[Manual Refresh] Failed to refresh ${view}:`, err);
    }
  }
}

// Activity log cleanup disabled - preserving historical data
// TODO: Implement archival strategy before re-enabling
// export async function runActivityLogCleanup(retentionDays: number = 30): Promise<{ deletedCount: number }> { ... }

export async function runWebhookEventsCleanup(retentionDays: number = 30): Promise<{ webhookEventsDeleted: number; stripeEventsDeleted: number }> {
  let webhookEventsDeleted = 0;
  let stripeEventsDeleted = 0;

  const webhookResult = await pool?.query(`
    DELETE FROM inhouse_webhook_events
    WHERE status = 'completed'
      AND received_at < NOW() - make_interval(days => $1)
  `, [retentionDays]);
  webhookEventsDeleted = webhookResult?.rowCount || 0;

  const stripeResult = await pool?.query(`
    DELETE FROM stripe_processed_events
    WHERE processed_at < NOW() - make_interval(days => $1)
  `, [retentionDays]);
  stripeEventsDeleted = stripeResult?.rowCount || 0;

  console.log(`[Manual Cleanup] Webhook events: ${webhookEventsDeleted} webhook events, ${stripeEventsDeleted} Stripe events deleted`);
  return { webhookEventsDeleted, stripeEventsDeleted };
}
