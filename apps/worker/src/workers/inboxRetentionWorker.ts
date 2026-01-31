/**
 * Inbox Retention Worker
 *
 * BullMQ repeatable job that runs daily to enforce message retention policies.
 * Deletes messages older than each inbox's configured retention_days.
 * Recalculates thread counters for affected threads.
 *
 * Processing Pattern:
 * 1. Scheduled job runs daily
 * 2. Query inboxes where retention_days IS NOT NULL
 * 3. Batch delete messages older than retention period
 * 4. Recalculate thread counters for affected threads
 * 5. Log results
 *
 * Part of easy-mode-email-plan.md (Phase 1.5: Post-Receive Pipeline)
 */

import { Worker, Job } from 'bullmq'
import { getPool } from '../services/databaseWrapper'
import { inboxRetentionQueue } from '../queue/modularQueues'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'

// =============================================================================
// Configuration
// =============================================================================

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
}

/** How often to run retention cleanup (24 hours) */
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Maximum messages to delete per inbox per run (prevent long transactions) */
const BATCH_DELETE_LIMIT = 1000

// =============================================================================
// Types
// =============================================================================

export interface InboxRetentionJobData {
  /** 'batch' for scheduled daily run */
  type: 'batch'
}

// =============================================================================
// Worker Class
// =============================================================================

export class InboxRetentionWorker {
  private worker: Worker<InboxRetentionJobData> | null = null

  constructor() {
    console.log('[InboxRetentionWorker] Initialized')
  }

  /**
   * Start the worker and schedule recurring cleanup
   */
  public async start(): Promise<void> {
    const pool = getPool()
    if (!pool) {
      console.error('[InboxRetentionWorker] Database not available - cannot start worker')
      return
    }

    this.worker = new Worker<InboxRetentionJobData>(
      'inbox-retention',
      async (job: Job<InboxRetentionJobData>) => {
        return this.processJob(job)
      },
      {
        connection: REDIS_CONNECTION,
        concurrency: 1, // Process one retention batch at a time
      }
    )

    // Event handlers
    this.worker.on('completed', (job) => {
      console.log(`[InboxRetentionWorker] Job ${job.id} completed`)
    })

    this.worker.on('failed', (job, error) => {
      console.error(`[InboxRetentionWorker] Job ${job?.id} failed:`, error.message)
    })

    this.worker.on('error', (error) => {
      console.error('[InboxRetentionWorker] Worker error:', error)
    })

    // Schedule recurring retention cleanup
    await this.scheduleRecurringCleanup()

    console.log('[InboxRetentionWorker] Started')
  }

  /**
   * Stop the worker
   */
  public async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close()
      this.worker = null
      console.log('[InboxRetentionWorker] Stopped')
    }
  }

  /**
   * Schedule recurring daily cleanup job
   */
  private async scheduleRecurringCleanup(): Promise<void> {
    if (!inboxRetentionQueue) {
      console.warn('[InboxRetentionWorker] Queue not available - cannot schedule recurring job')
      return
    }

    try {
      // Remove existing repeatable job if present
      const repeatableJobs = await inboxRetentionQueue.getRepeatableJobs()
      for (const job of repeatableJobs) {
        if (job.name === 'retention-cleanup') {
          await inboxRetentionQueue.removeRepeatableByKey(job.key)
        }
      }

      // Add new repeatable job (daily)
      await inboxRetentionQueue.add(
        'retention-cleanup',
        { type: 'batch' },
        {
          repeat: {
            every: RETENTION_INTERVAL_MS,
          },
          jobId: 'inbox-retention-daily',
        }
      )

      console.log('[InboxRetentionWorker] Scheduled daily retention cleanup')
    } catch (error) {
      console.error('[InboxRetentionWorker] Failed to schedule recurring job:', error)
    }
  }

  /**
   * Process a retention cleanup job
   */
  private async processJob(
    _job: Job<InboxRetentionJobData>
  ): Promise<{ inboxesProcessed: number; messagesDeleted: number; threadsUpdated: number }> {
    const startTime = Date.now()
    const pool = getPool()
    const stats = { inboxesProcessed: 0, messagesDeleted: 0, threadsUpdated: 0 }

    console.log('[InboxRetentionWorker] Starting retention cleanup')

    try {
      // Find all inboxes with a retention policy
      const { rows: inboxes } = await pool.query(
        `SELECT project_id, inbox_id, retention_days
         FROM inhouse_inbox_config
         WHERE retention_days IS NOT NULL AND retention_days > 0`
      )

      console.log(`[InboxRetentionWorker] Found ${inboxes.length} inboxes with retention policies`)

      for (const inbox of inboxes) {
        try {
          const result = await this.cleanupInbox(
            inbox.project_id,
            inbox.inbox_id,
            inbox.retention_days
          )

          stats.inboxesProcessed++
          stats.messagesDeleted += result.deleted
          stats.threadsUpdated += result.threadsUpdated

          if (result.deleted > 0) {
            logActivity({
              projectId: inbox.project_id,
              service: 'inbox',
              action: 'retention_cleanup',
              actorType: 'system',
              resourceType: 'inbox_config',
              resourceId: inbox.inbox_id,
              metadata: {
                retentionDays: inbox.retention_days,
                messagesDeleted: result.deleted,
                threadsUpdated: result.threadsUpdated,
              },
            })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.error(
            `[InboxRetentionWorker] Failed cleanup for project ${inbox.project_id}:`,
            errorMessage
          )

          logActivity({
            projectId: inbox.project_id,
            service: 'inbox',
            action: 'retention_cleanup',
            status: 'error',
            actorType: 'system',
            resourceType: 'inbox_config',
            resourceId: inbox.inbox_id,
            errorCode: 'RETENTION_CLEANUP_FAILED',
            metadata: { error: errorMessage },
          })
        }
      }

      const duration = Date.now() - startTime
      console.log(
        `[InboxRetentionWorker] Cleanup complete: ${stats.inboxesProcessed} inboxes, ` +
        `${stats.messagesDeleted} messages deleted, ${stats.threadsUpdated} threads updated (${duration}ms)`
      )

      return stats
    } catch (error) {
      console.error('[InboxRetentionWorker] Retention cleanup failed:', error)
      throw error
    }
  }

  /**
   * Clean up old messages for a single inbox/project
   */
  private async cleanupInbox(
    projectId: string,
    inboxId: string,
    retentionDays: number
  ): Promise<{ deleted: number; threadsUpdated: number }> {
    const pool = getPool()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    // Delete old messages and collect affected thread IDs
    const { rows: deletedRows } = await pool.query(
      `DELETE FROM inhouse_inbox_messages
       WHERE project_id = $1
         AND created_at < $2
       RETURNING thread_id`,
      [projectId, cutoffDate.toISOString()]
    )

    const deleted = deletedRows.length
    if (deleted === 0) return { deleted: 0, threadsUpdated: 0 }

    // Collect unique thread IDs
    const affectedThreadIds = [...new Set(
      deletedRows
        .map((r: { thread_id: string | null }) => r.thread_id)
        .filter(Boolean) as string[]
    )]

    // Recalculate thread counters for affected threads
    let threadsUpdated = 0
    for (const threadId of affectedThreadIds) {
      await pool.query(
        `UPDATE inhouse_inbox_threads
         SET
           message_count = (
             SELECT COUNT(*) FROM inhouse_inbox_messages WHERE thread_id = $1
           ),
           unread_count = (
             SELECT COUNT(*) FROM inhouse_inbox_messages WHERE thread_id = $1 AND is_read = FALSE
           ),
           last_message_at = (
             SELECT MAX(received_at) FROM inhouse_inbox_messages WHERE thread_id = $1
           ),
           last_message_snippet = (
             SELECT snippet FROM inhouse_inbox_messages WHERE thread_id = $1 ORDER BY received_at DESC LIMIT 1
           ),
           last_message_from = (
             SELECT from_email FROM inhouse_inbox_messages WHERE thread_id = $1 ORDER BY received_at DESC LIMIT 1
           ),
           updated_at = NOW()
         WHERE id = $1`,
        [threadId]
      )
      threadsUpdated++
    }

    // Clean up empty threads (no remaining messages)
    await pool.query(
      `DELETE FROM inhouse_inbox_threads
       WHERE project_id = $1
         AND id = ANY($2::uuid[])
         AND message_count = 0`,
      [projectId, affectedThreadIds]
    )

    console.log(
      `[InboxRetentionWorker] Project ${projectId}: deleted ${deleted} messages, updated ${threadsUpdated} threads`
    )

    return { deleted, threadsUpdated }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let workerInstance: InboxRetentionWorker | null = null

/**
 * Initialize and start the inbox retention worker
 */
export async function initializeInboxRetentionWorker(): Promise<InboxRetentionWorker> {
  if (!workerInstance) {
    workerInstance = new InboxRetentionWorker()
    await workerInstance.start()
  }
  return workerInstance
}

/**
 * Shutdown the inbox retention worker
 */
export async function shutdownInboxRetentionWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.stop()
    workerInstance = null
  }
}
