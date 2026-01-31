/**
 * Best-Effort Redis Client
 *
 * Shared Redis client for non-critical operations (spam checks, dedup, rate limiting).
 * Fails open: if Redis is unavailable, callers should degrade gracefully.
 *
 * Uses a single shared connection to avoid accumulating per-service Redis clients.
 */

import Redis from 'ioredis'
import { redisConnection } from '../queue/modularQueues'
import { createLogger } from '../observability/logger'

const log = createLogger('redis-best-effort')

let client: Redis | null = null

/**
 * Get or create a shared best-effort Redis client.
 * Returns null if connection cannot be established.
 */
export function getBestEffortRedis(): Redis | null {
  if (client) return client

  try {
    client = new Redis({
      host: redisConnection.host,
      port: redisConnection.port,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false, // fail fast; callers already handle null/errors
      retryStrategy(times) {
        // Reconnect with exponential backoff, cap at 10s
        return Math.min(times * 500, 10_000)
      },
    })

    client.on('error', (err) => {
      log.error({ err }, 'Redis connection error')
    })

    client.on('close', () => {
      // Client closed unexpectedly - clear reference so next call recreates
      client = null
    })

    return client
  } catch {
    client = null
    return null
  }
}

/**
 * Gracefully shutdown the shared Redis client.
 * Call during server shutdown.
 */
export async function shutdownBestEffortRedis(): Promise<void> {
  if (!client) return

  try {
    await client.quit()
  } catch {
    try {
      client.disconnect()
    } catch {
      // ignore
    }
  } finally {
    client = null
  }
}
