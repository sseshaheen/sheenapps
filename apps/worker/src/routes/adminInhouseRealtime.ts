/**
 * Admin In-House Realtime Routes
 *
 * Endpoints for managing and monitoring Realtime usage across In-House Mode projects.
 * Provides visibility into channels, connections, messages, and presence.
 *
 * Routes:
 * - GET /v1/admin/inhouse/realtime/stats                    - Get realtime stats across all projects
 * - GET /v1/admin/inhouse/projects/:projectId/realtime/stats     - Get project realtime stats
 * - GET /v1/admin/inhouse/projects/:projectId/realtime/channels  - List project channels
 * - GET /v1/admin/inhouse/projects/:projectId/realtime/usage     - Get project usage log
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface RealtimeUsageEntry {
  id: string
  project_id: string
  project_name?: string
  operation: 'publish' | 'connect' | 'presence'
  channel: string | null
  success: boolean
  error_code: string | null
  created_at: string
}

interface RealtimeStatsSummary {
  totalMessages: number
  totalConnections: number
  totalPresenceUpdates: number
  activeChannels: number
  errorCount: number
  byOperation: Record<string, {
    count: number
    errors: number
  }>
}

interface ChannelStats {
  channel: string
  messages: number
  presenceUpdates: number
  lastActivity: string
}

interface UsageQuery {
  projectId?: string
  operation?: string
  channel?: string
  success?: string
  startDate?: string
  endDate?: string
  limit?: string
  offset?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const STATEMENT_TIMEOUT = '5s'

const VALID_OPERATIONS = ['publish', 'connect', 'presence']

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseRealtimeRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // ===========================================================================
  // GET /v1/admin/inhouse/realtime/stats - Get realtime stats across all projects
  // ===========================================================================
  fastify.get<{
    Querystring: { projectId?: string; startDate?: string; endDate?: string; period?: string }
    Reply: { success: boolean; data?: RealtimeStatsSummary; error?: string }
  }>('/v1/admin/inhouse/realtime/stats', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, startDate, endDate, period } = request.query

      // Default to current month
      const now = new Date()
      let defaultStart: string
      let defaultEnd: string

      if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        defaultStart = weekAgo.toISOString().split('T')[0]!
        defaultEnd = now.toISOString().split('T')[0]!
      } else if (period === 'day') {
        defaultStart = now.toISOString().split('T')[0]!
        defaultEnd = now.toISOString().split('T')[0]!
      } else {
        defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!
        defaultEnd = now.toISOString().split('T')[0]!
      }

      const effectiveStart = startDate || defaultStart
      const effectiveEnd = endDate || defaultEnd

      const { summary, byOperation } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        // Build project filter
        const projectFilter = projectId ? 'AND u.project_id = $3' : ''
        const params = projectId
          ? [effectiveStart, effectiveEnd, projectId]
          : [effectiveStart, effectiveEnd]

        // Get totals
        const totalsResult = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE operation = 'publish') as total_messages,
             COUNT(*) FILTER (WHERE operation = 'connect') as total_connections,
             COUNT(*) FILTER (WHERE operation = 'presence') as total_presence_updates,
             COUNT(DISTINCT channel) FILTER (WHERE channel IS NOT NULL) as active_channels,
             COUNT(*) FILTER (WHERE success = false) as error_count
           FROM inhouse_realtime_usage u
           WHERE u.created_at >= $1::date
             AND u.created_at < ($2::date + interval '1 day')
             ${projectFilter}`,
          params
        )

        // Get by operation
        const byOperationResult = await client.query(
          `SELECT
             operation,
             COUNT(*) as count,
             COUNT(*) FILTER (WHERE success = false) as errors
           FROM inhouse_realtime_usage u
           WHERE u.created_at >= $1::date
             AND u.created_at < ($2::date + interval '1 day')
             ${projectFilter}
           GROUP BY operation
           ORDER BY count DESC`,
          params
        )

        return {
          summary: totalsResult.rows[0],
          byOperation: byOperationResult.rows,
        }
      })

      const operationStats: Record<string, { count: number; errors: number }> = {}
      for (const row of byOperation) {
        operationStats[row.operation] = {
          count: parseInt(row.count, 10),
          errors: parseInt(row.errors, 10),
        }
      }

      return reply.send({
        success: true,
        data: {
          totalMessages: parseInt(summary?.total_messages || '0', 10),
          totalConnections: parseInt(summary?.total_connections || '0', 10),
          totalPresenceUpdates: parseInt(summary?.total_presence_updates || '0', 10),
          activeChannels: parseInt(summary?.active_channels || '0', 10),
          errorCount: parseInt(summary?.error_count || '0', 10),
          byOperation: operationStats,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get realtime stats')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get realtime stats',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/realtime/stats - Get project realtime stats
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { startDate?: string; endDate?: string }
    Reply: { success: boolean; data?: RealtimeStatsSummary & { projectId: string; projectName: string }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/realtime/stats', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId } = request.params

    try {
      const db = requirePool()
      const { startDate, endDate } = request.query

      // Verify project exists and is Easy Mode
      const projectCheck = await db.query(
        `SELECT id, name FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
        [projectId]
      )

      if (!projectCheck.rows.length) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        })
      }

      const projectName = projectCheck.rows[0].name

      // Default to current month
      const now = new Date()
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!
      const defaultEnd = now.toISOString().split('T')[0]!
      const effectiveStart = startDate || defaultStart
      const effectiveEnd = endDate || defaultEnd

      const { summary, byOperation } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const totalsResult = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE operation = 'publish') as total_messages,
             COUNT(*) FILTER (WHERE operation = 'connect') as total_connections,
             COUNT(*) FILTER (WHERE operation = 'presence') as total_presence_updates,
             COUNT(DISTINCT channel) FILTER (WHERE channel IS NOT NULL) as active_channels,
             COUNT(*) FILTER (WHERE success = false) as error_count
           FROM inhouse_realtime_usage
           WHERE project_id = $1
             AND created_at >= $2::date
             AND created_at < ($3::date + interval '1 day')`,
          [projectId, effectiveStart, effectiveEnd]
        )

        const byOperationResult = await client.query(
          `SELECT
             operation,
             COUNT(*) as count,
             COUNT(*) FILTER (WHERE success = false) as errors
           FROM inhouse_realtime_usage
           WHERE project_id = $1
             AND created_at >= $2::date
             AND created_at < ($3::date + interval '1 day')
           GROUP BY operation
           ORDER BY count DESC`,
          [projectId, effectiveStart, effectiveEnd]
        )

        return {
          summary: totalsResult.rows[0],
          byOperation: byOperationResult.rows,
        }
      })

      const operationStats: Record<string, { count: number; errors: number }> = {}
      for (const row of byOperation) {
        operationStats[row.operation] = {
          count: parseInt(row.count, 10),
          errors: parseInt(row.errors, 10),
        }
      }

      return reply.send({
        success: true,
        data: {
          projectId,
          projectName,
          totalMessages: parseInt(summary?.total_messages || '0', 10),
          totalConnections: parseInt(summary?.total_connections || '0', 10),
          totalPresenceUpdates: parseInt(summary?.total_presence_updates || '0', 10),
          activeChannels: parseInt(summary?.active_channels || '0', 10),
          errorCount: parseInt(summary?.error_count || '0', 10),
          byOperation: operationStats,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get project realtime stats')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project realtime stats',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/realtime/channels - List project channels
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { startDate?: string; endDate?: string; limit?: string }
    Reply: { success: boolean; data?: { channels: ChannelStats[] }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/realtime/channels', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId } = request.params

    try {
      const db = requirePool()
      const { startDate, endDate, limit: limitStr } = request.query
      const limitRaw = parseInt(limitStr || '50', 10)
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : 50

      // Verify project exists and is Easy Mode
      const projectCheck = await db.query(
        `SELECT id, name FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
        [projectId]
      )

      if (!projectCheck.rows.length) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        })
      }

      // Default to current month
      const now = new Date()
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!
      const defaultEnd = now.toISOString().split('T')[0]!
      const effectiveStart = startDate || defaultStart
      const effectiveEnd = endDate || defaultEnd

      const channelsResult = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const result = await client.query(
          `SELECT
             channel,
             COUNT(*) FILTER (WHERE operation = 'publish') as messages,
             COUNT(*) FILTER (WHERE operation = 'presence') as presence_updates,
             MAX(created_at) as last_activity
           FROM inhouse_realtime_usage
           WHERE project_id = $1
             AND channel IS NOT NULL
             AND created_at >= $2::date
             AND created_at < ($3::date + interval '1 day')
           GROUP BY channel
           ORDER BY last_activity DESC
           LIMIT $4`,
          [projectId, effectiveStart, effectiveEnd, limit]
        )

        return result.rows
      })

      const channels: ChannelStats[] = channelsResult.map(row => ({
        channel: row.channel,
        messages: parseInt(row.messages || '0', 10),
        presenceUpdates: parseInt(row.presence_updates || '0', 10),
        lastActivity: row.last_activity,
      }))

      return reply.send({
        success: true,
        data: { channels },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list project channels')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list project channels',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/realtime/usage - Get project usage log
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: UsageQuery
    Reply: { success: boolean; data?: { usage: RealtimeUsageEntry[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/realtime/usage', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId } = request.params

    try {
      const db = requirePool()

      // Verify project exists and is Easy Mode
      const projectCheck = await db.query(
        `SELECT id, name FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
        [projectId]
      )

      if (!projectCheck.rows.length) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        })
      }

      const projectName = projectCheck.rows[0].name
      const { operation, channel, success, startDate, endDate, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      // Validate filters
      const safeOperation = operation && VALID_OPERATIONS.includes(operation) ? operation : null

      // Build query conditions
      const conditions: string[] = ['u.project_id = $1']
      const params: unknown[] = [projectId]
      let paramIndex = 2

      if (safeOperation) {
        conditions.push(`u.operation = $${paramIndex}`)
        params.push(safeOperation)
        paramIndex++
      }

      if (channel) {
        conditions.push(`u.channel = $${paramIndex}`)
        params.push(channel)
        paramIndex++
      }

      if (success !== undefined) {
        conditions.push(`u.success = $${paramIndex}`)
        params.push(success === 'true')
        paramIndex++
      }

      if (startDate) {
        conditions.push(`u.created_at >= $${paramIndex}::date`)
        params.push(startDate)
        paramIndex++
      }

      if (endDate) {
        conditions.push(`u.created_at < ($${paramIndex}::date + interval '1 day')`)
        params.push(endDate)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      const { total, usageRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_realtime_usage u WHERE ${whereClause}`,
          params
        )

        const usageResult = await client.query(
          `SELECT
             u.id,
             u.project_id,
             u.operation,
             u.channel,
             u.success,
             u.error_code,
             u.created_at
           FROM inhouse_realtime_usage u
           WHERE ${whereClause}
           ORDER BY u.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          usageRows: usageResult.rows,
        }
      })

      const usage: RealtimeUsageEntry[] = usageRows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: projectName,
        operation: row.operation,
        channel: row.channel,
        success: row.success,
        error_code: row.error_code,
        created_at: row.created_at,
      }))

      return reply.send({
        success: true,
        data: {
          usage,
          total,
          hasMore: offset + usage.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get project realtime usage')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project realtime usage',
      })
    }
  })
}
