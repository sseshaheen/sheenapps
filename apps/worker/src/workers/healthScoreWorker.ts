/**
 * Health Score Calculation Worker
 *
 * Runs nightly to calculate customer health scores for all users.
 * Can also be triggered manually via admin API.
 */

import { createClient } from '@supabase/supabase-js'
import { CustomerHealthService } from '../services/admin/CustomerHealthService'
import { ServerLoggingService } from '../services/serverLoggingService'

const logger = ServerLoggingService.getInstance()

// Worker state
let isRunning = false
let intervalId: NodeJS.Timeout | null = null
let initialTimeoutId: NodeJS.Timeout | null = null // Store initial timeout handle
let lastRunAt: Date | null = null
let lastRunDuration: number | null = null
let lastRunStats: {
  total: number
  success: number
  failed: number
  skipped: number
} | null = null
let consecutiveErrors = 0

// Configuration
const INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours (nightly)
const BATCH_SIZE = 100 // Process users in batches
const BATCH_DELAY_MS = 1000 // Delay between batches to avoid overload

/**
 * Initialize Supabase client for admin operations
 */
function createAdminSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration for health score worker')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Main health score calculation job
 */
async function calculateAllHealthScores(): Promise<void> {
  if (isRunning) {
    logger.warn('Health score calculation already in progress, skipping')
    return
  }

  isRunning = true
  const startTime = Date.now()
  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  }

  try {
    logger.info('Starting health score calculation for all users')

    const supabase = createAdminSupabase()
    const healthService = new CustomerHealthService(supabase)

    // Get all users that need health score calculation
    const userIds = await healthService.getUsersForCalculation()
    stats.total = userIds.length

    logger.info(`Found ${userIds.length} users for health score calculation`)

    // Process in batches
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async (userId) => {
          try {
            const breakdown = await healthService.calculateHealthScore(userId)

            if (breakdown) {
              await healthService.saveHealthScore(userId, breakdown)
              stats.success++
            } else {
              stats.skipped++
            }
          } catch (error) {
            stats.failed++
            logger.error('Failed to calculate health score for user', {
              userId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })
      )

      // Log progress
      const processed = Math.min(i + BATCH_SIZE, userIds.length)
      logger.info(`Health score progress: ${processed}/${userIds.length}`)

      // Delay between batches
      if (i + BATCH_SIZE < userIds.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
      }
    }

    consecutiveErrors = 0
    lastRunStats = stats
    lastRunAt = new Date()
    lastRunDuration = Date.now() - startTime

    logger.info('Health score calculation completed', {
      duration: lastRunDuration,
      stats,
    })
  } catch (error) {
    consecutiveErrors++
    logger.error('Health score calculation failed', {
      error: error instanceof Error ? error.message : String(error),
      consecutiveErrors,
    })
    throw error
  } finally {
    isRunning = false
  }
}

/**
 * Calculate health score for a single user (on-demand)
 */
export async function calculateUserHealthScore(userId: string): Promise<void> {
  try {
    const supabase = createAdminSupabase()
    const healthService = new CustomerHealthService(supabase)

    const breakdown = await healthService.calculateHealthScore(userId)

    if (breakdown) {
      await healthService.saveHealthScore(userId, breakdown)
      logger.info('Calculated health score for user', { userId, score: breakdown.score })
    }
  } catch (error) {
    logger.error('Failed to calculate health score for user', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Start the health score worker
 */
export function startHealthScoreWorker(): void {
  if (intervalId || initialTimeoutId) {
    logger.warn('Health score worker already running')
    return
  }

  logger.info('Starting health score worker (24-hour interval)')

  // Calculate initial time until midnight
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0) // Next midnight
  const msUntilMidnight = midnight.getTime() - now.getTime()

  // Schedule first run at midnight, then every 24 hours
  // Store timeout handle so it can be canceled
  initialTimeoutId = setTimeout(() => {
    initialTimeoutId = null // Clear after firing

    // Run at midnight
    calculateAllHealthScores().catch((error) => {
      logger.error('Health score worker error', { error })
    })

    // Then schedule every 24 hours
    intervalId = setInterval(() => {
      calculateAllHealthScores().catch((error) => {
        logger.error('Health score worker error', { error })
      })
    }, INTERVAL_MS)
  }, msUntilMidnight)

  logger.info(`Health score worker scheduled for ${midnight.toISOString()} (in ${Math.round(msUntilMidnight / 60000)} minutes)`)
}

/**
 * Stop the health score worker
 */
export function stopHealthScoreWorker(): void {
  // Clear initial timeout if pending
  if (initialTimeoutId) {
    clearTimeout(initialTimeoutId)
    initialTimeoutId = null
    logger.info('Health score worker initial timeout cleared')
  }

  // Clear interval if running
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info('Health score worker stopped')
  }
}

/**
 * Force a health score calculation run
 */
export async function forceHealthScoreRun(): Promise<void> {
  await calculateAllHealthScores()
}

/**
 * Get worker status
 */
export function getHealthScoreWorkerStatus(): {
  running: boolean
  lastRun: string | null
  lastDuration: number | null
  lastStats: typeof lastRunStats
  consecutiveErrors: number
  scheduled: boolean
} {
  return {
    running: isRunning,
    lastRun: lastRunAt?.toISOString() || null,
    lastDuration: lastRunDuration,
    lastStats: lastRunStats,
    consecutiveErrors,
    scheduled: intervalId !== null || initialTimeoutId !== null, // Include pending initial timeout
  }
}

/**
 * Reset error counter (after manual intervention)
 */
export function resetHealthScoreWorkerErrors(): void {
  consecutiveErrors = 0
  logger.info('Health score worker error counter reset')
}
