/**
 * Workspace Provisioning Worker
 *
 * Background worker that processes the workspace_provisioning_queue:
 * - Retries failed provisioning attempts
 * - Handles rollback_needed status (EXPERT FIX #2)
 * - Reaps stale processing locks from crashed workers (EXPERT FIX #4)
 * - Multi-instance safe with FOR UPDATE SKIP LOCKED
 *
 * Runs every 30 seconds to check for pending/rollback_needed items.
 *
 * @see docs/ADVISOR_WORKSPACE_PROVISIONING_PLAN.md
 */

import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import * as AdvisorWorkspaceService from '../services/advisorWorkspaceService';

const logger = new ServerLoggingService();
const INSTANCE_ID = AdvisorWorkspaceService.INSTANCE_ID;

export class WorkspaceProvisioningWorker {
  private isRunning = false;
  private readonly INTERVAL_MS = 30_000; // 30 seconds
  private intervalHandle?: NodeJS.Timeout;

  async start(): Promise<void> {
    console.log(`[WorkspaceProvisioningWorker] Starting with ID: ${INSTANCE_ID}`);

    await logger.logServerEvent('advisor_matching', 'info',
      'Workspace provisioning worker started', { instanceId: INSTANCE_ID }
    );

    this.intervalHandle = setInterval(async () => {
      if (this.isRunning) {
        console.log('[WorkspaceProvisioningWorker] Skipping (previous run in progress)');
        return;
      }
      await this.processRetryQueue();
    }, this.INTERVAL_MS);
  }

  async stop(): Promise<void> {
    console.log('[WorkspaceProvisioningWorker] Stopping...');
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    await logger.logServerEvent('advisor_matching', 'info',
      'Workspace provisioning worker stopped', { instanceId: INSTANCE_ID }
    );
  }

  /**
   * EXPERT FIX #2 & #4: Process both pending and rollback_needed, with stale lock recovery
   */
  private async processRetryQueue(): Promise<void> {
    this.isRunning = true;

    try {
      if (!pool) {
        console.log('[WorkspaceProvisioningWorker] Database not available, skipping');
        return;
      }

      // EXPERT FIX #4: Reap stale locks first (crashed workers)
      await this.reapStaleLocks();

      // EXPERT FIX #1 & #2: Multi-instance safety + handle both pending AND rollback_needed
      const items = await pool.query(`
        WITH cte AS (
          SELECT id
          FROM workspace_provisioning_queue
          WHERE status IN ('pending', 'rollback_needed')
            AND attempt_count < max_attempts
            AND next_retry_at <= now()
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 10
        )
        UPDATE workspace_provisioning_queue q
        SET status = 'processing',
            locked_at = now(),
            locked_by = $1
        FROM cte
        WHERE q.id = cte.id
        RETURNING q.*
      `, [INSTANCE_ID]);

      if (items.rows.length > 0) {
        console.log(`[WorkspaceProvisioningWorker] Processing ${items.rows.length} items`);
      }

      for (const item of items.rows) {
        // EXPERT FIX #2: Branch based on status
        if (item.status === 'rollback_needed') {
          // Non-recoverable error - trigger rollback immediately
          await this.handleRollback(item);
        } else {
          // Recoverable error - attempt retry
          await this.handleRetry(item);
        }
      }

    } catch (error: any) {
      await logger.logServerEvent('advisor_matching', 'error',
        'Worker error', {
          error: error.message,
          stack: error.stack,
          instanceId: INSTANCE_ID
        }
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Handle retry for recoverable errors
   */
  private async handleRetry(item: any): Promise<void> {
    if (!pool) return;

    try {
      const success = await AdvisorWorkspaceService.retryFailedProvisioning(item.id);

      if (!success && item.attempt_count + 1 >= item.max_attempts) {
        // Exhausted retries - trigger rollback
        await AdvisorWorkspaceService.rollbackMatch(
          item.match_id,
          `Workspace provisioning failed after ${item.max_attempts} attempts`
        );

        // Mark queue item as failed
        await pool.query(`
          UPDATE workspace_provisioning_queue
          SET status = 'failed'
          WHERE id = $1
        `, [item.id]);

        await logger.logServerEvent('advisor_matching', 'error',
          'Provisioning failed after all retries', {
            queueItemId: item.id,
            matchId: item.match_id,
            attempts: item.max_attempts,
            lastError: item.last_error
          }
        );
      }
    } catch (error: any) {
      await logger.logServerEvent('advisor_matching', 'error',
        'Retry handler error', {
          queueItemId: item.id,
          matchId: item.match_id,
          error: error.message
        }
      );

      // Reset to pending for next worker cycle
      await pool.query(`
        UPDATE workspace_provisioning_queue
        SET status = 'pending',
            locked_by = NULL,
            locked_at = NULL
        WHERE id = $1
      `, [item.id]);
    }
  }

  /**
   * Handle rollback for non-recoverable errors
   */
  private async handleRollback(item: any): Promise<void> {
    if (!pool) return;

    try {
      await AdvisorWorkspaceService.rollbackMatch(
        item.match_id,
        item.last_error || 'Non-recoverable provisioning error'
      );

      // Mark queue item as failed
      await pool.query(`
        UPDATE workspace_provisioning_queue
        SET status = 'failed'
        WHERE id = $1
      `, [item.id]);

      await logger.logServerEvent('advisor_matching', 'info',
        'Rollback completed for non-recoverable error', {
          queueItemId: item.id,
          matchId: item.match_id,
          error: item.last_error
        }
      );
    } catch (error: any) {
      await logger.logServerEvent('advisor_matching', 'error',
        'Rollback handler error', {
          queueItemId: item.id,
          matchId: item.match_id,
          error: error.message
        }
      );

      // Keep as rollback_needed for next worker cycle
      await pool.query(`
        UPDATE workspace_provisioning_queue
        SET locked_by = NULL,
            locked_at = NULL
        WHERE id = $1
      `, [item.id]);
    }
  }

  /**
   * EXPERT FIX #4: Reap Stale Locks
   *
   * Recovers jobs that were processing when a worker crashed.
   * Uses 2-minute heartbeat timeout (2× expected max execution time).
   */
  private async reapStaleLocks(): Promise<void> {
    if (!pool) return;

    const result = await pool.query(`
      UPDATE workspace_provisioning_queue
      SET status = 'pending',
          locked_by = NULL,
          locked_at = NULL
      WHERE status = 'processing'
        AND locked_at < now() - interval '2 minutes'
      RETURNING id, match_id, locked_by
    `);

    if (result.rows.length > 0) {
      await logger.logServerEvent('advisor_matching', 'warn',
        'Reaped stale processing locks', {
          count: result.rows.length,
          jobs: result.rows.map((r: any) => ({
            id: r.id,
            match_id: r.match_id,
            locked_by: r.locked_by
          }))
        }
      );
    }
  }
}

// Singleton instance
let workerInstance: WorkspaceProvisioningWorker | null = null;

export function startWorkspaceProvisioningWorker(): void {
  if (!workerInstance) {
    workerInstance = new WorkspaceProvisioningWorker();
    workerInstance.start();
  }
}

export function stopWorkspaceProvisioningWorker(): void {
  if (workerInstance) {
    workerInstance.stop();
    workerInstance = null;
  }
}