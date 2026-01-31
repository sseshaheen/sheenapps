/**
 * Admin In-House Health Endpoints
 *
 * Health check endpoints for monitoring in-house infrastructure.
 * Part of easy-mode-email-enhancements-plan.md
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { requirePool } from './admin/_utils'
import { getBestEffortRedis } from '../services/redisBestEffort'

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseHealthRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/health/pricing
  // Check TLD pricing freshness
  // -------------------------------------------------------------------------
  fastify.get('/v1/admin/inhouse/health/pricing', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const redis = getBestEffortRedis()

      // Check database pricing freshness
      const dbResult = await db.query(`
        SELECT
          COUNT(*) as tld_count,
          MAX(last_synced_at) as last_sync,
          MIN(last_synced_at) as oldest_sync,
          NOW() - MAX(last_synced_at) as time_since_sync
        FROM inhouse_domain_pricing
        WHERE available = true
      `)

      const dbStats = dbResult.rows[0] || {}
      const lastSync = dbStats.last_sync ? new Date(dbStats.last_sync) : null
      const timeSinceSyncMs = lastSync ? Date.now() - lastSync.getTime() : null
      const timeSinceSyncHours = timeSinceSyncMs ? timeSinceSyncMs / (1000 * 60 * 60) : null

      // Check Redis cache status
      let cacheStatus: 'hit' | 'miss' | 'unavailable' = 'unavailable'
      let cacheTtl: number | null = null

      if (redis) {
        try {
          const cached = await redis.get('tld-pricing-cache')
          if (cached) {
            cacheStatus = 'hit'
            cacheTtl = await redis.ttl('tld-pricing-cache')
          } else {
            cacheStatus = 'miss'
          }
        } catch {
          cacheStatus = 'unavailable'
        }
      }

      // Determine health status
      // Healthy: synced within 25 hours (buffer for daily job)
      // Warning: synced within 48 hours
      // Critical: not synced in 48+ hours
      let status: 'healthy' | 'warning' | 'critical' = 'healthy'
      if (!lastSync || timeSinceSyncHours === null) {
        status = 'critical'
      } else if (timeSinceSyncHours > 48) {
        status = 'critical'
      } else if (timeSinceSyncHours > 25) {
        status = 'warning'
      }

      return reply.send({
        success: true,
        data: {
          status,
          database: {
            tldCount: parseInt(dbStats.tld_count || '0', 10),
            lastSync: lastSync?.toISOString() || null,
            oldestSync: dbStats.oldest_sync ? new Date(dbStats.oldest_sync).toISOString() : null,
            hoursSinceSync: timeSinceSyncHours ? Math.round(timeSinceSyncHours * 10) / 10 : null,
          },
          cache: {
            status: cacheStatus,
            ttlSeconds: cacheTtl,
          },
          thresholds: {
            healthyHours: 25,
            warningHours: 48,
          },
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to check pricing health')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check pricing health',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/health/webhooks
  // Check webhook processing health
  // -------------------------------------------------------------------------
  fastify.get('/v1/admin/inhouse/health/webhooks', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()

      // Get webhook processing stats
      const statsResult = await db.query(`
        SELECT
          source,
          status,
          COUNT(*) as count
        FROM inhouse_webhook_events
        WHERE received_at > NOW() - INTERVAL '24 hours'
        GROUP BY source, status
      `)

      // Get stuck/failed events
      const failedResult = await db.query(`
        SELECT source, COUNT(*) as count
        FROM inhouse_webhook_events
        WHERE status = 'failed' AND updated_at > NOW() - INTERVAL '24 hours'
        GROUP BY source
      `)

      const stuckResult = await db.query(`
        SELECT source, COUNT(*) as count
        FROM inhouse_webhook_events
        WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '1 hour'
        GROUP BY source
      `)

      // Build stats by source
      const bySource: Record<string, Record<string, number>> = {}
      for (const row of statsResult.rows) {
        const source = row.source as string
        const status = row.status as string
        if (!bySource[source]) {
          bySource[source] = {}
        }
        bySource[source]![status] = parseInt(row.count, 10)
      }

      const failedBySource: Record<string, number> = {}
      for (const row of failedResult.rows) {
        failedBySource[row.source] = parseInt(row.count, 10)
      }

      const stuckBySource: Record<string, number> = {}
      for (const row of stuckResult.rows) {
        stuckBySource[row.source] = parseInt(row.count, 10)
      }

      // Determine health status
      const totalFailed = Object.values(failedBySource).reduce((a, b) => a + b, 0)
      const totalStuck = Object.values(stuckBySource).reduce((a, b) => a + b, 0)

      let status: 'healthy' | 'warning' | 'critical' = 'healthy'
      if (totalStuck > 0 || totalFailed > 10) {
        status = 'critical'
      } else if (totalFailed > 0) {
        status = 'warning'
      }

      return reply.send({
        success: true,
        data: {
          status,
          last24Hours: bySource,
          failed: failedBySource,
          stuck: stuckBySource,
          summary: {
            totalFailed,
            totalStuck,
          },
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to check webhook health')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check webhook health',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/health/transfers
  // Check domain transfer health
  // -------------------------------------------------------------------------
  fastify.get('/v1/admin/inhouse/health/transfers', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()

      // Get transfer stats
      const statsResult = await db.query(`
        SELECT
          status,
          COUNT(*) as count
        FROM inhouse_domain_transfers
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY status
      `)

      // Get stuck transfers (initiated/processing for > 7 days)
      const stuckResult = await db.query(`
        SELECT COUNT(*) as count
        FROM inhouse_domain_transfers
        WHERE status IN ('initiated', 'processing')
          AND initiated_at < NOW() - INTERVAL '7 days'
      `)

      const byStatus: Record<string, number> = {}
      for (const row of statsResult.rows) {
        byStatus[row.status] = parseInt(row.count, 10)
      }

      const stuckCount = parseInt(stuckResult.rows[0]?.count || '0', 10)

      let status: 'healthy' | 'warning' | 'critical' = 'healthy'
      if (stuckCount > 0) {
        status = 'warning'
      }

      return reply.send({
        success: true,
        data: {
          status,
          last30Days: byStatus,
          stuck: stuckCount,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to check transfer health')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check transfer health',
      })
    }
  })
}
