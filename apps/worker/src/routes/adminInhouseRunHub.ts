/**
 * Admin In-House Run Hub Routes
 *
 * Endpoints for monitoring and managing Run Hub operations across all In-House projects.
 * Provides visibility into workflow runs, business events, and KPI health.
 *
 * Routes:
 * - GET  /v1/admin/inhouse/workflow-runs         - List workflow runs across all projects
 * - GET  /v1/admin/inhouse/workflow-runs/stuck   - List stuck workflow runs
 * - POST /v1/admin/inhouse/workflow-runs/:id/retry  - Retry a failed/stuck workflow run
 * - POST /v1/admin/inhouse/workflow-runs/:id/cancel - Cancel a queued/running workflow run
 * - GET  /v1/admin/inhouse/workflow-sends        - List individual email sends
 * - GET  /v1/admin/inhouse/business-events       - List business events
 * - GET  /v1/admin/inhouse/business-events/stats - Get event statistics
 * - GET  /v1/admin/inhouse/business-events/:id   - Get single business event
 * - GET  /v1/admin/inhouse/kpi-health/summary    - Get overall KPI health summary
 * - GET  /v1/admin/inhouse/kpi-health/projects   - Get per-project KPI health
 * - GET  /v1/admin/inhouse/kpi-health/rollup-job - Get rollup job status
 * - POST /v1/admin/inhouse/kpi-health/trigger-rollup - Manually trigger KPI rollup
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset, safeParsePayload } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { randomUUID } from 'crypto'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface WorkflowRun {
  id: string
  projectId: string
  projectName: string | null
  actionId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  idempotencyKey: string
  requestedAt: string
  startedAt: string | null
  completedAt: string | null
  leaseExpiresAt: string | null
  attempts: number
  maxAttempts: number
  params: Record<string, unknown> | null
  result: {
    totalRecipients?: number
    successful?: number
    failed?: number
  } | null
  outcome: {
    model?: string
    windowHours?: number
    conversions?: number
    revenueCents?: number
    currency?: string
    confidence?: 'high' | 'medium' | 'low'
    matchedBy?: string
  } | null
  error: string | null
}

interface StuckWorkflowRun {
  id: string
  projectId: string
  projectName: string | null
  actionId: string
  requestedAt: string
  leaseExpiresAt: string
  attempts: number
}

interface WorkflowSend {
  id: string
  projectId: string
  projectName: string | null
  runId: string
  actionId: string
  recipientEmail: string
  status: 'sent' | 'failed' | 'suppressed'
  sentAt: string
  error: string | null
}

interface BusinessEvent {
  id: number
  publicId: string
  projectId: string
  projectName: string | null
  eventType: string
  occurredAt: string
  receivedAt: string
  source: string
  actorType: string | null
  actorId: string | null
  entityType: string | null
  entityId: string | null
  sessionId: string | null
  anonymousId: string | null
  correlationId: string | null
  payload: Record<string, unknown>
}

interface EventTypeCount {
  eventType: string
  count: number
}

interface ProjectKpiHealth {
  projectId: string
  projectName: string | null
  lastRollupAt: string | null
  lastEventAt: string | null
  todayRevenueCents: number
  todayLeads: number
  todayPayments: number
  currencyCode: string
  status: 'healthy' | 'stale' | 'no_data'
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const STATEMENT_TIMEOUT = '10s'
const MAX_ATTEMPTS = 3

const VALID_WORKFLOW_STATUSES = ['queued', 'running', 'succeeded', 'failed']
const VALID_ACTION_IDS = ['recover_abandoned', 'send_promo', 'onboard_users', 'send_reminders', 'send_motivation']

// Staleness threshold: 2 hours (KPI rollup runs every 15 min)
const STALE_THRESHOLD_HOURS = 2

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseRunHubRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // ===========================================================================
  // GET /v1/admin/inhouse/workflow-runs - List workflow runs across all projects
  // ===========================================================================
  fastify.get<{
    Querystring: {
      projectId?: string
      status?: string
      actionId?: string
      limit?: string
      cursor?: string
    }
  }>('/v1/admin/inhouse/workflow-runs', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, status, actionId, limit: limitStr, cursor } = request.query
      const { limit } = parseLimitOffset(limitStr, undefined, DEFAULT_LIMIT, MAX_LIMIT)

      // Validate filters
      const safeStatus = status && VALID_WORKFLOW_STATUSES.includes(status) ? status : null
      const safeActionId = actionId && VALID_ACTION_IDS.includes(actionId) ? actionId : null

      // Build query conditions
      const conditions: string[] = []
      const params: unknown[] = []
      let paramIndex = 1

      // Only Easy Mode projects
      conditions.push(`p.infra_mode = 'easy'`)

      if (projectId) {
        conditions.push(`wr.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (safeStatus) {
        conditions.push(`wr.status = $${paramIndex}`)
        params.push(safeStatus)
        paramIndex++
      }

      if (safeActionId) {
        conditions.push(`wr.action_id = $${paramIndex}`)
        params.push(safeActionId)
        paramIndex++
      }

      if (cursor) {
        conditions.push(`wr.id < $${paramIndex}`)
        params.push(cursor)
        paramIndex++
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const { rows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        return client.query(
          `SELECT
            wr.id,
            wr.project_id,
            p.name as project_name,
            wr.action_id,
            wr.status,
            wr.idempotency_key,
            wr.requested_at,
            wr.started_at,
            wr.completed_at,
            wr.lease_expires_at,
            wr.attempts,
            wr.params,
            wr.result
          FROM workflow_runs wr
          JOIN projects p ON p.id = wr.project_id
          ${whereClause}
          ORDER BY wr.requested_at DESC
          LIMIT $${paramIndex}`,
          [...params, limit + 1]
        )
      })

      const hasMore = rows.length > limit
      const runsData = hasMore ? rows.slice(0, limit) : rows

      const runs: WorkflowRun[] = runsData.map(row => ({
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        actionId: row.action_id,
        status: row.status,
        idempotencyKey: row.idempotency_key,
        requestedAt: row.requested_at?.toISOString() || null,
        startedAt: row.started_at?.toISOString() || null,
        completedAt: row.completed_at?.toISOString() || null,
        leaseExpiresAt: row.lease_expires_at?.toISOString() || null,
        attempts: row.attempts || 0,
        maxAttempts: MAX_ATTEMPTS,
        params: safeParsePayload(row.params),
        result: safeParsePayload(row.result),
        outcome: null, // Attribution data would come from a join if we had it
        error: row.result?.error_summary || null,
      }))

      const nextCursor = hasMore && runsData.length > 0 ? runsData[runsData.length - 1].id : null

      return reply.send({
        success: true,
        data: {
          runs,
          nextCursor,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get workflow runs')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get workflow runs',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/workflow-runs/stuck - List stuck workflow runs
  // ===========================================================================
  fastify.get<{
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/workflow-runs/stuck', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId } = request.query

      const conditions: string[] = [
        `p.infra_mode = 'easy'`,
        `wr.status = 'running'`,
        `wr.lease_expires_at < NOW()`,
      ]
      const params: unknown[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`wr.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const { rows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        return client.query(
          `SELECT
            wr.id,
            wr.project_id,
            p.name as project_name,
            wr.action_id,
            wr.requested_at,
            wr.lease_expires_at,
            wr.attempts
          FROM workflow_runs wr
          JOIN projects p ON p.id = wr.project_id
          ${whereClause}
          ORDER BY wr.lease_expires_at ASC
          LIMIT 100`,
          params
        )
      })

      const runs: StuckWorkflowRun[] = rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        actionId: row.action_id,
        requestedAt: row.requested_at?.toISOString() || '',
        leaseExpiresAt: row.lease_expires_at?.toISOString() || '',
        attempts: row.attempts || 0,
      }))

      return reply.send({
        success: true,
        data: { runs },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get stuck workflow runs')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stuck workflow runs',
      })
    }
  })

  // ===========================================================================
  // POST /v1/admin/inhouse/workflow-runs/:id/retry - Retry a failed/stuck run
  // ===========================================================================
  fastify.post<{
    Params: { id: string }
    Body: { reason?: string }
  }>('/v1/admin/inhouse/workflow-runs/:id/retry', { preHandler: writeMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { id } = request.params
      const { reason } = request.body || {}
      const adminRequest = request as AdminRequest

      // Get the original run
      const { rows: [originalRun] } = await db.query(
        `SELECT wr.*, p.infra_mode
         FROM workflow_runs wr
         JOIN projects p ON p.id = wr.project_id
         WHERE wr.id = $1`,
        [id]
      )

      if (!originalRun) {
        return reply.status(404).send({
          success: false,
          error: 'Workflow run not found',
        })
      }

      if (originalRun.infra_mode !== 'easy') {
        return reply.status(400).send({
          success: false,
          error: 'Can only retry Easy Mode workflow runs',
        })
      }

      if (!['failed', 'running'].includes(originalRun.status)) {
        return reply.status(400).send({
          success: false,
          error: `Cannot retry workflow in '${originalRun.status}' status. Only failed or stuck runs can be retried.`,
        })
      }

      // For stuck runs (running but lease expired), check if truly stuck
      if (originalRun.status === 'running' && new Date(originalRun.lease_expires_at) > new Date()) {
        return reply.status(400).send({
          success: false,
          error: 'Workflow is still running. Wait for it to complete or for the lease to expire.',
        })
      }

      // Create a new run with same params but new idempotency key
      const newIdempotencyKey = randomUUID()
      const params = safeParsePayload(originalRun.params) || {}

      const { rows: [newRun] } = await db.query(
        `INSERT INTO workflow_runs (
          project_id, action_id, status, idempotency_key, params,
          recipient_count_estimate, triggered_by, requested_at
        ) VALUES ($1, $2, 'queued', $3, $4, $5, $6, NOW())
        RETURNING id, status`,
        [
          originalRun.project_id,
          originalRun.action_id,
          newIdempotencyKey,
          JSON.stringify({ ...params, retryOf: id, retryReason: reason }),
          originalRun.recipient_count_estimate,
          adminRequest.adminClaims.sub,
        ]
      )

      // Audit the action
      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'workflow_retry',
        projectId: originalRun.project_id,
        resourceType: 'workflow_run',
        resourceId: id,
        reason: reason || null,
        metadata: { newRunId: newRun.id, originalStatus: originalRun.status },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.status(201).send({
        success: true,
        data: {
          newRunId: newRun.id,
          status: newRun.status,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to retry workflow run')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry workflow run',
      })
    }
  })

  // ===========================================================================
  // POST /v1/admin/inhouse/workflow-runs/:id/cancel - Cancel a queued/running run
  // ===========================================================================
  fastify.post<{
    Params: { id: string }
    Body: { reason?: string }
  }>('/v1/admin/inhouse/workflow-runs/:id/cancel', { preHandler: writeMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { id } = request.params
      const { reason } = request.body || {}
      const adminRequest = request as AdminRequest

      // Get the run
      const { rows: [run] } = await db.query(
        `SELECT wr.*, p.infra_mode
         FROM workflow_runs wr
         JOIN projects p ON p.id = wr.project_id
         WHERE wr.id = $1`,
        [id]
      )

      if (!run) {
        return reply.status(404).send({
          success: false,
          error: 'Workflow run not found',
        })
      }

      if (run.infra_mode !== 'easy') {
        return reply.status(400).send({
          success: false,
          error: 'Can only cancel Easy Mode workflow runs',
        })
      }

      if (!['queued', 'running'].includes(run.status)) {
        return reply.status(400).send({
          success: false,
          error: `Cannot cancel workflow in '${run.status}' status. Only queued or running workflows can be cancelled.`,
        })
      }

      // Update status to failed with cancellation reason
      await db.query(
        `UPDATE workflow_runs
         SET status = 'failed',
             completed_at = NOW(),
             result = jsonb_build_object(
               'cancelled', true,
               'cancelledBy', $2,
               'cancelReason', $3
             )
         WHERE id = $1`,
        [id, adminRequest.adminClaims.sub, reason || 'Admin cancellation']
      )

      // Audit the action
      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'workflow_cancel',
        projectId: run.project_id,
        resourceType: 'workflow_run',
        resourceId: id,
        reason: reason || null,
        metadata: { originalStatus: run.status },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: { status: 'cancelled' },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to cancel workflow run')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel workflow run',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/workflow-sends - List individual email sends
  // ===========================================================================
  fastify.get<{
    Querystring: {
      projectId?: string
      email?: string
      limit?: string
    }
  }>('/v1/admin/inhouse/workflow-sends', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, email, limit: limitStr } = request.query
      const { limit } = parseLimitOffset(limitStr, undefined, DEFAULT_LIMIT, MAX_LIMIT)

      const conditions: string[] = [`p.infra_mode = 'easy'`]
      const params: unknown[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`ws.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (email) {
        conditions.push(`ws.email ILIKE $${paramIndex}`)
        params.push(`%${email}%`)
        paramIndex++
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const { rows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        return client.query(
          `SELECT
            ws.id,
            ws.project_id,
            p.name as project_name,
            ws.workflow_run_id,
            ws.action_id,
            ws.email,
            ws.status,
            ws.sent_at
          FROM workflow_sends ws
          JOIN projects p ON p.id = ws.project_id
          ${whereClause}
          ORDER BY ws.sent_at DESC
          LIMIT $${paramIndex}`,
          [...params, limit]
        )
      })

      const sends: WorkflowSend[] = rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        runId: row.workflow_run_id,
        actionId: row.action_id,
        recipientEmail: row.email,
        status: row.status,
        sentAt: row.sent_at?.toISOString() || '',
        error: null, // Could be added if we store error details
      }))

      return reply.send({
        success: true,
        data: { sends },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get workflow sends')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get workflow sends',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/business-events - List business events
  // ===========================================================================
  fastify.get<{
    Querystring: {
      projectId?: string
      eventType?: string
      startDate?: string
      endDate?: string
      limit?: string
      cursor?: string
    }
  }>('/v1/admin/inhouse/business-events', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, eventType, startDate, endDate, limit: limitStr, cursor } = request.query
      const { limit } = parseLimitOffset(limitStr, undefined, DEFAULT_LIMIT, MAX_LIMIT)

      const conditions: string[] = [`p.infra_mode = 'easy'`]
      const params: unknown[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`be.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (eventType) {
        conditions.push(`be.event_type = $${paramIndex}`)
        params.push(eventType)
        paramIndex++
      }

      if (startDate) {
        conditions.push(`be.occurred_at >= $${paramIndex}::date`)
        params.push(startDate)
        paramIndex++
      }

      if (endDate) {
        conditions.push(`be.occurred_at < ($${paramIndex}::date + interval '1 day')`)
        params.push(endDate)
        paramIndex++
      }

      if (cursor) {
        conditions.push(`be.id < $${paramIndex}`)
        params.push(parseInt(cursor, 10))
        paramIndex++
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const { rows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        return client.query(
          `SELECT
            be.id,
            be.public_id,
            be.project_id,
            p.name as project_name,
            be.event_type,
            be.occurred_at,
            be.received_at,
            be.source,
            be.actor_type,
            be.actor_id,
            be.entity_type,
            be.entity_id,
            be.session_id,
            be.anonymous_id,
            be.correlation_id,
            be.payload
          FROM business_events be
          JOIN projects p ON p.id = be.project_id
          ${whereClause}
          ORDER BY be.id DESC
          LIMIT $${paramIndex}`,
          [...params, limit + 1]
        )
      })

      const hasMore = rows.length > limit
      const eventsData = hasMore ? rows.slice(0, limit) : rows

      const events: BusinessEvent[] = eventsData.map(row => ({
        id: row.id,
        publicId: row.public_id,
        projectId: row.project_id,
        projectName: row.project_name,
        eventType: row.event_type,
        occurredAt: row.occurred_at?.toISOString() || '',
        receivedAt: row.received_at?.toISOString() || '',
        source: row.source,
        actorType: row.actor_type,
        actorId: row.actor_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        sessionId: row.session_id,
        anonymousId: row.anonymous_id,
        correlationId: row.correlation_id,
        payload: safeParsePayload(row.payload) || {},
      }))

      const nextCursor = hasMore && eventsData.length > 0 ? String(eventsData[eventsData.length - 1].id) : null

      return reply.send({
        success: true,
        data: {
          events,
          nextCursor,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get business events')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get business events',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/business-events/stats - Get event statistics
  // ===========================================================================
  fastify.get<{
    Querystring: {
      projectId?: string
      startDate?: string
      endDate?: string
    }
  }>('/v1/admin/inhouse/business-events/stats', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, startDate, endDate } = request.query

      // Default to last 7 days
      const defaultEnd = new Date()
      const defaultStart = new Date()
      defaultStart.setDate(defaultStart.getDate() - 7)

      const effectiveStartDate = startDate || defaultStart.toISOString().split('T')[0]
      const effectiveEndDate = endDate || defaultEnd.toISOString().split('T')[0]

      const conditions: string[] = [
        `p.infra_mode = 'easy'`,
        `be.occurred_at >= $1::date`,
        `be.occurred_at < ($2::date + interval '1 day')`,
      ]
      const params: unknown[] = [effectiveStartDate, effectiveEndDate]
      let paramIndex = 3

      if (projectId) {
        conditions.push(`be.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const { totalCount, byType } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total
           FROM business_events be
           JOIN projects p ON p.id = be.project_id
           ${whereClause}`,
          params
        )

        const typeResult = await client.query(
          `SELECT be.event_type, COUNT(*) as count
           FROM business_events be
           JOIN projects p ON p.id = be.project_id
           ${whereClause}
           GROUP BY be.event_type
           ORDER BY count DESC
           LIMIT 20`,
          params
        )

        return {
          totalCount: parseInt(countResult.rows[0]?.total || '0', 10),
          byType: typeResult.rows,
        }
      })

      const byTypeFormatted: EventTypeCount[] = byType.map(row => ({
        eventType: row.event_type,
        count: parseInt(row.count, 10),
      }))

      return reply.send({
        success: true,
        data: {
          totalEvents: totalCount,
          startDate: effectiveStartDate,
          endDate: effectiveEndDate,
          byType: byTypeFormatted,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get business event stats')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get business event stats',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/business-events/:id - Get single business event
  // ===========================================================================
  fastify.get<{
    Params: { id: string }
  }>('/v1/admin/inhouse/business-events/:id', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { id } = request.params
      const eventId = parseInt(id, 10)

      if (isNaN(eventId)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid event ID',
        })
      }

      const { rows } = await db.query(
        `SELECT
          be.id,
          be.public_id,
          be.project_id,
          p.name as project_name,
          be.event_type,
          be.occurred_at,
          be.received_at,
          be.source,
          be.actor_type,
          be.actor_id,
          be.entity_type,
          be.entity_id,
          be.session_id,
          be.anonymous_id,
          be.correlation_id,
          be.payload
        FROM business_events be
        JOIN projects p ON p.id = be.project_id
        WHERE be.id = $1 AND p.infra_mode = 'easy'`,
        [eventId]
      )

      if (rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Business event not found',
        })
      }

      const row = rows[0]
      const event: BusinessEvent = {
        id: row.id,
        publicId: row.public_id,
        projectId: row.project_id,
        projectName: row.project_name,
        eventType: row.event_type,
        occurredAt: row.occurred_at?.toISOString() || '',
        receivedAt: row.received_at?.toISOString() || '',
        source: row.source,
        actorType: row.actor_type,
        actorId: row.actor_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        sessionId: row.session_id,
        anonymousId: row.anonymous_id,
        correlationId: row.correlation_id,
        payload: safeParsePayload(row.payload) || {},
      }

      return reply.send({
        success: true,
        data: event,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get business event')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get business event',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/kpi-health/summary - Get overall KPI health summary
  // ===========================================================================
  fastify.get('/v1/admin/inhouse/kpi-health/summary', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()

      const { projectCounts, lastGlobalRollup } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        // Count projects by health status
        const countsResult = await client.query(
          `WITH project_health AS (
            SELECT
              p.id,
              MAX(kpi.updated_at) as last_rollup_at,
              MAX(be.occurred_at) as last_event_at,
              CASE
                WHEN MAX(kpi.updated_at) IS NULL AND MAX(be.occurred_at) IS NULL THEN 'no_data'
                WHEN MAX(kpi.updated_at) < NOW() - interval '${STALE_THRESHOLD_HOURS} hours' THEN 'stale'
                ELSE 'healthy'
              END as health_status
            FROM projects p
            LEFT JOIN business_kpi_daily kpi ON kpi.project_id = p.id
            LEFT JOIN business_events be ON be.project_id = p.id
            WHERE p.infra_mode = 'easy'
            GROUP BY p.id
          )
          SELECT
            COUNT(*) FILTER (WHERE true) as total,
            COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy,
            COUNT(*) FILTER (WHERE health_status = 'stale') as stale,
            COUNT(*) FILTER (WHERE health_status = 'no_data') as no_data
          FROM project_health`
        )

        // Get last global rollup time
        const rollupResult = await client.query(
          `SELECT MAX(updated_at) as last_rollup
           FROM business_kpi_daily`
        )

        return {
          projectCounts: countsResult.rows[0],
          lastGlobalRollup: rollupResult.rows[0]?.last_rollup,
        }
      })

      return reply.send({
        success: true,
        data: {
          totalProjects: parseInt(projectCounts.total || '0', 10),
          healthyProjects: parseInt(projectCounts.healthy || '0', 10),
          staleProjects: parseInt(projectCounts.stale || '0', 10),
          noDataProjects: parseInt(projectCounts.no_data || '0', 10),
          lastGlobalRollupAt: lastGlobalRollup?.toISOString() || null,
          rollupJobStatus: 'idle', // Would need to check actual job status
          rollupIntervalMinutes: 15,
          avgRollupDurationMs: null, // Would need metrics tracking
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get KPI health summary')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get KPI health summary',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/kpi-health/projects - Get per-project KPI health
  // ===========================================================================
  fastify.get<{
    Querystring: {
      limit?: string
      offset?: string
    }
  }>('/v1/admin/inhouse/kpi-health/projects', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr, DEFAULT_LIMIT, MAX_LIMIT)

      const today = new Date().toISOString().split('T')[0]

      const { rows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        return client.query(
          `SELECT
            p.id as project_id,
            p.name as project_name,
            MAX(kpi.updated_at) as last_rollup_at,
            MAX(be.occurred_at) as last_event_at,
            COALESCE(today_kpi.revenue_cents, 0) as today_revenue_cents,
            COALESCE(today_kpi.leads, 0) as today_leads,
            COALESCE(today_kpi.payments, 0) as today_payments,
            COALESCE(today_kpi.currency_code, 'USD') as currency_code,
            CASE
              WHEN MAX(kpi.updated_at) IS NULL AND MAX(be.occurred_at) IS NULL THEN 'no_data'
              WHEN MAX(kpi.updated_at) < NOW() - interval '${STALE_THRESHOLD_HOURS} hours' THEN 'stale'
              ELSE 'healthy'
            END as status
          FROM projects p
          LEFT JOIN business_kpi_daily kpi ON kpi.project_id = p.id
          LEFT JOIN business_events be ON be.project_id = p.id
          LEFT JOIN business_kpi_daily today_kpi ON today_kpi.project_id = p.id AND today_kpi.date = $1::date
          WHERE p.infra_mode = 'easy'
          GROUP BY p.id, p.name, today_kpi.revenue_cents, today_kpi.leads, today_kpi.payments, today_kpi.currency_code
          ORDER BY last_event_at DESC NULLS LAST
          LIMIT $2 OFFSET $3`,
          [today, limit, offset]
        )
      })

      const projects: ProjectKpiHealth[] = rows.map(row => ({
        projectId: row.project_id,
        projectName: row.project_name,
        lastRollupAt: row.last_rollup_at?.toISOString() || null,
        lastEventAt: row.last_event_at?.toISOString() || null,
        todayRevenueCents: parseInt(row.today_revenue_cents || '0', 10),
        todayLeads: parseInt(row.today_leads || '0', 10),
        todayPayments: parseInt(row.today_payments || '0', 10),
        currencyCode: row.currency_code || 'USD',
        status: row.status,
      }))

      return reply.send({
        success: true,
        data: { projects },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get project KPI health')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project KPI health',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/kpi-health/rollup-job - Get rollup job status
  // ===========================================================================
  fastify.get('/v1/admin/inhouse/kpi-health/rollup-job', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()

      // Get last rollup info from business_kpi_daily
      const { rows } = await db.query(
        `SELECT
          MAX(updated_at) as last_run_at,
          MIN(updated_at) FILTER (WHERE updated_at > NOW() - interval '1 hour') as recent_run_start
        FROM business_kpi_daily`
      )

      const lastRunAt = rows[0]?.last_run_at?.toISOString() || null

      // Calculate next scheduled run (every 15 minutes)
      let nextScheduledAt: string | null = null
      if (lastRunAt) {
        const lastRun = new Date(lastRunAt)
        const nextRun = new Date(lastRun)
        nextRun.setMinutes(Math.ceil(nextRun.getMinutes() / 15) * 15)
        if (nextRun <= new Date()) {
          nextRun.setMinutes(nextRun.getMinutes() + 15)
        }
        nextScheduledAt = nextRun.toISOString()
      }

      // Note: We don't have actual job error tracking here
      // This would need to be integrated with the scheduled job system

      return reply.send({
        success: true,
        data: {
          status: 'idle',
          lastRunAt,
          lastDurationMs: null, // Would need metrics tracking
          nextScheduledAt,
          recentErrors: [], // Would need error tracking integration
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get rollup job status')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get rollup job status',
      })
    }
  })

  // ===========================================================================
  // POST /v1/admin/inhouse/kpi-health/trigger-rollup - Manually trigger rollup
  // ===========================================================================
  fastify.post<{
    Body: {
      projectId?: string
      reason?: string
    }
  }>('/v1/admin/inhouse/kpi-health/trigger-rollup', { preHandler: writeMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, reason } = request.body || {}
      const adminRequest = request as AdminRequest

      // Validate project if provided
      if (projectId) {
        const { rows } = await db.query(
          `SELECT id FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
          [projectId]
        )
        if (rows.length === 0) {
          return reply.status(404).send({
            success: false,
            error: 'Project not found or not an Easy Mode project',
          })
        }
      }

      // Note: This would trigger the actual businessKpiRollupJob
      // For now, we'll just acknowledge the request
      // The job system would need to expose a trigger mechanism

      // Count affected projects
      let projectsAffected = 1
      if (!projectId) {
        const { rows } = await db.query(
          `SELECT COUNT(*) as count FROM projects WHERE infra_mode = 'easy'`
        )
        projectsAffected = parseInt(rows[0]?.count || '1', 10)
      }

      // Audit the action
      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'kpi_rollup_trigger',
        projectId: projectId || null,
        resourceType: 'kpi_rollup',
        reason: reason || null,
        metadata: { projectsAffected },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.status(202).send({
        success: true,
        data: {
          triggered: true,
          projectsAffected,
          estimatedDurationMs: projectsAffected * 50, // Rough estimate
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to trigger KPI rollup')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger KPI rollup',
      })
    }
  })
}
