/**
 * Admin In-House Notifications Routes
 *
 * Endpoints for managing and monitoring Notifications across In-House Mode projects.
 * Provides visibility into delivery stats, templates, and user preferences.
 *
 * Routes:
 * - GET /v1/admin/inhouse/notifications/stats                          - Get notification stats across all projects
 * - GET /v1/admin/inhouse/projects/:projectId/notifications            - List project notifications
 * - GET /v1/admin/inhouse/projects/:projectId/notifications/stats      - Get project notification stats
 * - GET /v1/admin/inhouse/projects/:projectId/notifications/templates  - List project templates
 * - GET /v1/admin/inhouse/projects/:projectId/notifications/preferences - List user preferences
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface NotificationEntry {
  id: string
  project_id: string
  project_name?: string
  type: string
  recipients: string[]
  title: string
  body: string
  channels: string[]
  deliveries: Array<{
    channel: string
    status: string
    sentAt?: string
    deliveredAt?: string
    failedAt?: string
    error?: string
  }>
  status: string
  created_at: string
  scheduled_for: string | null
  metadata: Record<string, unknown> | null
}

interface NotificationTemplate {
  id: string
  project_id: string
  type: string
  name: string
  description: string | null
  channels: string[]
  default_title: string
  default_body: string
  variables: string[]
  channel_templates: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface UserPreference {
  user_id: string
  project_id: string
  channels: Record<string, boolean>
  types: Record<string, { enabled: boolean; channels?: string[] }>
  quiet_hours: {
    enabled: boolean
    start: string
    end: string
    timezone: string
  } | null
  updated_at: string
}

interface NotificationStatsSummary {
  totalSent: number
  totalDelivered: number
  totalFailed: number
  totalPending: number
  byChannel: Record<string, {
    sent: number
    delivered: number
    failed: number
  }>
  byType: Record<string, {
    sent: number
    delivered: number
    failed: number
  }>
  byStatus: Record<string, number>
}

interface NotificationsQuery {
  type?: string
  status?: string
  channel?: string
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

const VALID_STATUSES = ['pending', 'partial', 'sent', 'delivered', 'failed', 'cancelled']
const VALID_CHANNELS = ['email', 'push', 'realtime', 'sms']

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function parseJsonSafe<T>(value: string | T | null | undefined, defaultValue: T): T {
  if (value === null || value === undefined) return defaultValue
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return defaultValue
    }
  }
  return value as T
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseNotificationsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // ===========================================================================
  // GET /v1/admin/inhouse/notifications/stats - Get notification stats across all projects
  // ===========================================================================
  fastify.get<{
    Querystring: { projectId?: string; startDate?: string; endDate?: string; period?: string }
    Reply: { success: boolean; data?: NotificationStatsSummary; error?: string }
  }>('/v1/admin/inhouse/notifications/stats', { preHandler: readMiddleware as never }, async (request, reply) => {
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

      const { usageSummary, statusRows, typeRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        // Build project filter
        const projectFilter = projectId ? 'AND project_id = $3' : ''
        const params = projectId
          ? [effectiveStart, effectiveEnd, projectId]
          : [effectiveStart, effectiveEnd]

        // Get usage stats
        const usageResult = await client.query(
          `SELECT
             SUM(CASE WHEN success = true THEN delivery_count ELSE 0 END) as total_sent,
             SUM(CASE WHEN success = false THEN delivery_count ELSE 0 END) as total_failed
           FROM inhouse_notification_usage
           WHERE created_at >= $1::date
             AND created_at < ($2::date + interval '1 day')
             ${projectFilter}`,
          params
        )

        // Get status breakdown
        const statusResult = await client.query(
          `SELECT status, COUNT(*) as count
           FROM inhouse_notifications
           WHERE created_at >= $1::date
             AND created_at < ($2::date + interval '1 day')
             ${projectFilter}
           GROUP BY status`,
          params
        )

        // Get type breakdown
        const typeResult = await client.query(
          `SELECT type, status, COUNT(*) as count
           FROM inhouse_notifications
           WHERE created_at >= $1::date
             AND created_at < ($2::date + interval '1 day')
             ${projectFilter}
           GROUP BY type, status`,
          params
        )

        return {
          usageSummary: usageResult.rows[0],
          statusRows: statusResult.rows,
          typeRows: typeResult.rows,
        }
      })

      const byStatus: Record<string, number> = {}
      for (const row of statusRows) {
        byStatus[row.status] = parseInt(row.count, 10)
      }

      const byType: Record<string, { sent: number; delivered: number; failed: number }> = {}
      for (const row of typeRows) {
        if (!byType[row.type]) {
          byType[row.type] = { sent: 0, delivered: 0, failed: 0 }
        }
        const stats = byType[row.type]!
        const count = parseInt(row.count, 10)
        if (row.status === 'sent' || row.status === 'partial') {
          stats.sent += count
        } else if (row.status === 'delivered') {
          stats.delivered += count
        } else if (row.status === 'failed') {
          stats.failed += count
        }
      }

      // Initialize channel stats (populated from deliveries in a more complex query if needed)
      const byChannel: Record<string, { sent: number; delivered: number; failed: number }> = {
        email: { sent: 0, delivered: 0, failed: 0 },
        push: { sent: 0, delivered: 0, failed: 0 },
        realtime: { sent: 0, delivered: 0, failed: 0 },
        sms: { sent: 0, delivered: 0, failed: 0 },
      }

      return reply.send({
        success: true,
        data: {
          totalSent: parseInt(usageSummary?.total_sent || '0', 10),
          totalDelivered: byStatus['delivered'] || 0,
          totalFailed: parseInt(usageSummary?.total_failed || '0', 10),
          totalPending: byStatus['pending'] || 0,
          byChannel,
          byType,
          byStatus,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get notification stats')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get notification stats',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/notifications - List project notifications
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: NotificationsQuery
    Reply: { success: boolean; data?: { notifications: NotificationEntry[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/notifications', { preHandler: readMiddleware as never }, async (request, reply) => {
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
      const { type, status, channel, startDate, endDate, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      // Validate filters
      const safeStatus = status && VALID_STATUSES.includes(status) ? status : null
      const safeChannel = channel && VALID_CHANNELS.includes(channel) ? channel : null

      // Build query conditions
      const conditions: string[] = ['n.project_id = $1']
      const params: unknown[] = [projectId]
      let paramIndex = 2

      if (type) {
        conditions.push(`n.type = $${paramIndex}`)
        params.push(type)
        paramIndex++
      }

      if (safeStatus) {
        conditions.push(`n.status = $${paramIndex}`)
        params.push(safeStatus)
        paramIndex++
      }

      if (safeChannel) {
        // Use JSONB containment operator for proper array element matching
        // This correctly matches ["email", "push"] for channel="email"
        // and won't false-match "webhook_email_handler"
        conditions.push(`n.channels ? $${paramIndex}`)
        params.push(safeChannel)
        paramIndex++
      }

      if (startDate) {
        conditions.push(`n.created_at >= $${paramIndex}::date`)
        params.push(startDate)
        paramIndex++
      }

      if (endDate) {
        conditions.push(`n.created_at < ($${paramIndex}::date + interval '1 day')`)
        params.push(endDate)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      const { total, notificationRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_notifications n WHERE ${whereClause}`,
          params
        )

        const notificationsResult = await client.query(
          `SELECT
             n.id,
             n.project_id,
             n.type,
             n.recipients,
             n.title,
             n.body,
             n.channels,
             n.deliveries,
             n.status,
             n.created_at,
             n.scheduled_for,
             n.metadata
           FROM inhouse_notifications n
           WHERE ${whereClause}
           ORDER BY n.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          notificationRows: notificationsResult.rows,
        }
      })

      const notifications: NotificationEntry[] = notificationRows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: projectName,
        type: row.type,
        recipients: parseJsonSafe(row.recipients, []),
        title: row.title,
        body: row.body,
        channels: parseJsonSafe(row.channels, []),
        deliveries: parseJsonSafe(row.deliveries, []),
        status: row.status,
        created_at: row.created_at,
        scheduled_for: row.scheduled_for,
        metadata: parseJsonSafe(row.metadata, null),
      }))

      return reply.send({
        success: true,
        data: {
          notifications,
          total,
          hasMore: offset + notifications.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list project notifications')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list project notifications',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/notifications/stats - Get project notification stats
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { startDate?: string; endDate?: string }
    Reply: { success: boolean; data?: NotificationStatsSummary & { projectId: string; projectName: string }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/notifications/stats', { preHandler: readMiddleware as never }, async (request, reply) => {
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

      const { usageSummary, statusRows, typeRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        // Get usage stats
        const usageResult = await client.query(
          `SELECT
             SUM(CASE WHEN success = true THEN delivery_count ELSE 0 END) as total_sent,
             SUM(CASE WHEN success = false THEN delivery_count ELSE 0 END) as total_failed
           FROM inhouse_notification_usage
           WHERE project_id = $1
             AND created_at >= $2::date
             AND created_at < ($3::date + interval '1 day')`,
          [projectId, effectiveStart, effectiveEnd]
        )

        // Get status breakdown
        const statusResult = await client.query(
          `SELECT status, COUNT(*) as count
           FROM inhouse_notifications
           WHERE project_id = $1
             AND created_at >= $2::date
             AND created_at < ($3::date + interval '1 day')
           GROUP BY status`,
          [projectId, effectiveStart, effectiveEnd]
        )

        // Get type breakdown
        const typeResult = await client.query(
          `SELECT type, status, COUNT(*) as count
           FROM inhouse_notifications
           WHERE project_id = $1
             AND created_at >= $2::date
             AND created_at < ($3::date + interval '1 day')
           GROUP BY type, status`,
          [projectId, effectiveStart, effectiveEnd]
        )

        return {
          usageSummary: usageResult.rows[0],
          statusRows: statusResult.rows,
          typeRows: typeResult.rows,
        }
      })

      const byStatus: Record<string, number> = {}
      for (const row of statusRows) {
        byStatus[row.status] = parseInt(row.count, 10)
      }

      const byType: Record<string, { sent: number; delivered: number; failed: number }> = {}
      for (const row of typeRows) {
        if (!byType[row.type]) {
          byType[row.type] = { sent: 0, delivered: 0, failed: 0 }
        }
        const stats = byType[row.type]!
        const count = parseInt(row.count, 10)
        if (row.status === 'sent' || row.status === 'partial') {
          stats.sent += count
        } else if (row.status === 'delivered') {
          stats.delivered += count
        } else if (row.status === 'failed') {
          stats.failed += count
        }
      }

      const byChannel: Record<string, { sent: number; delivered: number; failed: number }> = {
        email: { sent: 0, delivered: 0, failed: 0 },
        push: { sent: 0, delivered: 0, failed: 0 },
        realtime: { sent: 0, delivered: 0, failed: 0 },
        sms: { sent: 0, delivered: 0, failed: 0 },
      }

      return reply.send({
        success: true,
        data: {
          projectId,
          projectName,
          totalSent: parseInt(usageSummary?.total_sent || '0', 10),
          totalDelivered: byStatus['delivered'] || 0,
          totalFailed: parseInt(usageSummary?.total_failed || '0', 10),
          totalPending: byStatus['pending'] || 0,
          byChannel,
          byType,
          byStatus,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get project notification stats')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project notification stats',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/notifications/templates - List project templates
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { limit?: string; offset?: string }
    Reply: { success: boolean; data?: { templates: NotificationTemplate[]; total: number }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/notifications/templates', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId } = request.params

    try {
      const db = requirePool()
      const { limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

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

      const { total, templateRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_notification_templates WHERE project_id = $1`,
          [projectId]
        )

        const templatesResult = await client.query(
          `SELECT
             id,
             project_id,
             type,
             name,
             description,
             channels,
             default_title,
             default_body,
             variables,
             channel_templates,
             created_at,
             updated_at
           FROM inhouse_notification_templates
           WHERE project_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [projectId, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          templateRows: templatesResult.rows,
        }
      })

      const templates: NotificationTemplate[] = templateRows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        type: row.type,
        name: row.name,
        description: row.description,
        channels: parseJsonSafe(row.channels, []),
        default_title: row.default_title,
        default_body: row.default_body,
        variables: parseJsonSafe(row.variables, []),
        channel_templates: parseJsonSafe(row.channel_templates, null),
        created_at: row.created_at,
        updated_at: row.updated_at,
      }))

      return reply.send({
        success: true,
        data: {
          templates,
          total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list project templates')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list project templates',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/notifications/preferences - List user preferences
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { limit?: string; offset?: string }
    Reply: { success: boolean; data?: { preferences: UserPreference[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/notifications/preferences', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId } = request.params

    try {
      const db = requirePool()
      const { limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

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

      const { total, preferenceRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_notification_preferences WHERE project_id = $1`,
          [projectId]
        )

        const preferencesResult = await client.query(
          `SELECT
             user_id,
             project_id,
             channels,
             types,
             quiet_hours,
             updated_at
           FROM inhouse_notification_preferences
           WHERE project_id = $1
           ORDER BY updated_at DESC
           LIMIT $2 OFFSET $3`,
          [projectId, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          preferenceRows: preferencesResult.rows,
        }
      })

      const preferences: UserPreference[] = preferenceRows.map(row => ({
        user_id: row.user_id,
        project_id: row.project_id,
        channels: parseJsonSafe(row.channels, {}),
        types: parseJsonSafe(row.types, {}),
        quiet_hours: parseJsonSafe(row.quiet_hours, null),
        updated_at: row.updated_at,
      }))

      return reply.send({
        success: true,
        data: {
          preferences,
          total,
          hasMore: offset + preferences.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list user preferences')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list user preferences',
      })
    }
  })
}
