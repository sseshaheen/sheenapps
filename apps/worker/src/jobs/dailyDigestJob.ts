/**
 * Daily Digest Job
 *
 * Hourly job that sends daily digests to eligible projects.
 * Uses scheduler-driven approach: projects.digest_next_at stores the next send time.
 *
 * Part of Run Hub Phase 4: Proactive Digests
 */

import { pool } from '../services/database'
import { getDigestService, computeNextDigestTime } from '../services/digestService'
import { ServerLoggingService } from '../services/serverLoggingService'
import { getYesterdayInTimezone } from '../utils/tzDay'

const LOG_PREFIX = '[DailyDigestJob]'
const loggingService = ServerLoggingService.getInstance()

interface EligibleProject {
  id: string
  timezone: string
  owner_email: string
  digest_recipient: string | null
  digest_hour: number
}

/**
 * Process digests for all eligible projects.
 * Called hourly by the scheduler.
 */
export async function dailyDigestJob(): Promise<{ processed: number; sent: number; failed: number }> {
  console.log(`${LOG_PREFIX} Starting daily digest job...`)

  // Hard-fail if database pool is not initialized (prevents silent failures)
  if (!pool) {
    throw new Error(`${LOG_PREFIX} Database pool not initialized`)
  }

  const startTime = Date.now()
  let processed = 0
  let sent = 0
  let failed = 0

  try {
    // Find projects with digest due
    // Query checks:
    // 1. daily_digest_enabled = true in config (with safe COALESCE for missing/invalid values)
    // 2. digest_next_at <= now()
    // Order by most overdue first for fairness
    const eligibleResult = await pool.query<EligibleProject>(`
      SELECT
        p.id,
        COALESCE(p.timezone, 'UTC') as timezone,
        u.email as owner_email,
        p.config->'run_settings'->'notifications'->>'email_recipient' as digest_recipient,
        COALESCE((p.config->'run_settings'->'notifications'->>'daily_digest_hour')::int, 9) as digest_hour
      FROM projects p
      JOIN auth.users u ON p.owner_id = u.id
      WHERE COALESCE((p.config->'run_settings'->'notifications'->>'daily_digest_enabled')::boolean, false) = true
        AND p.digest_next_at IS NOT NULL
        AND p.digest_next_at <= NOW()
      ORDER BY p.digest_next_at ASC
      LIMIT 200
    `)

    const projects = eligibleResult?.rows || []
    console.log(`${LOG_PREFIX} Found ${projects.length} projects with digests due`)

    const digestService = getDigestService()

    for (const project of projects) {
      processed++

      try {
        // Compute "yesterday" in project timezone
        const yesterday = getYesterdayInTimezone(project.timezone)
        const recipient = project.digest_recipient || project.owner_email

        // Compute next digest time BEFORE generating content
        // This ensures we always advance the schedule, even if digest is skipped
        const nextAt = computeNextDigestTime(project.timezone, project.digest_hour)

        // Generate digest content
        const content = await digestService.generateDigest(project.id, yesterday)
        if (!content) {
          // Skip, but advance schedule so we don't hammer the same project hourly forever
          await pool.query(
            `UPDATE projects SET digest_next_at = $1 WHERE id = $2`,
            [nextAt, project.id]
          )
          console.log(`${LOG_PREFIX} Skipped digest for project ${project.id} (no content), next at ${nextAt.toISOString()}`)
          continue
        }

        // Send digest email
        await digestService.sendDigest(project.id, content, recipient)
        sent++

        // Update digest_next_at and digest_last_sent_at
        await pool.query(
          `UPDATE projects
           SET digest_next_at = $1,
               digest_last_sent_at = NOW()
           WHERE id = $2`,
          [nextAt, project.id]
        )

        console.log(`${LOG_PREFIX} Sent digest for project ${project.id}, next at ${nextAt.toISOString()}`)
      } catch (error) {
        failed++
        console.error(`${LOG_PREFIX} Failed to process digest for project ${project.id}:`, error)

        // Don't let one failure stop the whole job
        // Still update digest_next_at to prevent infinite retry loops
        try {
          const nextAt = computeNextDigestTime(project.timezone, project.digest_hour)
          await pool.query(
            `UPDATE projects SET digest_next_at = $1 WHERE id = $2`,
            [nextAt, project.id]
          )
        } catch {
          // Ignore update errors
        }
      }
    }

    const durationMs = Date.now() - startTime
    console.log(`${LOG_PREFIX} Completed: ${sent} sent, ${failed} failed, ${processed} processed in ${durationMs}ms`)

    // Log critical if any failures
    if (failed > 0) {
      await loggingService.logCriticalError('daily_digest_failures', new Error(`${failed} digest(s) failed`), {
        job: 'daily-digest',
        processed,
        sent,
        failed,
        durationMs
      })
    }

    return { processed, sent, failed }
  } catch (error) {
    console.error(`${LOG_PREFIX} Job failed:`, error)
    await loggingService.logCriticalError('daily_digest_job_failed', error as Error, {
      job: 'daily-digest'
    })
    throw error
  }
}

// getYesterdayInTimezone is now imported from utils/tzDay.ts

/**
 * Initialize digest_next_at for a project when digest is enabled.
 * Called when user enables digest or changes settings.
 */
export async function initializeDigestNextAt(
  projectId: string,
  timezone: string,
  hour: number
): Promise<Date> {
  if (!pool) {
    throw new Error(`${LOG_PREFIX} Database pool not initialized`)
  }

  const nextAt = computeNextDigestTime(timezone, hour)

  await pool.query(
    `UPDATE projects SET digest_next_at = $1 WHERE id = $2`,
    [nextAt, projectId]
  )

  console.log(`${LOG_PREFIX} Initialized digest_next_at for project ${projectId}: ${nextAt.toISOString()}`)
  return nextAt
}

/**
 * Clear digest_next_at when digest is disabled.
 */
export async function clearDigestNextAt(projectId: string): Promise<void> {
  if (!pool) {
    throw new Error(`${LOG_PREFIX} Database pool not initialized`)
  }

  await pool.query(
    `UPDATE projects SET digest_next_at = NULL WHERE id = $1`,
    [projectId]
  )

  console.log(`${LOG_PREFIX} Cleared digest_next_at for project ${projectId}`)
}
