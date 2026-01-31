/**
 * Admin In-House Flags Routes
 *
 * Endpoints for managing feature flags across all In-House Mode projects.
 * Provides visibility and control over flag configurations.
 *
 * Routes:
 * - GET  /v1/admin/inhouse/flags                                        - List all flags (cross-project)
 * - GET  /v1/admin/inhouse/flags/:flagId                                - Get flag details
 * - PUT  /v1/admin/inhouse/flags/:flagId/toggle                         - Toggle flag enabled status
 * - GET  /v1/admin/inhouse/flags/:flagId/overrides                      - List flag overrides
 * - POST /v1/admin/inhouse/flags/:flagId/overrides/:overrideId/delete   - Delete override
 * - POST /v1/admin/inhouse/flags/:flagId/evaluate                       - Test flag evaluation
 */

import { createHash } from 'crypto'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface FlagRule {
  attribute: string
  operator: string
  value: unknown
  percentage: number
}

interface FlagOverride {
  id: string
  user_id: string
  value: boolean
  expires_at: string | null
  created_at: string
}

interface FlagsQuery {
  projectId?: string
  enabled?: string
  search?: string
  limit?: string
  offset?: string
}

interface EvaluateBody {
  context: {
    userId?: string
    attributes?: Record<string, unknown>
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const STATEMENT_TIMEOUT = '5s'

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseFlagsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // ===========================================================================
  // GET /v1/admin/inhouse/flags - List all flags
  // ===========================================================================
  fastify.get<{
    Querystring: FlagsQuery
  }>(
    '/v1/admin/inhouse/flags',
    { preHandler: readMiddleware },
    async (request: FastifyRequest<{ Querystring: FlagsQuery }>, reply: FastifyReply) => {
      const db = requirePool()
      const { limit, offset } = parseLimitOffset(request.query.limit, request.query.offset)
      const { projectId, enabled, search } = request.query

      const conditions: string[] = []
      const params: unknown[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`f.project_id = $${paramIndex++}`)
        params.push(projectId)
      }

      if (enabled !== undefined) {
        conditions.push(`f.enabled = $${paramIndex++}`)
        params.push(enabled === 'true')
      }

      if (search) {
        conditions.push(`(f.key ILIKE $${paramIndex} OR f.name ILIKE $${paramIndex})`)
        params.push(`%${search}%`)
        paramIndex++
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const flagsResult = await client.query(
          `SELECT
            f.id,
            f.project_id,
            p.name as project_name,
            f.key,
            f.name,
            f.enabled,
            f.default_value,
            jsonb_array_length(COALESCE(f.rules, '[]'::jsonb)) as rule_count,
            (SELECT COUNT(*) FROM inhouse_flag_overrides o WHERE o.flag_id = f.id) as override_count,
            f.created_at,
            f.updated_at
          FROM inhouse_feature_flags f
          JOIN projects p ON p.id = f.project_id
          ${whereClause}
          ORDER BY f.updated_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        const countResult = await client.query(
          `SELECT COUNT(*) as total
           FROM inhouse_feature_flags f
           JOIN projects p ON p.id = f.project_id
           ${whereClause}`,
          params
        )

        return {
          flags: flagsResult.rows,
          total: parseInt(countResult.rows[0]?.total || '0', 10)
        }
      })

      return reply.send({
        success: true,
        data: {
          flags: result.flags,
          total: result.total,
          limit,
          offset
        }
      })
    }
  )

  // ===========================================================================
  // GET /v1/admin/inhouse/flags/:flagId - Get flag details
  // ===========================================================================
  fastify.get<{
    Params: { flagId: string }
  }>(
    '/v1/admin/inhouse/flags/:flagId',
    { preHandler: readMiddleware },
    async (request: FastifyRequest<{ Params: { flagId: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { flagId } = request.params

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const flagResult = await client.query(
          `SELECT
            f.id,
            f.project_id,
            p.name as project_name,
            f.key,
            f.name,
            f.description,
            f.enabled,
            f.default_value,
            f.rules,
            f.created_at,
            f.updated_at
          FROM inhouse_feature_flags f
          JOIN projects p ON p.id = f.project_id
          WHERE f.id = $1`,
          [flagId]
        )

        if (flagResult.rows.length === 0) {
          return null
        }

        const overridesResult = await client.query(
          `SELECT id, user_id, value, expires_at, created_at
           FROM inhouse_flag_overrides
           WHERE flag_id = $1
           ORDER BY created_at DESC
           LIMIT 100`,
          [flagId]
        )

        const evalCountResult = await client.query(
          `SELECT COUNT(*) as count
           FROM inhouse_activity_log
           WHERE service = 'flags'
             AND action = 'evaluate'
             AND resource_id = $1
             AND created_at > NOW() - INTERVAL '24 hours'`,
          [flagId]
        )

        return {
          flag: flagResult.rows[0],
          overrides: overridesResult.rows,
          recent_evaluations: parseInt(evalCountResult.rows[0]?.count || '0', 10)
        }
      })

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Flag not found' }
        })
      }

      return reply.send({
        success: true,
        data: {
          ...result.flag,
          overrides: result.overrides,
          recent_evaluations: result.recent_evaluations
        }
      })
    }
  )

  // ===========================================================================
  // PUT /v1/admin/inhouse/flags/:flagId/toggle - Toggle flag enabled status
  // ===========================================================================
  fastify.put<{
    Params: { flagId: string }
    Body: { enabled: boolean; reason: string }
  }>(
    '/v1/admin/inhouse/flags/:flagId/toggle',
    { preHandler: writeMiddleware },
    async (request: FastifyRequest<{ Params: { flagId: string }; Body: { enabled: boolean; reason: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { flagId } = request.params
      const { enabled, reason } = request.body
      const adminRequest = request as AdminRequest

      if (typeof enabled !== 'boolean') {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'enabled must be a boolean' }
        })
      }

      if (!reason || reason.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'reason is required' }
        })
      }

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const updateResult = await client.query(
          `UPDATE inhouse_feature_flags
           SET enabled = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, project_id, key, enabled, updated_at`,
          [enabled, flagId]
        )

        if (updateResult.rows.length === 0) {
          return null
        }

        // Log admin action
        await client.query(
          `INSERT INTO inhouse_admin_audit (admin_id, action, project_id, resource_type, resource_id, reason, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            adminRequest.adminClaims?.sub,
            enabled ? 'flag_enabled' : 'flag_disabled',
            updateResult.rows[0].project_id,
            'flag',
            flagId,
            reason,
            JSON.stringify({ key: updateResult.rows[0].key })
          ]
        )

        return updateResult.rows[0]
      })

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Flag not found' }
        })
      }

      return reply.send({
        success: true,
        data: result
      })
    }
  )

  // ===========================================================================
  // GET /v1/admin/inhouse/flags/:flagId/overrides - List flag overrides
  // ===========================================================================
  fastify.get<{
    Params: { flagId: string }
    Querystring: { limit?: string; offset?: string }
  }>(
    '/v1/admin/inhouse/flags/:flagId/overrides',
    { preHandler: readMiddleware },
    async (request: FastifyRequest<{ Params: { flagId: string }; Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { flagId } = request.params
      const { limit, offset } = parseLimitOffset(request.query.limit, request.query.offset)

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const overridesResult = await client.query(
          `SELECT id, user_id, value, expires_at, created_at
           FROM inhouse_flag_overrides
           WHERE flag_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [flagId, limit, offset]
        )

        const countResult = await client.query(
          `SELECT COUNT(*) as total
           FROM inhouse_flag_overrides
           WHERE flag_id = $1`,
          [flagId]
        )

        return {
          overrides: overridesResult.rows,
          total: parseInt(countResult.rows[0]?.total || '0', 10)
        }
      })

      return reply.send({
        success: true,
        data: {
          overrides: result.overrides,
          total: result.total,
          limit,
          offset
        }
      })
    }
  )

  // ===========================================================================
  // POST /v1/admin/inhouse/flags/:flagId/overrides/:overrideId/delete - Delete override
  // ===========================================================================
  fastify.post<{
    Params: { flagId: string; overrideId: string }
    Body: { reason: string }
  }>(
    '/v1/admin/inhouse/flags/:flagId/overrides/:overrideId/delete',
    { preHandler: writeMiddleware },
    async (request: FastifyRequest<{ Params: { flagId: string; overrideId: string }; Body: { reason: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { flagId, overrideId } = request.params
      const reason = (request.body?.reason || '').trim()
      const adminRequest = request as AdminRequest

      if (!reason) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'reason is required' }
        })
      }

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        // Get override details before deletion for audit
        const getResult = await client.query(
          `SELECT o.id, o.user_id, o.value, f.project_id, f.key
           FROM inhouse_flag_overrides o
           JOIN inhouse_feature_flags f ON f.id = o.flag_id
           WHERE o.id = $1 AND o.flag_id = $2`,
          [overrideId, flagId]
        )

        if (getResult.rows.length === 0) {
          return null
        }

        const override = getResult.rows[0]

        await client.query(
          `DELETE FROM inhouse_flag_overrides WHERE id = $1 AND flag_id = $2`,
          [overrideId, flagId]
        )

        // Log admin action
        await client.query(
          `INSERT INTO inhouse_admin_audit (admin_id, action, project_id, resource_type, resource_id, reason, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            adminRequest.adminClaims?.sub,
            'override_deleted',
            override.project_id,
            'flag_override',
            overrideId,
            reason,
            JSON.stringify({ flagKey: override.key, userId: override.user_id, value: override.value })
          ]
        )

        return { deleted: true }
      })

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Override not found' }
        })
      }

      return reply.send({
        success: true,
        data: result
      })
    }
  )

  // ===========================================================================
  // POST /v1/admin/inhouse/flags/:flagId/evaluate - Test flag evaluation
  // ===========================================================================
  fastify.post<{
    Params: { flagId: string }
    Body: EvaluateBody
  }>(
    '/v1/admin/inhouse/flags/:flagId/evaluate',
    { preHandler: readMiddleware },
    async (request: FastifyRequest<{ Params: { flagId: string }; Body: EvaluateBody }>, reply: FastifyReply) => {
      const db = requirePool()
      const { flagId } = request.params
      const { context } = request.body

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        // Get flag details
        const flagResult = await client.query(
          `SELECT id, key, enabled, default_value, rules
           FROM inhouse_feature_flags
           WHERE id = $1`,
          [flagId]
        )

        if (flagResult.rows.length === 0) {
          return null
        }

        const flag = flagResult.rows[0]

        // Check for override if userId provided
        let overrideValue: boolean | null = null
        if (context?.userId) {
          const overrideResult = await client.query(
            `SELECT value FROM inhouse_flag_overrides
             WHERE flag_id = $1 AND user_id = $2
               AND (expires_at IS NULL OR expires_at > NOW())`,
            [flagId, context.userId]
          )
          if (overrideResult.rows.length > 0) {
            overrideValue = overrideResult.rows[0].value
          }
        }

        return { flag, overrideValue }
      })

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Flag not found' }
        })
      }

      // Evaluate flag
      const evaluation = evaluateFlag(result.flag, context, result.overrideValue)

      return reply.send({
        success: true,
        data: {
          key: result.flag.key,
          ...evaluation,
          context_used: context
        }
      })
    }
  )
}

// =============================================================================
// FLAG EVALUATION LOGIC (simplified for admin testing)
// =============================================================================

interface FlagData {
  key: string
  enabled: boolean
  default_value: boolean
  rules: FlagRule[]
}

interface EvaluationResult {
  value: boolean
  reason: 'disabled' | 'override' | 'rule' | 'default'
  matched_rule: number | null
}

function evaluateFlag(
  flag: FlagData,
  context?: { userId?: string; attributes?: Record<string, unknown> },
  overrideValue?: boolean | null
): EvaluationResult {
  // Flag disabled
  if (!flag.enabled) {
    return { value: false, reason: 'disabled', matched_rule: null }
  }

  // Override takes precedence
  if (overrideValue !== null && overrideValue !== undefined) {
    return { value: overrideValue, reason: 'override', matched_rule: null }
  }

  // Evaluate rules
  const rules = flag.rules || []
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (!rule) continue
    if (matchesRule(rule, context)) {
      // Simple percentage check using userId hash
      if (rule.percentage >= 100) {
        return { value: true, reason: 'rule', matched_rule: i }
      }
      if (context?.userId && flag.key) {
        const bucket = bucketForUser(flag.key, context.userId)
        if (bucket < rule.percentage) {
          return { value: true, reason: 'rule', matched_rule: i }
        }
      }
    }
  }

  // Default value
  return { value: flag.default_value, reason: 'default', matched_rule: null }
}

function matchesRule(rule: FlagRule, context?: { userId?: string; attributes?: Record<string, unknown> }): boolean {
  if (!context?.attributes) return false

  const attrValue = context.attributes[rule.attribute]
  if (attrValue === undefined) return false

  switch (rule.operator) {
    case 'equals':
      return attrValue === rule.value
    case 'not_equals':
      return attrValue !== rule.value
    case 'contains':
      return String(attrValue).includes(String(rule.value))
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(attrValue)
    case 'gt':
      return typeof attrValue === 'number' && attrValue > (rule.value as number)
    case 'gte':
      return typeof attrValue === 'number' && attrValue >= (rule.value as number)
    case 'lt':
      return typeof attrValue === 'number' && attrValue < (rule.value as number)
    case 'lte':
      return typeof attrValue === 'number' && attrValue <= (rule.value as number)
    default:
      return false
  }
}

/**
 * Stable bucket assignment for feature flag rollouts.
 * Uses SHA-256 for deterministic, well-distributed hashing.
 *
 * IMPORTANT: Uses flagKey (not default_value) to ensure bucket stability
 * when flag configuration changes.
 */
function bucketForUser(flagKey: string, userId: string): number {
  const hex = createHash('sha256').update(`${flagKey}:${userId}`).digest('hex')
  // Take first 8 hex chars -> 32-bit integer, then mod 100 for percentage bucket
  const n = parseInt(hex.slice(0, 8), 16)
  return n % 100
}
