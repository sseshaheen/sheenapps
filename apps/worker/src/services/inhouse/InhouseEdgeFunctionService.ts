/**
 * InhouseEdgeFunctionService
 *
 * Manages edge function deployments to Cloudflare Workers for Platforms.
 * Handles versioning, rollback, and log retrieval.
 */

import { createHash, randomUUID } from 'crypto'
import { getDatabase } from '../database'
import { getInhouseSecretsService } from './InhouseSecretsService'

// =============================================================================
// TYPES
// =============================================================================

export type FunctionStatus = 'deploying' | 'active' | 'error' | 'deleted'

export interface EdgeFunction {
  id: string
  projectId: string
  name: string
  routes: string[]
  schedule: string | null
  status: FunctionStatus
  activeVersion: number | null
  envVars: Record<string, string>
  cfScriptName: string
  createdAt: string
  updatedAt: string
}

export interface FunctionVersion {
  id: string
  functionId: string
  version: number
  codeHash: string
  codeSnapshot: string
  envVarsSnapshot: Record<string, string>
  cfScriptVersion: string | null
  isActive: boolean
  deployedAt: string
  deployedBy: string | null
}

export interface FunctionLog {
  id: string
  functionId: string
  version: number
  requestId: string
  status: number
  durationMs: number
  cpuTimeMs: number
  logs: LogEntry[]
  error: string | null
  createdAt: string
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

export interface DeployInput {
  projectId: string
  name: string
  code: string
  routes?: string[]
  schedule?: string | null
  env?: Record<string, string>
  deployedBy?: string
}

export interface UpdateInput {
  code?: string
  routes?: string[]
  schedule?: string | null
  env?: Record<string, string>
  deployedBy?: string
}

export interface DeployResult {
  function: EdgeFunction
  version: FunctionVersion
}

export interface UpdateResult {
  function: EdgeFunction
  version: FunctionVersion | null
}

export interface RollbackResult {
  function: EdgeFunction
  version: FunctionVersion
  previousVersion: number
}

export interface InvokeInput {
  method?: string
  path?: string
  headers?: Record<string, string>
  body?: unknown
}

export interface InvokeResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: unknown
  durationMs: number
  logs: LogEntry[]
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

// Resource limits
const MAX_CODE_SIZE = 1024 * 1024 // 1 MB
const MAX_ENV_VARS = 50
const MAX_ENV_VAR_VALUE_SIZE = 5120 // 5 KB
const MAX_ROUTES = 20

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseEdgeFunctionService {
  private cfAccountId: string
  private cfApiToken: string
  private cfDispatchNamespace: string

  constructor() {
    this.cfAccountId = process.env.CF_ACCOUNT_ID || ''
    this.cfApiToken = process.env.CF_API_TOKEN_WORKERS || ''
    this.cfDispatchNamespace = process.env.CF_DISPATCH_NAMESPACE || 'sheenapps-user-projects'

    if (!this.cfAccountId || !this.cfApiToken) {
      console.warn('[InhouseEdgeFunctionService] Missing CF_ACCOUNT_ID or CF_API_TOKEN_WORKERS')
    }
  }

  // ===========================================================================
  // CLOUDFLARE API
  // ===========================================================================

  private async cfRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    contentType?: string
  ): Promise<{ success: boolean; result?: T; errors?: Array<{ code: number; message: string }> }> {
    const url = `${CF_API_BASE}${path}`

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.cfApiToken}`,
    }

    if (contentType) {
      headers['Content-Type'] = contentType
    } else if (body && typeof body === 'object') {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    })

    const data = await response.json() as { success: boolean; result?: T; errors?: Array<{ code: number; message: string }> }
    return data
  }

  /**
   * Upload a script to Workers for Platforms dispatch namespace
   */
  private async uploadToDispatchNamespace(
    scriptName: string,
    code: string,
    envVars: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    // Create multipart form data for script upload
    const formData = new FormData()

    // Add the worker script
    formData.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js')

    // Create metadata with bindings for environment variables
    const bindings: Array<{ type: string; name: string; text?: string }> = Object.entries(envVars).map(([name, text]) => ({
      type: 'plain_text',
      name,
      text
    }))

    const metadata = {
      main_module: 'worker.js',
      bindings
    }

    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json')

    // Upload to dispatch namespace
    const url = `${CF_API_BASE}/accounts/${this.cfAccountId}/workers/dispatch/namespaces/${this.cfDispatchNamespace}/scripts/${scriptName}`

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.cfApiToken}`
      },
      body: formData
    })

    const data = await response.json() as { success: boolean; errors?: Array<{ message: string }> }

    if (!data.success) {
      return {
        success: false,
        error: data.errors?.map(e => e.message).join(', ') || 'Unknown deployment error'
      }
    }

    return { success: true }
  }

  /**
   * Delete a script from Workers for Platforms dispatch namespace
   */
  private async deleteFromDispatchNamespace(scriptName: string): Promise<boolean> {
    const result = await this.cfRequest(
      'DELETE',
      `/accounts/${this.cfAccountId}/workers/dispatch/namespaces/${this.cfDispatchNamespace}/scripts/${scriptName}`
    )
    return result.success
  }

  // ===========================================================================
  // SECRET RESOLUTION
  // ===========================================================================

  /**
   * Resolve environment variables, replacing 'secret-ref:key' with actual secret values
   */
  private async resolveEnvVars(
    projectId: string,
    envVars: Record<string, string>
  ): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {}
    const secretsService = getInhouseSecretsService(projectId)

    for (const [key, value] of Object.entries(envVars)) {
      if (value.startsWith('secret-ref:')) {
        const secretKey = value.slice('secret-ref:'.length)
        const decryptedValue = await secretsService.decryptSecret(secretKey)

        if (decryptedValue === null) {
          throw new Error(`Failed to resolve secret '${secretKey}': not found`)
        }

        resolved[key] = decryptedValue
      } else {
        resolved[key] = value
      }
    }

    return resolved
  }

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  private validateName(name: string): string | null {
    if (!name || !/^[a-z][a-z0-9-]{0,62}$/.test(name)) {
      return 'Function name must be lowercase alphanumeric with hyphens, 1-63 characters, starting with a letter'
    }
    return null
  }

  private validateCode(code: string): string | null {
    if (!code || code.trim().length === 0) {
      return 'Code is required'
    }

    const codeBytes = Buffer.byteLength(code, 'utf8')
    if (codeBytes > MAX_CODE_SIZE) {
      return `Code size (${Math.round(codeBytes / 1024)}KB) exceeds maximum (${MAX_CODE_SIZE / 1024}KB)`
    }

    return null
  }

  private validateEnvVars(envVars: Record<string, string>): string | null {
    const keys = Object.keys(envVars)

    if (keys.length > MAX_ENV_VARS) {
      return `Too many environment variables (${keys.length}). Maximum is ${MAX_ENV_VARS}`
    }

    for (const [key, value] of Object.entries(envVars)) {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        return `Invalid environment variable name: ${key}. Must be uppercase with underscores.`
      }

      const valueBytes = Buffer.byteLength(value, 'utf8')
      if (valueBytes > MAX_ENV_VAR_VALUE_SIZE) {
        return `Environment variable '${key}' value is too large (${valueBytes} bytes). Maximum is ${MAX_ENV_VAR_VALUE_SIZE} bytes.`
      }
    }

    return null
  }

  private validateRoutes(routes: string[]): string | null {
    if (routes.length > MAX_ROUTES) {
      return `Too many routes (${routes.length}). Maximum is ${MAX_ROUTES}`
    }

    for (const route of routes) {
      if (!route.startsWith('/')) {
        return `Invalid route: ${route}. Routes must start with /`
      }
    }

    return null
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Deploy a new edge function or update an existing one
   */
  async deploy(input: DeployInput): Promise<{ result?: DeployResult; error?: string }> {
    const db = getDatabase()

    // Validate inputs
    const nameError = this.validateName(input.name)
    if (nameError) return { error: nameError }

    const codeError = this.validateCode(input.code)
    if (codeError) return { error: codeError }

    const envVars = input.env || {}
    const envError = this.validateEnvVars(envVars)
    if (envError) return { error: envError }

    const routes = input.routes || []
    const routesError = this.validateRoutes(routes)
    if (routesError) return { error: routesError }

    // Generate script name for Cloudflare
    const cfScriptName = `${input.projectId.slice(0, 8)}-${input.name}`

    // Compute code hash for versioning
    const codeHash = createHash('sha256').update(input.code).digest('hex')

    // Check if function already exists
    const existingResult = await db.query(
      `SELECT id, active_version FROM inhouse_edge_functions WHERE project_id = $1 AND name = $2`,
      [input.projectId, input.name]
    )

    let functionId: string
    let version: number

    if (existingResult.rows.length > 0) {
      // Update existing function
      functionId = existingResult.rows[0].id
      version = (existingResult.rows[0].active_version || 0) + 1

      // Check if code has changed
      const lastVersionResult = await db.query(
        `SELECT code_hash FROM inhouse_edge_function_versions WHERE function_id = $1 ORDER BY version DESC LIMIT 1`,
        [functionId]
      )

      if (lastVersionResult.rows[0]?.code_hash === codeHash) {
        // Code unchanged, just update metadata
        await db.query(
          `UPDATE inhouse_edge_functions SET routes = $1, schedule = $2, env_vars = $3, updated_at = NOW() WHERE id = $4`,
          [JSON.stringify(routes), input.schedule || null, JSON.stringify(envVars), functionId]
        )

        const fn = await this.get(input.projectId, input.name)
        const currentVersion = await this.getVersion(functionId, existingResult.rows[0].active_version)

        return {
          result: {
            function: fn!,
            version: currentVersion!
          }
        }
      }
    } else {
      // Create new function
      functionId = randomUUID()
      version = 1
    }

    // Resolve secret references in env vars
    let resolvedEnvVars: Record<string, string>
    try {
      resolvedEnvVars = await this.resolveEnvVars(input.projectId, envVars)
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to resolve secrets' }
    }

    // Deploy to Cloudflare
    const deployResult = await this.uploadToDispatchNamespace(cfScriptName, input.code, resolvedEnvVars)

    if (!deployResult.success) {
      // Record failed deployment
      if (existingResult.rows.length === 0) {
        await db.query(
          `INSERT INTO inhouse_edge_functions (id, project_id, name, routes, schedule, cf_script_name, env_vars, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'error')`,
          [functionId, input.projectId, input.name, JSON.stringify(routes), input.schedule || null, cfScriptName, JSON.stringify(envVars)]
        )
      } else {
        await db.query(
          `UPDATE inhouse_edge_functions SET status = 'error', updated_at = NOW() WHERE id = $1`,
          [functionId]
        )
      }

      return { error: `Deployment failed: ${deployResult.error}` }
    }

    // Create or update function record
    if (existingResult.rows.length === 0) {
      await db.query(
        `INSERT INTO inhouse_edge_functions (id, project_id, name, routes, schedule, cf_script_name, env_vars, status, active_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)`,
        [functionId, input.projectId, input.name, JSON.stringify(routes), input.schedule || null, cfScriptName, JSON.stringify(envVars), version]
      )
    } else {
      await db.query(
        `UPDATE inhouse_edge_functions SET routes = $1, schedule = $2, env_vars = $3, status = 'active', active_version = $4, updated_at = NOW() WHERE id = $5`,
        [JSON.stringify(routes), input.schedule || null, JSON.stringify(envVars), version, functionId]
      )

      // Deactivate previous version
      await db.query(
        `UPDATE inhouse_edge_function_versions SET is_active = false WHERE function_id = $1`,
        [functionId]
      )
    }

    // Create version record
    const versionId = randomUUID()
    await db.query(
      `INSERT INTO inhouse_edge_function_versions (id, function_id, version, code_hash, code_snapshot, env_vars_snapshot, is_active, deployed_by)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
      [versionId, functionId, version, codeHash, input.code, JSON.stringify(envVars), input.deployedBy || null]
    )

    const fn = await this.get(input.projectId, input.name)
    const ver = await this.getVersion(functionId, version)

    return {
      result: {
        function: fn!,
        version: ver!
      }
    }
  }

  /**
   * Update an existing edge function
   */
  async update(projectId: string, name: string, input: UpdateInput): Promise<{ result?: UpdateResult; error?: string }> {
    const fn = await this.get(projectId, name)
    if (!fn) {
      return { error: 'Function not found' }
    }

    // If code is provided, deploy new version
    if (input.code) {
      const deployResult = await this.deploy({
        projectId,
        name,
        code: input.code,
        routes: input.routes || fn.routes,
        schedule: input.schedule !== undefined ? input.schedule : fn.schedule,
        env: input.env || fn.envVars,
        deployedBy: input.deployedBy
      })

      if (deployResult.error) {
        return { error: deployResult.error }
      }

      return {
        result: {
          function: deployResult.result!.function,
          version: deployResult.result!.version
        }
      }
    }

    // Just update metadata
    const db = getDatabase()
    const routes = input.routes || fn.routes
    const schedule = input.schedule !== undefined ? input.schedule : fn.schedule
    const envVars = input.env || fn.envVars

    await db.query(
      `UPDATE inhouse_edge_functions SET routes = $1, schedule = $2, env_vars = $3, updated_at = NOW() WHERE id = $4`,
      [JSON.stringify(routes), schedule, JSON.stringify(envVars), fn.id]
    )

    const updated = await this.get(projectId, name)
    return {
      result: {
        function: updated!,
        version: null
      }
    }
  }

  /**
   * Get a specific edge function
   */
  async get(projectId: string, name: string): Promise<EdgeFunction | null> {
    const db = getDatabase()
    const result = await db.query(
      `SELECT * FROM inhouse_edge_functions WHERE project_id = $1 AND name = $2`,
      [projectId, name]
    )

    if (result.rows.length === 0) return null

    return this.mapFunction(result.rows[0])
  }

  /**
   * List all edge functions for a project
   */
  async list(
    projectId: string,
    options?: { status?: FunctionStatus | FunctionStatus[]; limit?: number; offset?: number }
  ): Promise<{ functions: EdgeFunction[]; total: number; hasMore: boolean }> {
    const db = getDatabase()
    const limit = Math.min(options?.limit || 50, 100)
    const offset = options?.offset || 0

    let whereClause = 'WHERE project_id = $1'
    const params: (string | number)[] = [projectId]
    let paramIndex = 2

    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status]
      whereClause += ` AND status = ANY($${paramIndex}::text[])`
      params.push(statuses as any)
      paramIndex++
    }

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM inhouse_edge_functions ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0]?.total || '0', 10)

    const result = await db.query(
      `SELECT * FROM inhouse_edge_functions ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    return {
      functions: result.rows.map(row => this.mapFunction(row)),
      total,
      hasMore: offset + result.rows.length < total
    }
  }

  /**
   * Delete an edge function
   */
  async delete(projectId: string, name: string): Promise<{ deleted: boolean; error?: string }> {
    const fn = await this.get(projectId, name)
    if (!fn) {
      return { deleted: false, error: 'Function not found' }
    }

    // Delete from Cloudflare
    await this.deleteFromDispatchNamespace(fn.cfScriptName)

    // Soft delete in database
    const db = getDatabase()
    await db.query(
      `UPDATE inhouse_edge_functions SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
      [fn.id]
    )

    return { deleted: true }
  }

  /**
   * List versions of a function
   */
  async listVersions(
    projectId: string,
    name: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ versions: FunctionVersion[]; total: number; hasMore: boolean } | null> {
    const fn = await this.get(projectId, name)
    if (!fn) return null

    const db = getDatabase()
    const limit = Math.min(options?.limit || 50, 100)
    const offset = options?.offset || 0

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM inhouse_edge_function_versions WHERE function_id = $1`,
      [fn.id]
    )
    const total = parseInt(countResult.rows[0]?.total || '0', 10)

    const result = await db.query(
      `SELECT * FROM inhouse_edge_function_versions WHERE function_id = $1 ORDER BY version DESC LIMIT $2 OFFSET $3`,
      [fn.id, limit, offset]
    )

    return {
      versions: result.rows.map(row => this.mapVersion(row)),
      total,
      hasMore: offset + result.rows.length < total
    }
  }

  /**
   * Rollback to a previous version
   */
  async rollback(
    projectId: string,
    name: string,
    targetVersion: number,
    deployedBy?: string
  ): Promise<{ result?: RollbackResult; error?: string }> {
    const fn = await this.get(projectId, name)
    if (!fn) {
      return { error: 'Function not found' }
    }

    const previousVersion = fn.activeVersion || 0

    // Get target version
    const version = await this.getVersion(fn.id, targetVersion)
    if (!version) {
      return { error: `Version ${targetVersion} not found` }
    }

    // Redeploy the old code
    let resolvedEnvVars: Record<string, string>
    try {
      resolvedEnvVars = await this.resolveEnvVars(projectId, version.envVarsSnapshot)
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to resolve secrets' }
    }

    const deployResult = await this.uploadToDispatchNamespace(fn.cfScriptName, version.codeSnapshot, resolvedEnvVars)

    if (!deployResult.success) {
      return { error: `Rollback failed: ${deployResult.error}` }
    }

    // Update database
    const db = getDatabase()

    // Deactivate all versions
    await db.query(
      `UPDATE inhouse_edge_function_versions SET is_active = false WHERE function_id = $1`,
      [fn.id]
    )

    // Create new version record with the old code (for audit trail)
    const newVersion = previousVersion + 1
    const newVersionId = randomUUID()
    await db.query(
      `INSERT INTO inhouse_edge_function_versions (id, function_id, version, code_hash, code_snapshot, env_vars_snapshot, is_active, deployed_by)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
      [newVersionId, fn.id, newVersion, version.codeHash, version.codeSnapshot, JSON.stringify(version.envVarsSnapshot), deployedBy || null]
    )

    // Update function record
    await db.query(
      `UPDATE inhouse_edge_functions SET active_version = $1, env_vars = $2, status = 'active', updated_at = NOW() WHERE id = $3`,
      [newVersion, JSON.stringify(version.envVarsSnapshot), fn.id]
    )

    const updatedFn = await this.get(projectId, name)
    const newVer = await this.getVersion(fn.id, newVersion)

    return {
      result: {
        function: updatedFn!,
        version: newVer!,
        previousVersion
      }
    }
  }

  /**
   * Get logs for a function
   */
  async getLogs(
    projectId: string,
    name: string,
    options?: { version?: number; limit?: number; offset?: number; orderDir?: 'asc' | 'desc' }
  ): Promise<{ logs: FunctionLog[]; total: number; hasMore: boolean } | null> {
    const fn = await this.get(projectId, name)
    if (!fn) return null

    const db = getDatabase()
    const limit = Math.min(options?.limit || 50, 100)
    const offset = options?.offset || 0
    const orderDir = options?.orderDir || 'desc'

    let whereClause = 'WHERE function_id = $1'
    const params: (string | number)[] = [fn.id]
    let paramIndex = 2

    if (options?.version) {
      whereClause += ` AND version = $${paramIndex}`
      params.push(options.version)
      paramIndex++
    }

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM inhouse_edge_function_logs ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0]?.total || '0', 10)

    const result = await db.query(
      `SELECT * FROM inhouse_edge_function_logs ${whereClause} ORDER BY created_at ${orderDir === 'asc' ? 'ASC' : 'DESC'} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    return {
      logs: result.rows.map(row => this.mapLog(row)),
      total,
      hasMore: offset + result.rows.length < total
    }
  }

  /**
   * Invoke a function for testing
   */
  async invoke(
    projectId: string,
    name: string,
    input: InvokeInput
  ): Promise<{ result?: InvokeResult; error?: string }> {
    const fn = await this.get(projectId, name)
    if (!fn) {
      return { error: 'Function not found' }
    }

    if (fn.status !== 'active') {
      return { error: `Function is not active (status: ${fn.status})` }
    }

    // Invoke via Cloudflare Workers for Platforms
    // The function is accessible via the dispatch namespace
    const startTime = Date.now()

    try {
      // Build the request URL for the dispatch worker
      // In production, this would go through the dispatch worker routing
      const dispatchUrl = `https://${this.cfDispatchNamespace}.workers.dev${input.path || '/'}`

      const response = await fetch(dispatchUrl, {
        method: input.method || 'GET',
        headers: {
          ...input.headers,
          'X-SheenApps-Script': fn.cfScriptName,
          'X-SheenApps-Project': projectId
        },
        body: input.body ? JSON.stringify(input.body) : undefined
      })

      const durationMs = Date.now() - startTime

      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      let body: unknown
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        body = await response.json()
      } else {
        body = await response.text()
      }

      return {
        result: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body,
          durationMs,
          logs: [] // Logs would be retrieved separately via Cloudflare API
        }
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Invocation failed'
      }
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private async getVersion(functionId: string, version: number): Promise<FunctionVersion | null> {
    const db = getDatabase()
    const result = await db.query(
      `SELECT * FROM inhouse_edge_function_versions WHERE function_id = $1 AND version = $2`,
      [functionId, version]
    )
    if (result.rows.length === 0) return null
    return this.mapVersion(result.rows[0])
  }

  private mapFunction(row: any): EdgeFunction {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      routes: row.routes || [],
      schedule: row.schedule,
      status: row.status,
      activeVersion: row.active_version,
      envVars: row.env_vars || {},
      cfScriptName: row.cf_script_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapVersion(row: any): FunctionVersion {
    return {
      id: row.id,
      functionId: row.function_id,
      version: row.version,
      codeHash: row.code_hash,
      codeSnapshot: row.code_snapshot,
      envVarsSnapshot: row.env_vars_snapshot || {},
      cfScriptVersion: row.cf_script_version,
      isActive: row.is_active,
      deployedAt: row.deployed_at,
      deployedBy: row.deployed_by
    }
  }

  private mapLog(row: any): FunctionLog {
    return {
      id: row.id,
      functionId: row.function_id,
      version: row.version,
      requestId: row.request_id,
      status: row.status,
      durationMs: row.duration_ms,
      cpuTimeMs: row.cpu_time_ms,
      logs: row.logs || [],
      error: row.error,
      createdAt: row.created_at
    }
  }
}
