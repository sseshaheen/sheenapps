import { pool } from './database';
import { migrationAITimeService } from './migrationAITimeService';
import { migrationSSEService } from './migrationSSEService';
import { unifiedLogger } from './unifiedLogger';
import type { PoolClient } from 'pg';

/**
 * Migration Recovery Service
 * Implements deterministic retry logic and advanced error recovery
 * Handles phase-level resume, retry guardrails, and dead letter queue
 */

export interface RetryOptions {
  retryReason: 'tool_timeout' | 'ownership_failed' | 'budget_exceeded' | 'builder_incompatibility' | 'deployment_error';
  newUserBrief?: any;
  increasedBudget?: { softBudgetSeconds: number; hardBudgetSeconds: number };
  reuseSeeds?: boolean; // true = deterministic, false = new attempt
  maxRetries?: number;
  backoffMultiplier?: number;
}

export interface RetryReason {
  type: RetryOptions['retryReason'];
  context: Record<string, any>;
  timestamp: Date;
  retryable: boolean;
  userActionRequired?: boolean;
}

export interface RecoveryResult {
  success: boolean;
  newJobId?: string;
  message: string;
  nextAction?: 'retry' | 'user_action' | 'dead_letter';
  estimatedRetryAt?: Date;
}

export interface DeadLetterRecord {
  id: string;
  migrationId: string;
  originalError: string;
  retryAttempts: number;
  lastAttemptAt: Date;
  poisonReason: string;
  requiresManualIntervention: boolean;
}

export class MigrationRecoveryService {

  /**
   * Retry migration with deterministic reproducibility
   */
  async retryMigration(
    migrationId: string,
    userId: string,
    options: RetryOptions
  ): Promise<RecoveryResult> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get migration details
      const migration = await this.getMigrationDetails(migrationId, userId, client);
      if (!migration) {
        throw new Error('Migration not found or access denied');
      }

      // Check retry limits
      const retryCheck = await this.checkRetryLimits(migration.project_id, options, client);
      if (!retryCheck.canRetry) {
        return {
          success: false,
          message: retryCheck.reason,
          nextAction: retryCheck.nextAction
        };
      }

      // Record retry attempt
      const retryRecord = await this.recordRetryAttempt(
        migration.project_id,
        options,
        migration.stage,
        userId,
        client
      );

      // Apply budget increase if provided
      if (options.increasedBudget) {
        await this.applyBudgetIncrease(migration.project_id, options.increasedBudget, client);
      }

      // Apply user brief changes if provided
      if (options.newUserBrief) {
        await this.updateUserBrief(migration.project_id, options.newUserBrief, client);
      }

      // Create new job or reset existing job
      const newJobId = await this.createRetryJob(
        migration.project_id,
        migrationId,
        options,
        client
      );

      // Schedule retry with backoff if needed
      const retryAt = this.calculateRetryBackoff(retryRecord.retryCount, options.backoffMultiplier);

      await client.query('COMMIT');

      // Emit SSE event for retry initiation
      const retryEvent = migrationSSEService.createLogEvent(
        migrationId,
        migration.stage,
        migration.progress || 0,
        'info',
        `Migration retry initiated: ${options.retryReason}`,
        { retryCount: retryRecord.retryCount, newJobId }
      );

      await migrationSSEService.broadcastMigrationUpdate(migrationId, retryEvent);

      unifiedLogger.system('startup', 'info', 'Migration retry initiated', {
        migrationId,
        newJobId,
        retryReason: options.retryReason,
        retryCount: retryRecord.retryCount,
        reuseSeeds: options.reuseSeeds
      });

      return {
        success: true,
        newJobId,
        message: `Migration retry scheduled (attempt ${retryRecord.retryCount})`,
        nextAction: 'retry',
        estimatedRetryAt: retryAt
      };

    } catch (error) {
      await client.query('ROLLBACK');

      unifiedLogger.system('error', 'error', 'Migration retry failed', {
        migrationId,
        userId,
        error: (error as Error).message
      });

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resume from specific phase (skip completed phases idempotently)
   */
  async resumeFromPhase(
    migrationId: string,
    userId: string,
    phaseName: 'ANALYZE' | 'PLAN' | 'TRANSFORM' | 'VERIFY' | 'DEPLOY'
  ): Promise<RecoveryResult> {
    if (!pool) {
      throw new Error('Database not available');
    }

    try {
      // Verify migration ownership
      const migration = await this.getMigrationDetails(migrationId, userId);
      if (!migration) {
        throw new Error('Migration not found or access denied');
      }

      // Check if phase is already completed
      const completedPhases = await this.getCompletedPhases(migration.project_id);
      const phaseOrder = ['ANALYZE', 'PLAN', 'TRANSFORM', 'VERIFY', 'DEPLOY'];
      const resumeIndex = phaseOrder.indexOf(phaseName);

      if (resumeIndex === -1) {
        throw new Error(`Invalid phase: ${phaseName}`);
      }

      // Skip already completed phases
      let resumePhase = phaseName;
      for (let i = resumeIndex; i < phaseOrder.length; i++) {
        const phase = phaseOrder[i];
        if (phase && !completedPhases.includes(phase)) {
          resumePhase = phase as typeof phaseName;
          break;
        }
      }

      // Update migration job to resume from determined phase
      const updateQuery = `
        UPDATE migration_jobs
        SET stage = $2,
            status = 'pending',
            error_message = NULL,
            updated_at = NOW()
        WHERE id = $1
      `;

      await pool.query(updateQuery, [migrationId, resumePhase]);

      unifiedLogger.system('startup', 'info', 'Migration resumed from phase', {
        migrationId,
        requestedPhase: phaseName,
        actualResumePhase: resumePhase,
        completedPhases
      });

      return {
        success: true,
        message: `Migration resumed from ${resumePhase} phase`,
        nextAction: 'retry'
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to resume migration from phase', {
        migrationId,
        phaseName,
        error: (error as Error).message
      });

      throw error;
    }
  }

  /**
   * Capture retry taxonomy for analytics
   */
  async recordRetryReason(
    migrationId: string,
    reason: RetryReason
  ): Promise<void> {
    if (!pool) {
      return;
    }

    try {
      // Get migration project ID
      const projectQuery = `
        SELECT mp.id as project_id
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1
      `;

      const projectResult = await pool.query(projectQuery, [migrationId]);

      if (projectResult.rows.length === 0) {
        return;
      }

      const projectId = projectResult.rows[0].project_id;

      // Insert retry reason
      const insertQuery = `
        INSERT INTO migration_retry_reasons (
          migration_project_id, reason_type, context_data,
          retryable, user_action_required, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await pool.query(insertQuery, [
        projectId,
        reason.type,
        JSON.stringify(reason.context),
        reason.retryable,
        reason.userActionRequired || false,
        reason.timestamp
      ]);

      unifiedLogger.system('startup', 'info', 'Retry reason recorded', {
        migrationId,
        reasonType: reason.type,
        retryable: reason.retryable
      });

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to record retry reason', {
        migrationId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Move poison jobs to dead letter queue
   */
  async moveToDeadLetterQueue(
    migrationId: string,
    poisonReason: string,
    requiresManualIntervention: boolean = true
  ): Promise<DeadLetterRecord> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get migration details
      const migrationQuery = `
        SELECT mj.*, mp.id as project_id
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.id = $1
      `;

      const migrationResult = await client.query(migrationQuery, [migrationId]);

      if (migrationResult.rows.length === 0) {
        throw new Error('Migration not found');
      }

      const migration = migrationResult.rows[0];

      // Insert into dead letter queue
      const dlqQuery = `
        INSERT INTO migration_job_dlq (
          migration_project_id, original_job_id, original_error,
          retry_attempts, last_attempt_at, poison_reason,
          requires_manual_intervention, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
      `;

      const dlqResult = await client.query(dlqQuery, [
        migration.project_id,
        migrationId,
        migration.error_message || 'Unknown error',
        migration.retry_count || 0,
        migration.last_retry_at || migration.updated_at,
        poisonReason,
        requiresManualIntervention
      ]);

      // Mark original job as moved to DLQ
      const updateJobQuery = `
        UPDATE migration_jobs
        SET status = 'dlq',
            error_message = CONCAT(COALESCE(error_message, ''), ' [Moved to DLQ: ', $2, ']'),
            updated_at = NOW()
        WHERE id = $1
      `;

      await client.query(updateJobQuery, [migrationId, poisonReason]);

      await client.query('COMMIT');

      const dlqRecord: DeadLetterRecord = {
        id: dlqResult.rows[0].id,
        migrationId,
        originalError: migration.error_message || 'Unknown error',
        retryAttempts: migration.retry_count || 0,
        lastAttemptAt: new Date(migration.last_retry_at || migration.updated_at),
        poisonReason,
        requiresManualIntervention
      };

      // Emit SSE event for DLQ move
      const dlqEvent = migrationSSEService.createErrorEvent(
        migrationId,
        migration.stage,
        migration.progress || 0,
        'MIGRATION_POISONED',
        `Migration moved to dead letter queue: ${poisonReason}`,
        false // Not retryable
      );

      await migrationSSEService.broadcastMigrationUpdate(migrationId, dlqEvent);

      unifiedLogger.system('warning', 'warn', 'Migration moved to dead letter queue', {
        migrationId,
        dlqId: dlqRecord.id,
        poisonReason,
        retryAttempts: dlqRecord.retryAttempts
      });

      return dlqRecord;

    } catch (error) {
      await client.query('ROLLBACK');

      unifiedLogger.system('error', 'error', 'Failed to move migration to DLQ', {
        migrationId,
        poisonReason,
        error: (error as Error).message
      });

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle watchdog timeout (mark jobs failed, close AI time sessions)
   */
  async handleWatchdogTimeout(migrationId: string): Promise<void> {
    if (!pool) {
      return;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get migration details
      const migrationQuery = `
        SELECT mj.*, mp.user_id
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.id = $1 AND mj.status = 'running'
      `;

      const migrationResult = await client.query(migrationQuery, [migrationId]);

      if (migrationResult.rows.length === 0) {
        return; // Migration not running or not found
      }

      const migration = migrationResult.rows[0];

      // Mark job as failed due to timeout
      const updateJobQuery = `
        UPDATE migration_jobs
        SET status = 'failed',
            error_message = 'Migration timed out (watchdog)',
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `;

      await client.query(updateJobQuery, [migrationId]);

      await client.query('COMMIT');

      // Close any open AI time tracking sessions
      // Note: This is a simplified approach - in reality, we'd need to track active sessions
      try {
        const trackingId = `migration-${migrationId}-${migration.stage}`;
        await migrationAITimeService.endMigrationTracking(trackingId, false, migration.user_id);
      } catch (trackingError) {
        // Log but don't fail - tracking session might not exist
        unifiedLogger.system('warning', 'warn', 'Failed to close AI time session on watchdog timeout', {
          migrationId,
          error: (trackingError as Error).message
        });
      }

      // Emit SSE events
      const timeoutEvent = migrationSSEService.createErrorEvent(
        migrationId,
        migration.stage,
        migration.progress || 0,
        'WATCHDOG_TIMEOUT',
        'Migration timed out and was terminated',
        true // Retryable
      );

      const doneEvent = migrationSSEService.createDoneEvent(
        migrationId,
        false, // success = false
        0, // duration unknown
        0, // AI time unknown
        undefined, // no project ID
        undefined, // no preview URL
        { timeoutReason: 'watchdog', stage: migration.stage }
      );

      await migrationSSEService.broadcastMigrationUpdate(migrationId, timeoutEvent);
      await migrationSSEService.broadcastMigrationUpdate(migrationId, doneEvent);

      unifiedLogger.system('warning', 'warn', 'Migration terminated by watchdog', {
        migrationId,
        stage: migration.stage,
        userId: migration.user_id
      });

    } catch (error) {
      await client.query('ROLLBACK');

      unifiedLogger.system('error', 'error', 'Failed to handle watchdog timeout', {
        migrationId,
        error: (error as Error).message
      });

      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // PRIVATE HELPER METHODS
  // =====================================================

  private async getMigrationDetails(
    migrationId: string,
    userId: string,
    client?: PoolClient
  ): Promise<any | null> {
    const queryClient = client || pool;
    if (!queryClient) return null;

    const query = `
      SELECT mj.*, mp.id as project_id, mp.user_id
      FROM migration_jobs mj
      JOIN migration_projects mp ON mp.id = mj.migration_project_id
      WHERE mj.id = $1 AND mp.user_id = $2
    `;

    const result = await queryClient.query(query, [migrationId, userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async checkRetryLimits(
    projectId: string,
    options: RetryOptions,
    client: PoolClient
  ): Promise<{ canRetry: boolean; reason: string; nextAction: 'retry' | 'dead_letter' }> {
    const maxRetries = options.maxRetries || 3;

    // Get current retry count for this project
    const retryQuery = `
      SELECT COUNT(*) as retry_count
      FROM migration_retries
      WHERE migration_project_id = $1
        AND retry_reason = $2
        AND created_at > NOW() - INTERVAL '24 hours'
    `;

    const result = await client.query(retryQuery, [projectId, options.retryReason]);
    const retryCount = parseInt(result.rows[0].retry_count) || 0;

    if (retryCount >= maxRetries) {
      return {
        canRetry: false,
        reason: `Maximum retries (${maxRetries}) exceeded for ${options.retryReason}`,
        nextAction: 'dead_letter'
      };
    }

    return { canRetry: true, reason: '', nextAction: 'retry' };
  }

  private async recordRetryAttempt(
    projectId: string,
    options: RetryOptions,
    previousPhase: string,
    userId: string,
    client: PoolClient
  ): Promise<{ id: string; retryCount: number }> {
    const insertQuery = `
      INSERT INTO migration_retries (
        migration_project_id, retry_reason, previous_phase,
        new_settings, initiated_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `;

    const result = await client.query(insertQuery, [
      projectId,
      options.retryReason,
      previousPhase,
      JSON.stringify(options),
      userId
    ]);

    // Get total retry count
    const countQuery = `
      SELECT COUNT(*) as total_retries
      FROM migration_retries
      WHERE migration_project_id = $1
    `;

    const countResult = await client.query(countQuery, [projectId]);

    return {
      id: result.rows[0].id,
      retryCount: parseInt(countResult.rows[0].total_retries) || 1
    };
  }

  private async applyBudgetIncrease(
    projectId: string,
    budget: { softBudgetSeconds: number; hardBudgetSeconds: number },
    client: PoolClient
  ): Promise<void> {
    const updateQuery = `
      UPDATE migration_projects
      SET soft_budget_seconds = $2,
          hard_budget_seconds = $3,
          updated_at = NOW()
      WHERE id = $1
    `;

    await client.query(updateQuery, [projectId, budget.softBudgetSeconds, budget.hardBudgetSeconds]);
  }

  private async updateUserBrief(
    projectId: string,
    userBrief: any,
    client: PoolClient
  ): Promise<void> {
    const updateQuery = `
      UPDATE migration_user_brief
      SET goals = $2,
          style_preferences = $3,
          framework_preferences = $4,
          content_tone = $5,
          non_negotiables = $6,
          risk_appetite = $7,
          custom_instructions = $8,
          updated_at = NOW()
      WHERE migration_project_id = $1
    `;

    await client.query(updateQuery, [
      projectId,
      userBrief.goals,
      JSON.stringify(userBrief.stylePreferences || {}),
      JSON.stringify(userBrief.frameworkPreferences || {}),
      userBrief.contentTone,
      JSON.stringify(userBrief.nonNegotiables || {}),
      userBrief.riskAppetite,
      userBrief.customInstructions
    ]);
  }

  private async createRetryJob(
    projectId: string,
    originalJobId: string,
    options: RetryOptions,
    client: PoolClient
  ): Promise<string> {
    const insertQuery = `
      INSERT INTO migration_jobs (
        migration_project_id, stage, status, idempotency_key,
        result_meta, created_at
      ) VALUES (
        $1, 'ANALYZE', 'pending', gen_random_uuid()::text,
        jsonb_build_object(
          'retry_of', $2,
          'retry_reason', $3,
          'reuse_seeds', $4,
          'retry_options', $5
        ),
        NOW()
      )
      RETURNING id
    `;

    const result = await client.query(insertQuery, [
      projectId,
      originalJobId,
      options.retryReason,
      options.reuseSeeds,
      JSON.stringify(options)
    ]);

    return result.rows[0].id;
  }

  private async getCompletedPhases(projectId: string): Promise<string[]> {
    if (!pool) return [];

    const query = `
      SELECT DISTINCT phase_name
      FROM migration_phases
      WHERE migration_project_id = $1
        AND status = 'completed'
    `;

    const result = await pool.query(query, [projectId]);
    return result.rows.map(row => row.phase_name);
  }

  private calculateRetryBackoff(
    retryCount: number,
    multiplier: number = 2
  ): Date {
    // Exponential backoff: 1min, 2min, 4min, 8min, etc.
    const baseDelayMs = 60 * 1000; // 1 minute
    const delayMs = baseDelayMs * Math.pow(multiplier, retryCount - 1);
    const maxDelayMs = 30 * 60 * 1000; // Cap at 30 minutes

    return new Date(Date.now() + Math.min(delayMs, maxDelayMs));
  }
}

// Export singleton instance
export const migrationRecoveryService = new MigrationRecoveryService();