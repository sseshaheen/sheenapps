/**
 * Admin In-House AI Routes
 *
 * Endpoints for managing and monitoring AI usage across In-House Mode projects.
 * Provides visibility into model usage, token consumption, and error rates.
 *
 * Routes:
 * - GET /v1/admin/inhouse/ai/usage       - Get AI usage stats across all projects
 * - GET /v1/admin/inhouse/ai/requests    - List AI requests with filters
 * - GET /v1/admin/inhouse/ai/errors      - Get recent AI errors
 * - GET /v1/admin/inhouse/projects/:projectId/ai/usage - Get project AI usage
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface AIUsageEntry {
  id: string
  project_id: string
  project_name?: string
  model: string
  operation: 'chat' | 'embed' | 'image'
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  success: boolean
  error_code: string | null
  request_id: string | null
  created_at: string
}

interface AIUsageSummary {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  estimatedCostCents: number
  byModel: Record<string, {
    requests: number
    tokens: number
    errors: number
    costCents: number  // Per-model cost breakdown
  }>
  byOperation: Record<string, {
    requests: number
    tokens: number
  }>
}

interface UsageQuery {
  projectId?: string
  model?: string
  operation?: string
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

const VALID_OPERATIONS = ['chat', 'embed', 'image']

// =============================================================================
// MODEL PRICING (per million tokens, in USD)
// Last updated: January 2025
// Sources: https://openai.com/api/pricing/, https://www.anthropic.com/pricing
// =============================================================================

interface ModelPricing {
  inputPerMillion: number   // USD per million input tokens
  outputPerMillion: number  // USD per million output tokens
}

// Chat/completion models pricing
const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI models
  'gpt-4o': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'gpt-4-turbo': { inputPerMillion: 10.00, outputPerMillion: 30.00 },

  // Anthropic models
  'claude-3-opus': { inputPerMillion: 15.00, outputPerMillion: 75.00 },
  'claude-3-sonnet': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-3-haiku': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  'claude-3-5-sonnet': { inputPerMillion: 3.00, outputPerMillion: 15.00 },

  // Embedding models (output = 0 since embeddings have no output tokens)
  'text-embedding-3-small': { inputPerMillion: 0.02, outputPerMillion: 0 },
  'text-embedding-3-large': { inputPerMillion: 0.13, outputPerMillion: 0 },
}

// Image generation pricing (per image, in USD)
const IMAGE_PRICING: Record<string, number> = {
  'dall-e-3': 0.04,      // 1024x1024 standard
  'dall-e-3-hd': 0.08,   // HD quality
}

// Default pricing for unknown models (conservative estimate)
const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 5.00, outputPerMillion: 15.00 }

/**
 * Calculate cost for a model based on token usage
 * @returns cost in cents
 */
function calculateModelCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  operation: string
): number {
  // Image generation is per-image, not per-token
  if (operation === 'image') {
    const pricePerImage = IMAGE_PRICING[model] || IMAGE_PRICING['dall-e-3'] || 0.04
    // For images, completion_tokens is used to track image count (or default to 1)
    const imageCount = completionTokens || 1
    return Math.round(pricePerImage * imageCount * 100) // convert to cents
  }

  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING

  const inputCostUSD = (promptTokens / 1_000_000) * pricing.inputPerMillion
  const outputCostUSD = (completionTokens / 1_000_000) * pricing.outputPerMillion
  const totalCostUSD = inputCostUSD + outputCostUSD

  return Math.round(totalCostUSD * 100) // convert to cents
}


// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseAIRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // ===========================================================================
  // GET /v1/admin/inhouse/ai/usage - Get AI usage stats across all projects
  // ===========================================================================
  fastify.get<{
    Querystring: { projectId?: string; startDate?: string; endDate?: string; period?: string }
    Reply: { success: boolean; data?: AIUsageSummary; error?: string }
  }>('/v1/admin/inhouse/ai/usage', { preHandler: readMiddleware as never }, async (request, reply) => {
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

      const { summary, byModel, byOperation } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        // Build project filter
        const projectFilter = projectId ? 'AND u.project_id = $3' : ''
        const params = projectId
          ? [effectiveStart, effectiveEnd, projectId]
          : [effectiveStart, effectiveEnd]

        // Get totals
        const totalsResult = await client.query(
          `SELECT
             COUNT(*) as total_requests,
             COUNT(*) FILTER (WHERE success = true) as successful_requests,
             COUNT(*) FILTER (WHERE success = false) as failed_requests,
             COALESCE(SUM(total_tokens), 0) as total_tokens,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
           FROM inhouse_ai_usage u
           WHERE u.created_at >= $1::date
             AND u.created_at < ($2::date + interval '1 day')
             ${projectFilter}`,
          params
        )

        // Get by model (include prompt/completion tokens for accurate cost calculation)
        const byModelResult = await client.query(
          `SELECT
             model,
             operation,
             COUNT(*) as requests,
             COALESCE(SUM(total_tokens), 0) as tokens,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens,
             COUNT(*) FILTER (WHERE success = false) as errors
           FROM inhouse_ai_usage u
           WHERE u.created_at >= $1::date
             AND u.created_at < ($2::date + interval '1 day')
             ${projectFilter}
           GROUP BY model, operation
           ORDER BY requests DESC`,
          params
        )

        // Get by operation
        const byOperationResult = await client.query(
          `SELECT
             operation,
             COUNT(*) as requests,
             COALESCE(SUM(total_tokens), 0) as tokens
           FROM inhouse_ai_usage u
           WHERE u.created_at >= $1::date
             AND u.created_at < ($2::date + interval '1 day')
             ${projectFilter}
           GROUP BY operation
           ORDER BY requests DESC`,
          params
        )

        return {
          summary: totalsResult.rows[0],
          byModel: byModelResult.rows,
          byOperation: byOperationResult.rows,
        }
      })

      const totalTokens = parseInt(summary?.total_tokens || '0', 10)

      // Calculate accurate per-model costs
      let estimatedCostCents = 0
      const modelStats: Record<string, { requests: number; tokens: number; errors: number; costCents: number }> = {}

      for (const row of byModel) {
        const model = row.model
        const promptTokens = parseInt(row.prompt_tokens, 10)
        const completionTokens = parseInt(row.completion_tokens, 10)
        const operation = row.operation
        const costCents = calculateModelCost(model, promptTokens, completionTokens, operation)

        estimatedCostCents += costCents

        // Aggregate by model (since query groups by model + operation)
        if (!modelStats[model]) {
          modelStats[model] = { requests: 0, tokens: 0, errors: 0, costCents: 0 }
        }
        modelStats[model].requests += parseInt(row.requests, 10)
        modelStats[model].tokens += parseInt(row.tokens, 10)
        modelStats[model].errors += parseInt(row.errors, 10)
        modelStats[model].costCents += costCents
      }

      const operationStats: Record<string, { requests: number; tokens: number }> = {}
      for (const row of byOperation) {
        operationStats[row.operation] = {
          requests: parseInt(row.requests, 10),
          tokens: parseInt(row.tokens, 10),
        }
      }

      return reply.send({
        success: true,
        data: {
          totalRequests: parseInt(summary?.total_requests || '0', 10),
          successfulRequests: parseInt(summary?.successful_requests || '0', 10),
          failedRequests: parseInt(summary?.failed_requests || '0', 10),
          totalTokens,
          promptTokens: parseInt(summary?.prompt_tokens || '0', 10),
          completionTokens: parseInt(summary?.completion_tokens || '0', 10),
          estimatedCostCents,
          byModel: modelStats,
          byOperation: operationStats,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get AI usage stats')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get AI usage stats',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/ai/requests - List AI requests with filters
  // ===========================================================================
  fastify.get<{
    Querystring: UsageQuery
    Reply: { success: boolean; data?: { requests: AIUsageEntry[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/ai/requests', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, model, operation, success, startDate, endDate, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      // Validate filters
      const safeOperation = operation && VALID_OPERATIONS.includes(operation) ? operation : null

      // Build query conditions
      const conditions: string[] = []
      const params: unknown[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`u.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (model) {
        conditions.push(`u.model = $${paramIndex}`)
        params.push(model)
        paramIndex++
      }

      if (safeOperation) {
        conditions.push(`u.operation = $${paramIndex}`)
        params.push(safeOperation)
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

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, requestRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_ai_usage u ${whereClause}`,
          params
        )

        const requestsResult = await client.query(
          `SELECT
             u.id,
             u.project_id,
             p.name as project_name,
             u.model,
             u.operation,
             u.prompt_tokens,
             u.completion_tokens,
             u.total_tokens,
             u.success,
             u.error_code,
             u.request_id,
             u.created_at
           FROM inhouse_ai_usage u
           LEFT JOIN projects p ON p.id = u.project_id
           ${whereClause}
           ORDER BY u.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          requestRows: requestsResult.rows,
        }
      })

      const requests: AIUsageEntry[] = requestRows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        model: row.model,
        operation: row.operation,
        prompt_tokens: row.prompt_tokens,
        completion_tokens: row.completion_tokens,
        total_tokens: row.total_tokens,
        success: row.success,
        error_code: row.error_code,
        request_id: row.request_id,
        created_at: row.created_at,
      }))

      return reply.send({
        success: true,
        data: {
          requests,
          total,
          hasMore: offset + requests.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list AI requests')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list AI requests',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/ai/errors - Get recent AI errors
  // ===========================================================================
  fastify.get<{
    Querystring: { projectId?: string; limit?: string }
    Reply: { success: boolean; data?: { errors: AIUsageEntry[]; total: number }; error?: string }
  }>('/v1/admin/inhouse/ai/errors', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, limit: limitStr } = request.query
      const limitRaw = parseInt(limitStr || '50', 10)
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : 50

      const conditions: string[] = ['u.success = false']
      const params: unknown[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`u.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      const { total, errorRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_ai_usage u WHERE ${whereClause}`,
          params
        )

        const errorsResult = await client.query(
          `SELECT
             u.id,
             u.project_id,
             p.name as project_name,
             u.model,
             u.operation,
             u.prompt_tokens,
             u.completion_tokens,
             u.total_tokens,
             u.success,
             u.error_code,
             u.request_id,
             u.created_at
           FROM inhouse_ai_usage u
           LEFT JOIN projects p ON p.id = u.project_id
           WHERE ${whereClause}
           ORDER BY u.created_at DESC
           LIMIT $${paramIndex}`,
          [...params, limit]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          errorRows: errorsResult.rows,
        }
      })

      const errors: AIUsageEntry[] = errorRows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        model: row.model,
        operation: row.operation,
        prompt_tokens: row.prompt_tokens,
        completion_tokens: row.completion_tokens,
        total_tokens: row.total_tokens,
        success: row.success,
        error_code: row.error_code,
        request_id: row.request_id,
        created_at: row.created_at,
      }))

      return reply.send({
        success: true,
        data: {
          errors,
          total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get AI errors')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get AI errors',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/ai/usage - Get project AI usage
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { startDate?: string; endDate?: string }
    Reply: { success: boolean; data?: AIUsageSummary & { projectId: string; projectName: string }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/ai/usage', { preHandler: readMiddleware as never }, async (request, reply) => {
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

      const { summary, byModel, byOperation } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const totalsResult = await client.query(
          `SELECT
             COUNT(*) as total_requests,
             COUNT(*) FILTER (WHERE success = true) as successful_requests,
             COUNT(*) FILTER (WHERE success = false) as failed_requests,
             COALESCE(SUM(total_tokens), 0) as total_tokens,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
           FROM inhouse_ai_usage
           WHERE project_id = $1
             AND created_at >= $2::date
             AND created_at < ($3::date + interval '1 day')`,
          [projectId, effectiveStart, effectiveEnd]
        )

        const byModelResult = await client.query(
          `SELECT
             model,
             operation,
             COUNT(*) as requests,
             COALESCE(SUM(total_tokens), 0) as tokens,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens,
             COUNT(*) FILTER (WHERE success = false) as errors
           FROM inhouse_ai_usage
           WHERE project_id = $1
             AND created_at >= $2::date
             AND created_at < ($3::date + interval '1 day')
           GROUP BY model, operation
           ORDER BY requests DESC`,
          [projectId, effectiveStart, effectiveEnd]
        )

        const byOperationResult = await client.query(
          `SELECT
             operation,
             COUNT(*) as requests,
             COALESCE(SUM(total_tokens), 0) as tokens
           FROM inhouse_ai_usage
           WHERE project_id = $1
             AND created_at >= $2::date
             AND created_at < ($3::date + interval '1 day')
           GROUP BY operation
           ORDER BY requests DESC`,
          [projectId, effectiveStart, effectiveEnd]
        )

        return {
          summary: totalsResult.rows[0],
          byModel: byModelResult.rows,
          byOperation: byOperationResult.rows,
        }
      })

      const totalTokens = parseInt(summary?.total_tokens || '0', 10)

      // Calculate accurate per-model costs
      let estimatedCostCents = 0
      const modelStats: Record<string, { requests: number; tokens: number; errors: number; costCents: number }> = {}

      for (const row of byModel) {
        const model = row.model
        const promptTokens = parseInt(row.prompt_tokens, 10)
        const completionTokens = parseInt(row.completion_tokens, 10)
        const operation = row.operation
        const costCents = calculateModelCost(model, promptTokens, completionTokens, operation)

        estimatedCostCents += costCents

        // Aggregate by model (since query groups by model + operation)
        if (!modelStats[model]) {
          modelStats[model] = { requests: 0, tokens: 0, errors: 0, costCents: 0 }
        }
        modelStats[model].requests += parseInt(row.requests, 10)
        modelStats[model].tokens += parseInt(row.tokens, 10)
        modelStats[model].errors += parseInt(row.errors, 10)
        modelStats[model].costCents += costCents
      }

      const operationStats: Record<string, { requests: number; tokens: number }> = {}
      for (const row of byOperation) {
        operationStats[row.operation] = {
          requests: parseInt(row.requests, 10),
          tokens: parseInt(row.tokens, 10),
        }
      }

      return reply.send({
        success: true,
        data: {
          projectId,
          projectName,
          totalRequests: parseInt(summary?.total_requests || '0', 10),
          successfulRequests: parseInt(summary?.successful_requests || '0', 10),
          failedRequests: parseInt(summary?.failed_requests || '0', 10),
          totalTokens,
          promptTokens: parseInt(summary?.prompt_tokens || '0', 10),
          completionTokens: parseInt(summary?.completion_tokens || '0', 10),
          estimatedCostCents,
          byModel: modelStats,
          byOperation: operationStats,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get project AI usage')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project AI usage',
      })
    }
  })
}
