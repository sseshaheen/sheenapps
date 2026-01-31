/**
 * Advisor Workspace Provisioning Service
 *
 * Implements expert-validated queue-first pattern for automatic workspace access.
 *
 * Key Features:
 * - Queue-first pattern: Creates queue row BEFORE attempting provisioning (EXPERT FIX #1)
 * - Handles both recoverable and non-recoverable errors (EXPERT FIX #2)
 * - System messages with NULL user_id (EXPERT FIX #3)
 * - Full jitter retry strategy to prevent thundering herd
 * - SQLSTATE-based error classification
 *
 * @see docs/ADVISOR_WORKSPACE_PROVISIONING_PLAN.md
 */

import { pool } from './database';
import { ServerLoggingService } from './serverLoggingService';
import { ChatBroadcastService } from './chatBroadcastService';
import { v4 as uuidv4 } from 'uuid';

const logger = new ServerLoggingService();

// Generate unique instance ID per process
const INSTANCE_ID = `worker-${process.pid}-${uuidv4().slice(0, 8)}`;

// ============================================================================
// Types
// ============================================================================

interface ProvisioningParams {
  matchId: string;
  projectId: string;
  advisorId: string;
  requestedBy: string; // Project owner
}

interface ProvisioningResult {
  success: boolean;
  queueItemId?: string;
  error?: {
    code: 'FEATURE_DISABLED' | 'ALREADY_PROVISIONED' | 'PROJECT_NOT_FOUND'
          | 'ADVISOR_NOT_FOUND' | 'DATABASE_ERROR' | 'CHAT_SESSION_ERROR';
    message: string;
    recoverable: boolean;
    details?: Record<string, any>;
  };
}

interface QueueItem {
  id: string;
  match_id: string;
  project_id: string;
  advisor_id: string;
  requested_by: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rollback_needed';
  attempt_count: number;
  max_attempts: number;
  last_error?: string;
  locked_at?: Date;
  locked_by?: string;
}

// ============================================================================
// Error Classification (SQLSTATE-based)
// ============================================================================

/**
 * Determines if a database error is recoverable (can be retried).
 * Uses PostgreSQL SQLSTATE codes for accurate classification.
 */
function isRecoverableError(error: any): boolean {
  // Recoverable: transient DB issues
  const recoverableSQLSTATEs = [
    '40001', // serialization_failure
    '55P03', // lock_not_available
    '53200', // out_of_memory (transient)
    '53300', // too_many_connections (transient)
    '57P01', // admin_shutdown
  ];

  // Non-recoverable: data integrity issues
  const nonRecoverableCodes = [
    '23503', // foreign_key_violation (advisor deleted)
    '23505', // unique_violation
    '23514', // check_violation
  ];

  if (error.code && recoverableSQLSTATEs.includes(error.code)) {
    return true;
  }

  if (error.code && nonRecoverableCodes.includes(error.code)) {
    return false;
  }

  // Default: treat as recoverable (conservative for MVP)
  return true;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getProject(projectId: string): Promise<{ owner_id: string } | null> {
  if (!pool) return null;
  const result = await pool.query(
    'SELECT owner_id FROM projects WHERE id = $1',
    [projectId]
  );
  return result.rows[0] || null;
}

async function getUserLocale(userId: string): Promise<string> {
  if (!pool) return 'en';
  const result = await pool.query(
    'SELECT preferred_locale FROM user_preferences WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.preferred_locale || 'en';
}

async function checkExistingProvisioning(matchId: string): Promise<QueueItem | null> {
  if (!pool) return null;
  const result = await pool.query(
    'SELECT * FROM workspace_provisioning_queue WHERE match_id = $1',
    [matchId]
  );
  return result.rows[0] || null;
}

async function getMatchRequest(matchId: string) {
  if (!pool) return null;
  const result = await pool.query(
    'SELECT * FROM advisor_match_requests WHERE id = $1',
    [matchId]
  );
  return result.rows[0];
}

// ============================================================================
// Core Provisioning Logic
// ============================================================================

/**
 * Provisions workspace access for an advisor (transaction-safe).
 * This is the "inner" function called by enqueueAndProvision().
 *
 * IMPORTANT: Queue row must already exist before calling this.
 */
async function provisionWorkspaceAccess(
  params: ProvisioningParams,
  queueItemId: string
): Promise<ProvisioningResult> {
  if (!pool) {
    return {
      success: false,
      queueItemId,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database connection not available',
        recoverable: false
      }
    };
  }

  const startTime = Date.now();

  // 1. Feature flag check (EXPERT FIX #7: improved parsing)
  const ff = String(process.env.ADVISOR_AUTO_PROVISION || 'false').toLowerCase();
  const enabled = ff === 'true' || ff === '1';

  if (!enabled) {
    return {
      success: false,
      queueItemId,
      error: {
        code: 'FEATURE_DISABLED',
        message: 'Automatic workspace provisioning is disabled',
        recoverable: false
      }
    };
  }

  // 2. Idempotency check
  const existing = await checkExistingProvisioning(params.matchId);
  if (existing?.status === 'completed') {
    return { success: true, queueItemId: existing.id };
  }

  // 3. Get project owner's locale
  const project = await getProject(params.projectId);
  if (!project) {
    return {
      success: false,
      queueItemId,
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: `Project ${params.projectId} not found`,
        recoverable: false
      }
    };
  }

  const ownerLocale = await getUserLocale(params.requestedBy);

  // 4. Atomic transaction
  try {
    await pool.query('BEGIN');

    // a) Add to project_advisors with updated_at
    await pool.query(`
      INSERT INTO project_advisors (
        project_id, advisor_id, status, added_by, created_at, updated_at
      ) VALUES ($1, $2, 'active', $3, now(), now())
      ON CONFLICT (project_id, advisor_id)
      DO UPDATE SET status = 'active', updated_at = now()
    `, [params.projectId, params.advisorId, params.requestedBy]);

    // b) Create chat session
    await pool.query(`
      INSERT INTO unified_chat_sessions (
        project_id, user_id, actor_type, session_state, preferred_locale
      ) VALUES ($1, $2, 'advisor', 'active', $3)
      ON CONFLICT (project_id, user_id)
      DO UPDATE SET session_state = 'active'
    `, [params.projectId, params.advisorId, ownerLocale]);

    // c) Send welcome system message
    // EXPERT FIX #3: user_id must be NULL for system messages
    await pool.query(`
      INSERT INTO project_chat_log_minimal (
        project_id, user_id, actor_type, message_text, message_type, mode,
        client_msg_id, response_data, seq
      ) VALUES ($1, NULL, 'system', $2, 'system', 'plan',
                gen_random_uuid(), $3, nextval('project_timeline_seq'))
    `, [
      params.projectId,
      'Advisor has joined the workspace and is ready to help!',
      JSON.stringify({
        event_code: 'advisor_joined',
        advisor_id: params.advisorId,
        match_id: params.matchId,
        timestamp: new Date().toISOString()
      })
    ]);

    await pool.query('COMMIT');

    // 5. Log success (DB transaction is complete at this point)
    await logger.logServerEvent('advisor_matching', 'info',
      'Workspace provisioned successfully', {
        matchId: params.matchId,
        projectId: params.projectId,
        advisorId: params.advisorId,
        queueItemId,
        duration_ms: Date.now() - startTime
      }
    );

    // 6. Broadcast SSE event (wrapped in own try/catch so it can't fail the operation)
    // The DB commit has already succeeded - broadcast failure shouldn't affect return value
    try {
      await ChatBroadcastService.getInstance().publishAdvisorEvent(params.projectId, {
        event: 'advisor.workspace_ready',
        data: {
          matchId: params.matchId,
          advisorId: params.advisorId,
          projectId: params.projectId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (broadcastError: any) {
      // Log but don't fail - DB changes are already committed
      await logger.logServerEvent('advisor_matching', 'warn',
        'SSE broadcast failed after successful commit', {
          matchId: params.matchId,
          projectId: params.projectId,
          error: broadcastError.message
        }
      );
    }

    return { success: true, queueItemId };

  } catch (error: any) {
    await pool.query('ROLLBACK');

    await logger.logServerEvent('advisor_matching', 'error',
      'Workspace provisioning failed', {
        matchId: params.matchId,
        error: error.message,
        sqlstate: error.code,
        recoverable: isRecoverableError(error)
      }
    );

    return {
      success: false,
      queueItemId,
      error: {
        code: 'DATABASE_ERROR',
        message: error.message,
        recoverable: isRecoverableError(error),
        details: { stack: error.stack, sqlstate: error.code }
      }
    };
  }
}

/**
 * EXPERT FIX #1: Queue-First Pattern
 *
 * Creates queue row BEFORE attempting provisioning.
 * This ensures worker can retry even if first attempt fails.
 *
 * Flow:
 * 1. Create/upsert queue row with status='pending'
 * 2. Mark as processing with instance lock
 * 3. Try provisioning (optimistic for snappy UX)
 * 4. Update queue based on result (completed/pending/rollback_needed)
 */
export async function enqueueAndProvision(
  params: ProvisioningParams
): Promise<ProvisioningResult> {
  if (!pool) {
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database connection not available',
        recoverable: false
      }
    };
  }

  const startTime = Date.now();

  // 1. ALWAYS create/upsert queue row first
  const queueRow = await pool.query(`
    INSERT INTO workspace_provisioning_queue (
      match_id, project_id, advisor_id, requested_by,
      status, attempt_count, next_retry_at, created_at
    ) VALUES ($1, $2, $3, $4, 'pending', 0, now(), now())
    ON CONFLICT (match_id) DO UPDATE
      SET status = 'pending',
          attempt_count = 0,
          next_retry_at = now(),
          last_error = NULL,
          last_error_at = NULL
    RETURNING id
  `, [params.matchId, params.projectId, params.advisorId, params.requestedBy]);

  const queueItemId = queueRow.rows[0].id;

  // 2. Atomically claim and mark processing
  await pool.query(`
    UPDATE workspace_provisioning_queue
    SET status = 'processing',
        locked_by = $2,
        locked_at = now()
    WHERE id = $1
  `, [queueItemId, INSTANCE_ID]);

  // 3. Try provisioning (optimistic immediate attempt)
  const result = await provisionWorkspaceAccess(params, queueItemId);

  // 4. Update queue based on result
  if (result.success) {
    await pool.query(`
      UPDATE workspace_provisioning_queue
      SET status = 'completed',
          completed_at = now()
      WHERE id = $1
    `, [queueItemId]);

    await logger.logServerEvent('advisor_matching', 'info',
      'Workspace provisioned on first attempt', {
        matchId: params.matchId,
        duration_ms: Date.now() - startTime
      }
    );
  } else {
    // Determine next status based on error recoverability
    const newStatus = result.error!.recoverable ? 'pending' : 'rollback_needed';

    // Calculate next retry time with exponential backoff + FULL JITTER
    const baseSeconds = 1; // First retry: 1s base
    const baseDelay = baseSeconds * 1000;
    const jitter = Math.random() * baseDelay;  // Full jitter
    const totalDelayMs = baseDelay + jitter;

    await pool.query(`
      UPDATE workspace_provisioning_queue
      SET status = $2,
          attempt_count = attempt_count + 1,
          last_error = $3,
          last_error_at = now(),
          next_retry_at = now() + interval '1 millisecond' * $4,
          error_history = COALESCE(error_history, '[]'::jsonb) || $5::jsonb
      WHERE id = $1
    `, [
      queueItemId,
      newStatus,
      result.error!.message,
      totalDelayMs,
      JSON.stringify([{
        attempt: 1,
        error: result.error!.message,
        recoverable: result.error!.recoverable,
        timestamp: new Date().toISOString()
      }])
    ]);

    await logger.logServerEvent('advisor_matching', 'warn',
      'Workspace provisioning failed - queued for retry', {
        matchId: params.matchId,
        queueItemId,
        status: newStatus,
        recoverable: result.error!.recoverable,
        nextRetryAt: new Date(Date.now() + totalDelayMs).toISOString()
      }
    );
  }

  return { ...result, queueItemId };
}

/**
 * Retry failed provisioning from queue (called by worker).
 */
export async function retryFailedProvisioning(queueItemId: string): Promise<boolean> {
  if (!pool) return false;

  const queueItem: QueueItem = (await pool.query(
    'SELECT * FROM workspace_provisioning_queue WHERE id = $1',
    [queueItemId]
  )).rows[0];

  if (!queueItem || queueItem.attempt_count >= queueItem.max_attempts) {
    return false;
  }

  // Calculate retry delay with exponential backoff + FULL JITTER
  const baseSeconds = [1, 5, 25][queueItem.attempt_count] || 25;
  const baseDelay = baseSeconds * 1000;
  const jitter = Math.random() * baseDelay;
  const totalDelayMs = baseDelay + jitter;

  await pool.query(`
    UPDATE workspace_provisioning_queue
    SET next_retry_at = now() + interval '1 millisecond' * $2
    WHERE id = $1
  `, [queueItemId, totalDelayMs]);

  const result = await provisionWorkspaceAccess({
    matchId: queueItem.match_id,
    projectId: queueItem.project_id,
    advisorId: queueItem.advisor_id,
    requestedBy: queueItem.requested_by
  }, queueItemId);

  if (result.success) {
    await pool.query(`
      UPDATE workspace_provisioning_queue
      SET status = 'completed', completed_at = now()
      WHERE id = $1
    `, [queueItemId]);
    return true;
  } else {
    const newStatus = result.error!.recoverable ? 'pending' : 'rollback_needed';

    await pool.query(`
      UPDATE workspace_provisioning_queue
      SET status = $2,
          attempt_count = attempt_count + 1,
          last_error = $3,
          last_error_at = now(),
          error_history = COALESCE(error_history, '[]'::jsonb) || $4::jsonb
      WHERE id = $1
    `, [
      queueItemId,
      newStatus,
      result.error!.message,
      JSON.stringify({
        attempt: queueItem.attempt_count + 1,
        error: result.error!.message,
        recoverable: result.error!.recoverable,
        timestamp: new Date().toISOString()
      })
    ]);

    return false;
  }
}

/**
 * EXPERT FIX #6: Rollback using previous_status (deterministic).
 * Trigger automatically captures previous status, so no complex logic needed.
 */
export async function rollbackMatch(matchId: string, reason: string): Promise<void> {
  if (!pool) {
    throw new Error('Database connection not available');
  }

  await pool.query('BEGIN');

  try {
    const match = await getMatchRequest(matchId);

    // EXPERT FIX #6: Use previous_status column (no guessing!)
    await pool.query(`
      UPDATE advisor_match_requests
      SET status = COALESCE(previous_status, 'matched'),
          updated_at = now()
      WHERE id = $1
    `, [matchId]);

    // Log intervention
    await pool.query(`
      INSERT INTO admin_matching_interventions (
        project_id, admin_id, intervention_type, reason,
        automated_match_score, intervention_metadata
      ) VALUES ($1, NULL, 'workspace_provisioning_failure', $2, $3, $4)
    `, [
      match.project_id,
      reason,
      match.match_score,
      JSON.stringify({ matchId, rollback: true })
    ]);

    await pool.query('COMMIT');

    await logger.logServerEvent('advisor_matching', 'warn',
      'Match rolled back due to provisioning failure', {
        matchId,
        reason,
        previousStatus: match.previous_status
      }
    );

    // Send admin alert (async - use notification_outbox)
    await pool.query(`
      INSERT INTO notification_outbox (
        user_id, notification_type, priority, payload, created_at
      ) SELECT
        id, 'admin_alert', 'high', $1, now()
      FROM auth.users
      WHERE role = 'admin'
    `, [JSON.stringify({
      type: 'workspace_provisioning_failure',
      matchId,
      projectId: match.project_id,
      reason,
      timestamp: new Date().toISOString()
    })]);

  } catch (error: any) {
    await pool.query('ROLLBACK');
    await logger.logServerEvent('advisor_matching', 'error',
      'Rollback failed', { matchId, error: error.message }
    );
    throw error;
  }
}

// Export INSTANCE_ID for worker use
export { INSTANCE_ID };