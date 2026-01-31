/**
 * InhouseFlagsService - Feature flags service for @sheenapps/flags SDK
 *
 * Provides feature flag evaluation, management, and per-user overrides.
 */

import { getPool } from '../database'
import crypto from 'crypto'

// ============================================================================
// Types
// ============================================================================

export interface FlagRule {
  attribute: string
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte'
  value: string | number | boolean | string[]
  percentage: number
}

export interface FeatureFlag {
  id: string
  projectId: string
  key: string
  name: string | null
  description: string | null
  enabled: boolean
  defaultValue: boolean
  rules: FlagRule[]
  createdAt: string
  updatedAt: string
}

export interface FlagSummary {
  id: string
  key: string
  name: string | null
  enabled: boolean
  defaultValue: boolean
  ruleCount: number
}

export interface FlagOverride {
  id: string
  flagId: string
  userId: string
  value: boolean
  expiresAt: string | null
  createdAt: string
}

export interface EvaluationContext {
  userId?: string
  attributes?: Record<string, string | number | boolean>
}

export interface FlagEvaluation {
  key: string
  value: boolean
  matchedRule: number
  reason: 'rule' | 'default' | 'disabled' | 'not_found' | 'override'
}

export interface CreateFlagInput {
  key: string
  name?: string
  description?: string
  enabled?: boolean
  defaultValue?: boolean
  rules?: FlagRule[]
}

export interface UpdateFlagInput {
  name?: string
  description?: string
  enabled?: boolean
  defaultValue?: boolean
  rules?: FlagRule[]
}

export interface CreateOverrideInput {
  userId: string
  value: boolean
  expiresAt?: string | null
}

export interface ListFlagsOptions {
  limit?: number
  offset?: number
  enabled?: boolean
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

// ============================================================================
// Database Row Types
// ============================================================================

interface FlagRow {
  id: string
  project_id: string
  key: string
  name: string | null
  description: string | null
  enabled: boolean
  default_value: boolean
  rules: FlagRule[]
  created_at: Date
  updated_at: Date
}

interface OverrideRow {
  id: string
  flag_id: string
  user_id: string
  value: boolean
  expires_at: Date | null
  created_at: Date
}

// ============================================================================
// Service Cache
// ============================================================================

interface CacheEntry {
  service: InhouseFlagsService
  createdAt: number
}

const serviceCache = new Map<string, CacheEntry>()
const SERVICE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_SIZE = 100
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

function cleanupServiceCache(): void {
  const now = Date.now()
  for (const [projectId, entry] of serviceCache) {
    if (now - entry.createdAt > SERVICE_TTL_MS) {
      serviceCache.delete(projectId)
    }
  }
  // Evict oldest if over max size
  if (serviceCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(serviceCache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)
    const toDelete = entries.slice(0, serviceCache.size - MAX_CACHE_SIZE)
    for (const [key] of toDelete) {
      serviceCache.delete(key)
    }
  }
}

const cleanupTimer = setInterval(cleanupServiceCache, CLEANUP_INTERVAL_MS)
cleanupTimer.unref?.()

// ============================================================================
// Service Class
// ============================================================================

export class InhouseFlagsService {
  private readonly projectId: string

  constructor(projectId: string) {
    this.projectId = projectId
  }

  // --------------------------------------------------------------------------
  // Flag CRUD
  // --------------------------------------------------------------------------

  async create(input: CreateFlagInput): Promise<FeatureFlag> {
    const pool = getPool()

    // Validate and normalize key (must start with letter, lowercase alphanumeric + underscore/hyphen)
    const normalizedKey = input.key?.toLowerCase()
    if (!normalizedKey || !/^[a-z][a-z0-9_-]{0,99}$/.test(normalizedKey)) {
      throw new Error('Flag key must start with a letter, contain only lowercase letters, numbers, underscores, and hyphens, and be 1-100 characters')
    }

    const result = await pool.query<FlagRow>(
      `INSERT INTO inhouse_feature_flags
       (project_id, key, name, description, enabled, default_value, rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        this.projectId,
        normalizedKey,
        input.name ?? null,
        input.description ?? null,
        input.enabled ?? true,
        input.defaultValue ?? false,
        JSON.stringify(input.rules ?? []),
      ]
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create flag')
    }
    return this.rowToFlag(row)
  }

  async get(key: string): Promise<FeatureFlag | null> {
    const pool = getPool()
    const normalizedKey = key.toLowerCase()

    const result = await pool.query<FlagRow>(
      `SELECT * FROM inhouse_feature_flags WHERE project_id = $1 AND key = $2`,
      [this.projectId, normalizedKey]
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return this.rowToFlag(row)
  }

  async getById(id: string): Promise<FeatureFlag | null> {
    const pool = getPool()

    const result = await pool.query<FlagRow>(
      `SELECT * FROM inhouse_feature_flags WHERE project_id = $1 AND id = $2`,
      [this.projectId, id]
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return this.rowToFlag(row)
  }

  async update(key: string, input: UpdateFlagInput): Promise<FeatureFlag | null> {
    const pool = getPool()
    const normalizedKey = key.toLowerCase()

    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 3

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(input.name)
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(input.description)
    }
    if (input.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`)
      values.push(input.enabled)
    }
    if (input.defaultValue !== undefined) {
      updates.push(`default_value = $${paramIndex++}`)
      values.push(input.defaultValue)
    }
    if (input.rules !== undefined) {
      updates.push(`rules = $${paramIndex++}`)
      values.push(JSON.stringify(input.rules))
    }

    if (updates.length === 0) {
      return this.get(normalizedKey)
    }

    const result = await pool.query<FlagRow>(
      `UPDATE inhouse_feature_flags
       SET ${updates.join(', ')}
       WHERE project_id = $1 AND key = $2
       RETURNING *`,
      [this.projectId, normalizedKey, ...values]
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return this.rowToFlag(row)
  }

  async delete(key: string): Promise<boolean> {
    const pool = getPool()
    const normalizedKey = key.toLowerCase()

    const result = await pool.query(
      `DELETE FROM inhouse_feature_flags WHERE project_id = $1 AND key = $2`,
      [this.projectId, normalizedKey]
    )

    return (result.rowCount ?? 0) > 0
  }

  async list(options?: ListFlagsOptions): Promise<PaginatedResult<FlagSummary>> {
    const pool = getPool()
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100)
    const offset = Math.max(options?.offset ?? 0, 0)

    let whereClause = 'WHERE project_id = $1'
    const params: unknown[] = [this.projectId]

    if (options?.enabled !== undefined) {
      params.push(options.enabled)
      whereClause += ` AND enabled = $${params.length}`
    }

    // Get total count
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM inhouse_feature_flags ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10)

    // Get page
    const result = await pool.query<FlagRow>(
      `SELECT * FROM inhouse_feature_flags ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )

    return {
      items: result.rows.map(row => ({
        id: row.id,
        key: row.key,
        name: row.name,
        enabled: row.enabled,
        defaultValue: row.default_value,
        ruleCount: Array.isArray(row.rules) ? row.rules.length : 0,
      })),
      total,
      limit,
      offset,
    }
  }

  // --------------------------------------------------------------------------
  // Evaluation
  // --------------------------------------------------------------------------

  async evaluate(key: string, context?: EvaluationContext): Promise<FlagEvaluation> {
    const flag = await this.get(key)

    if (!flag) {
      return {
        key,
        value: false,
        matchedRule: -1,
        reason: 'not_found',
      }
    }

    if (!flag.enabled) {
      return {
        key,
        value: false,
        matchedRule: -1,
        reason: 'disabled',
      }
    }

    // Check for user override
    if (context?.userId) {
      const override = await this.getOverrideForUser(flag.id, context.userId)
      if (override) {
        return {
          key,
          value: override.value,
          matchedRule: -1,
          reason: 'override',
        }
      }
    }

    // Evaluate rules
    for (let i = 0; i < flag.rules.length; i++) {
      const rule = flag.rules[i]
      if (rule && this.evaluateRule(rule, context)) {
        // Check percentage rollout
        if (this.isInPercentage(rule.percentage, context?.userId, flag.key)) {
          return {
            key,
            value: true,
            matchedRule: i,
            reason: 'rule',
          }
        }
      }
    }

    // Default value
    return {
      key,
      value: flag.defaultValue,
      matchedRule: -1,
      reason: 'default',
    }
  }

  async evaluateAll(context?: EvaluationContext): Promise<{
    flags: Record<string, boolean>
    evaluations: FlagEvaluation[]
  }> {
    const pool = getPool()

    const result = await pool.query<FlagRow>(
      `SELECT * FROM inhouse_feature_flags WHERE project_id = $1`,
      [this.projectId]
    )

    const flags: Record<string, boolean> = {}
    const evaluations: FlagEvaluation[] = []

    for (const row of result.rows) {
      const flag = this.rowToFlag(row)
      const evaluation = await this.evaluateWithFlag(flag, context)
      flags[flag.key] = evaluation.value
      evaluations.push(evaluation)
    }

    return { flags, evaluations }
  }

  private async evaluateWithFlag(flag: FeatureFlag, context?: EvaluationContext): Promise<FlagEvaluation> {
    if (!flag.enabled) {
      return {
        key: flag.key,
        value: false,
        matchedRule: -1,
        reason: 'disabled',
      }
    }

    // Check for user override
    if (context?.userId) {
      const override = await this.getOverrideForUser(flag.id, context.userId)
      if (override) {
        return {
          key: flag.key,
          value: override.value,
          matchedRule: -1,
          reason: 'override',
        }
      }
    }

    // Evaluate rules
    for (let i = 0; i < flag.rules.length; i++) {
      const rule = flag.rules[i]
      if (rule && this.evaluateRule(rule, context)) {
        if (this.isInPercentage(rule.percentage, context?.userId, flag.key)) {
          return {
            key: flag.key,
            value: true,
            matchedRule: i,
            reason: 'rule',
          }
        }
      }
    }

    return {
      key: flag.key,
      value: flag.defaultValue,
      matchedRule: -1,
      reason: 'default',
    }
  }

  private evaluateRule(rule: FlagRule, context?: EvaluationContext): boolean {
    const attributeValue = context?.attributes?.[rule.attribute]

    // If no context or attribute, rule doesn't match
    if (attributeValue === undefined) {
      return false
    }

    const ruleValue = rule.value

    switch (rule.operator) {
      case 'equals':
        return attributeValue === ruleValue

      case 'not_equals':
        return attributeValue !== ruleValue

      case 'contains':
        return String(attributeValue).includes(String(ruleValue))

      case 'not_contains':
        return !String(attributeValue).includes(String(ruleValue))

      case 'in':
        if (Array.isArray(ruleValue)) {
          return ruleValue.includes(attributeValue as never)
        }
        return false

      case 'not_in':
        if (Array.isArray(ruleValue)) {
          return !ruleValue.includes(attributeValue as never)
        }
        return true

      case 'gt':
        return Number(attributeValue) > Number(ruleValue)

      case 'gte':
        return Number(attributeValue) >= Number(ruleValue)

      case 'lt':
        return Number(attributeValue) < Number(ruleValue)

      case 'lte':
        return Number(attributeValue) <= Number(ruleValue)

      default:
        return false
    }
  }

  private isInPercentage(percentage: number, userId?: string, flagKey?: string): boolean {
    if (percentage >= 100) return true
    if (percentage <= 0) return false

    // Use deterministic hash for consistent rollout
    const seed = userId ? `${userId}:${flagKey ?? ''}` : crypto.randomUUID()
    const hash = crypto.createHash('md5').update(seed).digest('hex')
    const hashNum = parseInt(hash.substring(0, 8), 16)
    const normalizedHash = hashNum / 0xffffffff

    return normalizedHash * 100 < percentage
  }

  // --------------------------------------------------------------------------
  // Overrides
  // --------------------------------------------------------------------------

  async createOverride(flagKey: string, input: CreateOverrideInput): Promise<FlagOverride> {
    const pool = getPool()

    // Get flag ID
    const flag = await this.get(flagKey)
    if (!flag) {
      throw new Error(`Flag not found: ${flagKey}`)
    }

    const result = await pool.query<OverrideRow>(
      `INSERT INTO inhouse_flag_overrides
       (project_id, flag_id, user_id, value, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, flag_id, user_id)
       DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
       RETURNING *`,
      [
        this.projectId,
        flag.id,
        input.userId,
        input.value,
        input.expiresAt ?? null,
      ]
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create override')
    }
    return this.rowToOverride(row)
  }

  async listOverrides(flagKey: string): Promise<FlagOverride[]> {
    const pool = getPool()

    const flag = await this.get(flagKey)
    if (!flag) {
      throw new Error(`Flag not found: ${flagKey}`)
    }

    const result = await pool.query<OverrideRow>(
      `SELECT * FROM inhouse_flag_overrides
       WHERE project_id = $1 AND flag_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [this.projectId, flag.id]
    )

    return result.rows.map(row => this.rowToOverride(row))
  }

  async deleteOverride(flagKey: string, userId: string): Promise<boolean> {
    const pool = getPool()

    const flag = await this.get(flagKey)
    if (!flag) {
      throw new Error(`Flag not found: ${flagKey}`)
    }

    const result = await pool.query(
      `DELETE FROM inhouse_flag_overrides
       WHERE project_id = $1 AND flag_id = $2 AND user_id = $3`,
      [this.projectId, flag.id, userId]
    )

    return (result.rowCount ?? 0) > 0
  }

  private async getOverrideForUser(flagId: string, userId: string): Promise<FlagOverride | null> {
    const pool = getPool()

    const result = await pool.query<OverrideRow>(
      `SELECT * FROM inhouse_flag_overrides
       WHERE project_id = $1 AND flag_id = $2 AND user_id = $3
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [this.projectId, flagId, userId]
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return this.rowToOverride(row)
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private rowToFlag(row: FlagRow): FeatureFlag {
    return {
      id: row.id,
      projectId: row.project_id,
      key: row.key,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      defaultValue: row.default_value,
      rules: row.rules ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  }

  private rowToOverride(row: OverrideRow): FlagOverride {
    return {
      id: row.id,
      flagId: row.flag_id,
      userId: row.user_id,
      value: row.value,
      expiresAt: row.expires_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function getInhouseFlagsService(projectId: string): InhouseFlagsService {
  const cached = serviceCache.get(projectId)
  const now = Date.now()

  if (cached && now - cached.createdAt < SERVICE_TTL_MS) {
    return cached.service
  }

  const service = new InhouseFlagsService(projectId)
  serviceCache.set(projectId, { service, createdAt: now })
  return service
}
