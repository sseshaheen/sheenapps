/**
 * In-House Activity Logger
 *
 * Centralized activity logging for In-House Mode services.
 * Writes to inhouse_activity_log table for admin visibility and auditing.
 *
 * Design principles:
 * - Fire-and-forget: Never blocks the main request
 * - Fail-safe: Logging errors don't affect service operations
 * - Lightweight: Minimal overhead per request
 *
 * Part of INHOUSE_ADMIN_PLAN.md
 */

import { getPool } from '../database'
import { createLogger } from '../../observability/logger'

const activityLogger = createLogger('inhouse-activity')

// =============================================================================
// TYPES
// =============================================================================

export type ActivityService =
  | 'auth'
  | 'db'
  | 'storage'
  | 'jobs'
  | 'email'
  | 'payments'
  | 'analytics'
  | 'secrets'
  | 'backups'
  | 'flags'
  | 'connectors'
  | 'edge-functions'
  | 'ai'
  | 'realtime'
  | 'notifications'
  | 'forms'
  | 'search'
  | 'domain-billing'
  | 'domain-registration'
  | 'domains'
  | 'inbox'

export type ActivityStatus = 'success' | 'error' | 'pending' | 'warning'

export type ActorType = 'user' | 'system' | 'admin' | 'cron' | 'webhook'

export interface ActivityLogEntry {
  projectId: string
  service: ActivityService
  action: string
  status?: ActivityStatus
  correlationId?: string
  actorType?: ActorType
  actorId?: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  durationMs?: number
  errorCode?: string
}

// =============================================================================
// LOGGER IMPLEMENTATION
// =============================================================================

/**
 * Log an activity to the inhouse_activity_log table.
 *
 * This is fire-and-forget - it will not throw errors or block the caller.
 * Errors are logged to console but do not propagate.
 *
 * @example
 * ```typescript
 * // Log a successful file upload
 * logActivity({
 *   projectId: 'proj-123',
 *   service: 'storage',
 *   action: 'upload',
 *   actorType: 'user',
 *   actorId: 'user-456',
 *   resourceType: 'file',
 *   resourceId: 'uploads/photo.jpg',
 *   metadata: { contentType: 'image/jpeg', sizeBytes: 1024000 }
 * })
 *
 * // Log a failed job enqueue
 * logActivity({
 *   projectId: 'proj-123',
 *   service: 'jobs',
 *   action: 'enqueue',
 *   status: 'error',
 *   errorCode: 'QUOTA_EXCEEDED',
 *   metadata: { jobName: 'send-email' }
 * })
 * ```
 */
export function logActivity(entry: ActivityLogEntry): void {
  // Fire-and-forget - void makes intent explicit and avoids lint issues
  void logActivityAsync(entry).catch((err) => {
    activityLogger.warn({ err, entry: { projectId: entry.projectId, service: entry.service, action: entry.action } }, 'Failed to log activity')
  })
}

/**
 * Log an activity and wait for completion.
 * Use this only when you need to ensure the log was written.
 */
export async function logActivityAsync(entry: ActivityLogEntry): Promise<void> {
  const pool = getPool()

  // Default to 'system' when no actorId - prevents confusing "user did X" with no user
  const actorType = entry.actorType ?? (entry.actorId ? 'user' : 'system')

  await pool.query(
    `INSERT INTO inhouse_activity_log (
      project_id,
      service,
      action,
      status,
      correlation_id,
      actor_type,
      actor_id,
      resource_type,
      resource_id,
      metadata,
      duration_ms,
      error_code
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      entry.projectId,
      entry.service,
      entry.action,
      entry.status || 'success',
      entry.correlationId || null,
      actorType,
      entry.actorId || null,
      entry.resourceType || null,
      entry.resourceId || null,
      safeJsonMetadata(entry.metadata),
      entry.durationMs || null,
      entry.errorCode || null,
    ]
  )
}

/**
 * Safely serialize metadata with size limit to prevent DB bloat.
 * Truncates large metadata and marks it as truncated.
 */
function safeJsonMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null
  const MAX_SIZE = 8000 // ~8KB, safe for JSONB
  let json = JSON.stringify(metadata)
  if (json.length > MAX_SIZE) {
    json = JSON.stringify({ _truncated: true, preview: json.slice(0, MAX_SIZE - 50) })
  }
  return json
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a timed activity logger that measures duration automatically.
 *
 * @example
 * ```typescript
 * const timer = startActivityTimer({
 *   projectId: 'proj-123',
 *   service: 'jobs',
 *   action: 'enqueue',
 *   actorType: 'user',
 *   actorId: 'user-456'
 * })
 *
 * // ... do work ...
 *
 * timer.success({ resourceType: 'job', resourceId: 'job-789' })
 * // or
 * timer.error('QUOTA_EXCEEDED', { jobName: 'send-email' })
 * ```
 */
export function startActivityTimer(
  baseEntry: Omit<ActivityLogEntry, 'status' | 'durationMs' | 'errorCode'>
): ActivityTimer {
  const startTime = Date.now()

  return {
    success(extra?: Partial<ActivityLogEntry>) {
      logActivity({
        ...baseEntry,
        ...extra,
        status: 'success',
        durationMs: Date.now() - startTime,
      })
    },
    error(errorCode: string, extra?: Partial<ActivityLogEntry>) {
      logActivity({
        ...baseEntry,
        ...extra,
        status: 'error',
        errorCode,
        durationMs: Date.now() - startTime,
      })
    },
    pending(extra?: Partial<ActivityLogEntry>) {
      logActivity({
        ...baseEntry,
        ...extra,
        status: 'pending',
        durationMs: Date.now() - startTime,
      })
    },
  }
}

export interface ActivityTimer {
  success(extra?: Partial<ActivityLogEntry>): void
  error(errorCode: string, extra?: Partial<ActivityLogEntry>): void
  pending(extra?: Partial<ActivityLogEntry>): void
}

// =============================================================================
// SERVICE SINGLETON (optional, for consistency with other services)
// =============================================================================

let loggerInstance: InhouseActivityLoggerService | null = null

export function getInhouseActivityLogger(): InhouseActivityLoggerService {
  if (!loggerInstance) {
    loggerInstance = new InhouseActivityLoggerService()
  }
  return loggerInstance
}

export class InhouseActivityLoggerService {
  log(entry: ActivityLogEntry): void {
    logActivity(entry)
  }

  async logAsync(entry: ActivityLogEntry): Promise<void> {
    return logActivityAsync(entry)
  }

  startTimer(
    baseEntry: Omit<ActivityLogEntry, 'status' | 'durationMs' | 'errorCode'>
  ): ActivityTimer {
    return startActivityTimer(baseEntry)
  }
}
