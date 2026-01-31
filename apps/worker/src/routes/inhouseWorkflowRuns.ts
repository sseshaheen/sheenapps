/**
 * In-House Workflow Runs Routes
 *
 * Run Hub Phase 4: Workflow execution endpoints.
 *
 * Routes:
 * - POST /v1/inhouse/projects/:projectId/run/workflow-runs         - Create workflow run
 * - GET  /v1/inhouse/projects/:projectId/run/workflow-runs         - List workflow runs
 * - GET  /v1/inhouse/projects/:projectId/run/workflow-runs/:runId  - Get workflow run
 * - POST /v1/inhouse/projects/:projectId/run/workflow-runs/preview - Preview recipients
 * - GET  /v1/inhouse/projects/:projectId/run/actions               - List available actions
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getWorkflowExecutionService } from '../services/workflowExecutionService'
import { getWorkflowPolicyService } from '../services/workflowPolicyService'
import { initializeDigestNextAt, clearDigestNextAt } from '../jobs/dailyDigestJob'
import { pool } from '../services/database'
import type {
  ActionId,
  CreateWorkflowRunRequest,
  PreviewRequest,
  WorkflowStatus,
  ActionDefinition,
} from '../types/run-contracts'

// ============================================
// ACTION REGISTRY (Backend source of truth)
// ============================================

const ACTION_REGISTRY: Record<string, ActionDefinition> = {
  recover_abandoned: {
    id: 'recover_abandoned',
    type: 'workflow',
    risk: 'medium',
    confirmRequired: true,
    supportsPreview: true,
    outcome: {
      model: 'last_touch_48h',
      windowHours: 48,
      metrics: ['recovered_revenue', 'conversions'],
    },
    requires: [
      { type: 'hasIntegration', integration: 'payments' },
      { type: 'hasEvents', eventType: 'checkout_started', minCount: 1 },
    ],
  },
  send_promo: {
    id: 'send_promo',
    type: 'workflow',
    risk: 'high',
    confirmRequired: true,
    supportsPreview: true,
    ui: { modalId: 'sendPromo' },
    outcome: {
      model: 'last_touch_48h',
      windowHours: 48,
      metrics: ['attributed_revenue', 'orders'],
    },
    requires: [
      { type: 'hasIntegration', integration: 'email' },
      { type: 'hasRecipients', source: 'customers_30d' },
    ],
  },
  onboard_users: {
    id: 'onboard_users',
    type: 'workflow',
    risk: 'medium',
    confirmRequired: true,
    supportsPreview: true,
    outcome: {
      model: 'last_touch_48h',
      windowHours: 48,
      metrics: ['engagement_rate', 'retention'],
    },
    requires: [{ type: 'hasRecipients', source: 'signups_7d' }],
  },
  follow_up_leads: {
    id: 'follow_up_leads' as ActionId,
    type: 'navigate',
    risk: 'low',
    confirmRequired: false,
    supportsPreview: false,
    requires: [{ type: 'hasRecipients', source: 'leads_7d' }],
    disabledReasonKey: 'actions.disabled.noLeads',
  },
  follow_up_orders: {
    id: 'follow_up_orders' as ActionId,
    type: 'navigate',
    risk: 'low',
    confirmRequired: false,
    supportsPreview: false,
  },
}

// Valid action IDs for workflows
const WORKFLOW_ACTION_IDS = ['recover_abandoned', 'send_promo', 'onboard_users'] as const

function isValidActionId(id: string): id is ActionId {
  return WORKFLOW_ACTION_IDS.includes(id as any)
}

export async function inhouseWorkflowRunsRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  // ============================================
  // POST /run/workflow-runs - Create workflow run
  // ============================================
  fastify.post<{
    Params: { projectId: string }
    Body: CreateWorkflowRunRequest
  }>('/v1/inhouse/projects/:projectId/run/workflow-runs', {
    preHandler: hmacMiddleware as any,
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'actionId', 'idempotencyKey'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
          actionId: { type: 'string' },
          idempotencyKey: { type: 'string', format: 'uuid' },
          clientRequestedAt: { type: 'string' },
          params: { type: 'object' },
          recipientCountEstimate: { type: 'integer', minimum: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, actionId, idempotencyKey, clientRequestedAt, params, recipientCountEstimate } = request.body

    // Validate actionId
    if (!isValidActionId(actionId)) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'INVALID_ACTION', message: `Unknown action: ${actionId}` },
      })
    }

    // Authorize
    try {
      await assertProjectAccess(projectId, userId)
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        ok: false,
        error: { code: err.code || 'UNAUTHORIZED', message: err.message },
      })
    }

    try {
      const executionService = getWorkflowExecutionService()
      const result = await executionService.createRun({
        projectId,
        actionId,
        triggeredBy: userId,
        idempotencyKey,
        clientRequestedAt,
        params,
        recipientCountEstimate,
        locale: (request as any).locale,
      })

      // If this is a new run (not deduplicated), execute inline
      // TODO: Move to BullMQ queue for async processing in production
      if (!result.deduplicated) {
        executionService.execute(result.runId).catch((err: unknown) => {
          request.log.error({ error: err, runId: result.runId }, 'Inline workflow execution failed')
        })
      }

      return reply.code(result.deduplicated ? 200 : 201).send({
        ok: true,
        data: result,
      })
    } catch (error) {
      request.log.error({ error, projectId, userId, actionId }, 'Failed to create workflow run')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create workflow run' },
      })
    }
  })

  // ============================================
  // GET /run/workflow-runs - List workflow runs
  // ============================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: {
      userId: string
      actionId?: string
      status?: string
      limit?: string
      cursor?: string
    }
  }>('/v1/inhouse/projects/:projectId/run/workflow-runs', {
    preHandler: hmacMiddleware as any,
    schema: {
      querystring: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
          actionId: { type: 'string' },
          status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'failed'] },
          limit: { type: 'string', pattern: '^\\d+$' },
          cursor: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, actionId, status, limit, cursor } = request.query

    // Authorize
    try {
      await assertProjectAccess(projectId, userId)
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        ok: false,
        error: { code: err.code || 'UNAUTHORIZED', message: err.message },
      })
    }

    try {
      const executionService = getWorkflowExecutionService()
      const result = await executionService.listRuns(projectId, {
        actionId: actionId as ActionId | undefined,
        status: status as WorkflowStatus | undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        cursor,
      })

      return reply.code(200).send({
        ok: true,
        data: result,
      })
    } catch (error) {
      request.log.error({ error, projectId, userId }, 'Failed to list workflow runs')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list workflow runs' },
      })
    }
  })

  // ============================================
  // GET /run/workflow-runs/:runId - Get workflow run
  // ============================================
  fastify.get<{
    Params: { projectId: string; runId: string }
    Querystring: { userId: string }
  }>('/v1/inhouse/projects/:projectId/run/workflow-runs/:runId', {
    preHandler: hmacMiddleware as any,
    schema: {
      querystring: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId, runId } = request.params
    const { userId } = request.query

    // Authorize
    try {
      await assertProjectAccess(projectId, userId)
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        ok: false,
        error: { code: err.code || 'UNAUTHORIZED', message: err.message },
      })
    }

    try {
      const executionService = getWorkflowExecutionService()
      const run = await executionService.getRun(runId)

      if (!run) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Workflow run not found' },
        })
      }

      // Verify run belongs to this project
      if (run.projectId !== projectId) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Workflow run not found' },
        })
      }

      return reply.code(200).send({
        ok: true,
        data: run,
      })
    } catch (error) {
      request.log.error({ error, projectId, runId, userId }, 'Failed to get workflow run')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflow run' },
      })
    }
  })

  // ============================================
  // POST /run/workflow-runs/preview - Preview recipients
  // ============================================
  fastify.post<{
    Params: { projectId: string }
    Body: PreviewRequest & { userId: string }
  }>('/v1/inhouse/projects/:projectId/run/workflow-runs/preview', {
    preHandler: hmacMiddleware as any,
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'actionId'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
          actionId: { type: 'string' },
          params: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, actionId, params } = request.body

    // Validate actionId
    if (!isValidActionId(actionId)) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'INVALID_ACTION', message: `Unknown action: ${actionId}` },
      })
    }

    // Authorize
    try {
      await assertProjectAccess(projectId, userId)
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        ok: false,
        error: { code: err.code || 'UNAUTHORIZED', message: err.message },
      })
    }

    try {
      const executionService = getWorkflowExecutionService()
      const preview = await executionService.previewRecipients(projectId, actionId, params)

      return reply.code(200).send({
        ok: true,
        data: preview,
      })
    } catch (error) {
      request.log.error({ error, projectId, userId, actionId }, 'Failed to preview recipients')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to preview recipients' },
      })
    }
  })

  // ============================================
  // GET /run/actions - List available actions
  // ============================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { userId: string }
  }>('/v1/inhouse/projects/:projectId/run/actions', {
    preHandler: hmacMiddleware as any,
    schema: {
      querystring: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId } = request.query

    // Authorize
    try {
      await assertProjectAccess(projectId, userId)
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        ok: false,
        error: { code: err.code || 'UNAUTHORIZED', message: err.message },
      })
    }

    try {
      // TODO: Filter actions based on project integrations and policy
      // For now, return all actions
      const actions = Object.values(ACTION_REGISTRY)

      // Get last run info for each workflow action
      const policyService = getWorkflowPolicyService()
      const actionsWithLastRun = await Promise.all(
        actions.map(async (action) => {
          if (action.type !== 'workflow') {
            return { ...action, lastRun: null }
          }

          const lastRun = await policyService.getLastRunInfo(projectId, action.id)
          return { ...action, lastRun }
        })
      )

      return reply.code(200).send({
        ok: true,
        data: { actions: actionsWithLastRun },
      })
    } catch (error) {
      request.log.error({ error, projectId, userId }, 'Failed to list actions')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list actions' },
      })
    }
  })

  // ============================================
  // POST /run/digest-settings - Update digest scheduling
  // ============================================
  fastify.post<{
    Params: { projectId: string }
    Body: {
      userId: string
      enabled: boolean
      hour: number
    }
  }>('/v1/inhouse/projects/:projectId/run/digest-settings', {
    preHandler: hmacMiddleware as any,
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'enabled', 'hour'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
          enabled: { type: 'boolean' },
          hour: { type: 'integer', minimum: 0, maximum: 23 },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, enabled, hour } = request.body

    // Authorize
    try {
      await assertProjectAccess(projectId, userId)
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        ok: false,
        error: { code: err.code || 'UNAUTHORIZED', message: err.message },
      })
    }

    try {
      if (enabled) {
        // Get project timezone
        const projectResult = await pool?.query(
          `SELECT COALESCE(timezone, 'UTC') as timezone FROM projects WHERE id = $1`,
          [projectId]
        )
        const timezone = projectResult?.rows[0]?.timezone || 'UTC'

        // Initialize digest_next_at
        const nextAt = await initializeDigestNextAt(projectId, timezone, hour)

        return reply.code(200).send({
          ok: true,
          data: { digestNextAt: nextAt.toISOString() },
        })
      } else {
        // Clear digest_next_at
        await clearDigestNextAt(projectId)

        return reply.code(200).send({
          ok: true,
          data: { digestNextAt: null },
        })
      }
    } catch (error) {
      request.log.error({ error, projectId, userId }, 'Failed to update digest settings')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update digest settings' },
      })
    }
  })
}
