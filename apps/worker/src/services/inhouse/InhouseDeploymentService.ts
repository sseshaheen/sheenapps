/**
 * In-House Deployment Service
 *
 * Handles deployment of Easy Mode projects to:
 * 1. Cloudflare R2 (static assets)
 * 2. Cloudflare Workers for Platforms (SSR/server code)
 * 3. KV stores (hostname and build mapping)
 *
 * This replaces the Vercel deployment flow for Easy Mode projects.
 */

import { getDatabase } from '../database'
import { updateHostnameMapping } from '../dispatchKvService'
import { getBusinessEventsService } from '../businessEventsService'

// =============================================================================
// TYPES
// =============================================================================

export interface DeploymentConfig {
  projectId: string
  buildId: string
  staticAssets: BuildAsset[]
  serverBundle?: ServerBundle
  environment?: Record<string, string>
}

export interface BuildAsset {
  path: string
  content: Buffer | string
  contentType: string
  hash?: string
}

export interface ServerBundle {
  code: string
  sourceMap?: string
  entryPoint: string
}

export interface DeploymentResult {
  success: boolean
  deploymentId: string
  buildId: string
  url: string
  staticAssetsUploaded: number
  workerDeployed: boolean
  duration: number
  error?: string
}

export interface DeploymentHistoryItem {
  id: string
  buildId: string
  status: 'uploading' | 'deploying' | 'deployed' | 'failed'
  deployedAt: string | null
  errorMessage: string | null
  isCurrentlyActive: boolean
  metadata: {
    assetCount: number
    totalSizeBytes: number
    durationMs: number
  }
  createdAt: string
}

export interface DeploymentEvent {
  id: number
  deploymentId: string
  ts: string
  level: 'info' | 'warn' | 'error'
  step: string
  message: string
  meta?: Record<string, unknown>
}

export type DeploymentStep =
  | 'upload_assets'
  | 'deploy_worker'
  | 'update_kv'
  | 'activate'
  | 'done'
  | 'error'

interface CloudflareConfig {
  accountId: string
  apiToken: string
  kvNamespaceHostname: string
  kvNamespaceBuilds: string
  r2BucketName: string
  dispatchNamespace: string
}

// =============================================================================
// CLOUDFLARE API HELPERS
// =============================================================================

/**
 * Base URL for Cloudflare API
 */
const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

/**
 * Make authenticated request to Cloudflare API
 */
async function cfFetch(
  config: CloudflareConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${CF_API_BASE}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  return response
}

// =============================================================================
// PATH HELPERS
// =============================================================================

/**
 * Normalize and validate an asset path for safe R2 key construction
 * Prevents path traversal, empty paths, and overly long paths
 */
function normalizeAssetPath(p: string): string {
  const s = (p || '').trim()
  if (!s) throw new Error('Asset path is empty')
  if (s.includes('..')) throw new Error(`Unsafe asset path: ${p}`)
  const withSlash = s.startsWith('/') ? s : `/${s}`
  if (withSlash.length > 512) throw new Error('Asset path too long')
  return withSlash
}

// =============================================================================
// R2 OPERATIONS
// =============================================================================

/**
 * Upload static assets to R2 using Cloudflare's direct REST API
 *
 * Note: We use the Cloudflare REST API (not S3-compatible API) because:
 * - S3-compatible API requires SigV4 signing with S3 credentials
 * - REST API supports Bearer token auth with the same CF API token
 */
async function uploadStaticAssets(
  config: CloudflareConfig,
  projectId: string,
  buildId: string,
  assets: BuildAsset[]
): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  const results = { uploaded: 0, failed: 0, errors: [] as string[] }

  // Batch uploads with concurrency limit to avoid overwhelming the API
  const CONCURRENCY_LIMIT = 10
  const batches: BuildAsset[][] = []
  for (let i = 0; i < assets.length; i += CONCURRENCY_LIMIT) {
    batches.push(assets.slice(i, i + CONCURRENCY_LIMIT))
  }

  for (const batch of batches) {
    const uploadPromises = batch.map(async (asset) => {
      // Normalize and validate asset path to prevent path traversal and weird keys
      let safePath: string
      try {
        safePath = normalizeAssetPath(asset.path)
      } catch (pathError) {
        results.failed++
        results.errors.push(`Invalid path for asset: ${(pathError as Error).message}`)
        return
      }
      const key = `builds/${projectId}/${buildId}${safePath}`

      try {
        // Use Cloudflare REST API for R2 object uploads
        // API: PUT /accounts/{account_id}/r2/buckets/{bucket_name}/objects/{object_key}
        // SECURITY: URL-encode path parameters to prevent path injection
        // NOTE: Encode each path segment individually, keep slashes - some APIs choke on %2F
        const encodedBucket = encodeURIComponent(config.r2BucketName)
        const encodedKey = key.split('/').map(encodeURIComponent).join('/')
        const response = await fetch(
          `${CF_API_BASE}/accounts/${config.accountId}/r2/buckets/${encodedBucket}/objects/${encodedKey}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${config.apiToken}`,
              'Content-Type': asset.contentType,
            },
            body: typeof asset.content === 'string' ? asset.content : new Uint8Array(asset.content),
          }
        )

        if (response.ok) {
          results.uploaded++
        } else {
          const errorBody = await response.text().catch(() => 'Unknown error')
          results.failed++
          results.errors.push(`Failed to upload ${asset.path}: ${response.status} - ${errorBody}`)
        }
      } catch (error) {
        results.failed++
        results.errors.push(`Error uploading ${asset.path}: ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    })

    await Promise.all(uploadPromises)
  }

  return results
}

// =============================================================================
// WORKERS FOR PLATFORMS OPERATIONS
// =============================================================================

/**
 * Deploy a Worker script to the dispatch namespace
 *
 * IMPORTANT: BUILD_ID is NOT baked into Worker bindings. Instead, Workers read
 * the current buildId from KV (PROJECT_BUILDS namespace) on each request.
 * This enables instant rollback via KV update without redeploying the Worker.
 */
// Reserved binding names that users cannot override
const RESERVED_BINDING_NAMES = new Set(['PROJECT_ID', 'PROJECT_BUILDS', 'BUILD_ID'])

// Env var name validation: must be uppercase with underscores, reasonable length
const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/

// Environment variable size limits (DoS protection)
const MAX_ENV_VAR_COUNT = 50
const MAX_ENV_VAR_VALUE_BYTES = 5 * 1024 // 5KB per value
const MAX_ENV_VAR_TOTAL_BYTES = 128 * 1024 // 128KB total

async function deployWorkerScript(
  config: CloudflareConfig,
  projectId: string,
  _buildId: string, // Not used in bindings - Worker reads from KV
  bundle: ServerBundle,
  environment: Record<string, string> = {}
): Promise<{ success: boolean; error?: string }> {
  const scriptName = projectId // Worker name = project ID

  // Validate environment variable names (prevent binding collisions)
  const envEntries = Object.entries(environment)

  // Check count limit
  if (envEntries.length > MAX_ENV_VAR_COUNT) {
    return { success: false, error: `Too many environment variables (${envEntries.length} > ${MAX_ENV_VAR_COUNT})` }
  }

  let totalEnvBytes = 0
  for (const [name, value] of envEntries) {
    if (RESERVED_BINDING_NAMES.has(name)) {
      return { success: false, error: `Reserved environment variable name: ${name}` }
    }
    if (!ENV_VAR_NAME_REGEX.test(name)) {
      return { success: false, error: `Invalid environment variable name: ${name} (must match ${ENV_VAR_NAME_REGEX})` }
    }

    // Check individual value size
    const valueBytes = Buffer.byteLength(value, 'utf8')
    if (valueBytes > MAX_ENV_VAR_VALUE_BYTES) {
      return { success: false, error: `Environment variable '${name}' exceeds maximum size (${valueBytes} > ${MAX_ENV_VAR_VALUE_BYTES} bytes)` }
    }

    totalEnvBytes += Buffer.byteLength(name, 'utf8') + valueBytes
  }

  // Check total size
  if (totalEnvBytes > MAX_ENV_VAR_TOTAL_BYTES) {
    return { success: false, error: `Total environment variables size exceeds maximum (${totalEnvBytes} > ${MAX_ENV_VAR_TOTAL_BYTES} bytes)` }
  }

  // Build the Worker script with bindings
  const formData = new FormData()

  // Add the main script
  formData.append(
    'script',
    new Blob([bundle.code], { type: 'application/javascript' }),
    bundle.entryPoint
  )

  // Add metadata with bindings
  // NOTE: BUILD_ID is intentionally NOT bound here. Workers must read current
  // buildId from PROJECT_BUILDS KV namespace to support instant rollback.
  const metadata = {
    main_module: bundle.entryPoint,
    bindings: [
      // Project context - static, doesn't change on rollback
      { type: 'plain_text', name: 'PROJECT_ID', text: projectId },
      // KV namespace for reading current buildId (enables rollback without redeploy)
      {
        type: 'kv_namespace',
        name: 'PROJECT_BUILDS',
        namespace_id: config.kvNamespaceBuilds,
      },
      // R2 bucket for static assets
      {
        type: 'r2_bucket',
        name: 'ASSETS',
        bucket_name: config.r2BucketName,
      },
      // Add environment variables
      ...Object.entries(environment).map(([name, text]) => ({
        type: 'plain_text',
        name,
        text,
      })),
    ],
    compatibility_date: '2024-01-01',
    compatibility_flags: ['nodejs_compat'],
  }

  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  )

  // Add source map if provided
  if (bundle.sourceMap) {
    formData.append(
      'sourcemap',
      new Blob([bundle.sourceMap], { type: 'application/json' }),
      `${bundle.entryPoint}.map`
    )
  }

  try {
    // Deploy to dispatch namespace
    // API: PUT /accounts/{account_id}/workers/dispatch/namespaces/{namespace_name}/scripts/{script_name}
    // SECURITY: URL-encode path parameters to prevent path injection
    const encodedNamespace = encodeURIComponent(config.dispatchNamespace)
    const encodedScriptName = encodeURIComponent(scriptName)
    const response = await fetch(
      `${CF_API_BASE}/accounts/${config.accountId}/workers/dispatch/namespaces/${encodedNamespace}/scripts/${encodedScriptName}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
        },
        body: formData,
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `Worker deployment failed: ${error}` }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `Worker deployment error: ${error instanceof Error ? error.message : 'Unknown'}`
    }
  }
}

// =============================================================================
// KV OPERATIONS
// =============================================================================

/**
 * Update projectId → buildId mapping in KV
 * SECURITY: Keys are URL-encoded to prevent path manipulation
 */
async function updateBuildMapping(
  config: CloudflareConfig,
  projectId: string,
  buildId: string
): Promise<boolean> {
  try {
    // URL-encode path parameters to prevent path injection
    const encodedNamespaceId = encodeURIComponent(config.kvNamespaceBuilds)
    const encodedKey = encodeURIComponent(projectId)
    const response = await cfFetch(
      config,
      `/accounts/${config.accountId}/storage/kv/namespaces/${encodedNamespaceId}/values/${encodedKey}`,
      {
        method: 'PUT',
        body: buildId,
        headers: {
          'Content-Type': 'text/plain',
        },
      }
    )
    return response.ok
  } catch {
    return false
  }
}

// =============================================================================
// MAIN DEPLOYMENT SERVICE
// =============================================================================

export class InhouseDeploymentService {
  private config: CloudflareConfig

  constructor() {
    // Load config from environment
    this.config = {
      accountId: process.env.CF_ACCOUNT_ID || '',
      apiToken: process.env.CF_API_TOKEN_WORKERS || '',
      kvNamespaceHostname: process.env.CF_KV_NAMESPACE_HOSTNAME || '',
      kvNamespaceBuilds: process.env.CF_KV_NAMESPACE_BUILDS || '',
      r2BucketName: process.env.CF_R2_BUCKET_BUILDS || 'sheenapps-builds',
      dispatchNamespace: process.env.CF_DISPATCH_NAMESPACE || 'sheenapps-user-projects',
    }
  }

  /**
   * Deploy an Easy Mode project
   */
  async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
    const startTime = Date.now()
    const deploymentId = this.generateDeploymentId()
    const db = getDatabase()

    try {
      // 1. Create deployment record
      await db.query(`
        INSERT INTO inhouse_deployments (id, project_id, build_id, status)
        VALUES ($1, $2, $3, 'uploading')
      `, [deploymentId, config.projectId, config.buildId])

      // Log: Starting deployment
      await this.logEvent(deploymentId, 'info', 'upload_assets', 'Starting deployment...', {
        buildId: config.buildId,
        assetCount: config.staticAssets.length,
      })

      // 2. Upload static assets to R2
      await this.logEvent(deploymentId, 'info', 'upload_assets', `Uploading ${config.staticAssets.length} static assets...`, {
        totalAssets: config.staticAssets.length,
      })

      const assetResult = await uploadStaticAssets(
        this.config,
        config.projectId,
        config.buildId,
        config.staticAssets
      )

      // CRITICAL: Fail deployment if any assets failed to upload
      // A "successful" deployment with missing assets would produce broken sites
      if (assetResult.failed > 0) {
        const errorSummary = assetResult.errors.slice(0, 3).join('; ')
        const moreCount = assetResult.errors.length > 3 ? ` (+${assetResult.errors.length - 3} more)` : ''
        await this.logEvent(deploymentId, 'error', 'error', `Asset upload failed: ${assetResult.failed} asset(s) failed`, {
          failedCount: assetResult.failed,
          errors: assetResult.errors.slice(0, 5),
        })
        throw new Error(`${assetResult.failed} asset(s) failed to upload: ${errorSummary}${moreCount}`)
      }

      // Log: Assets uploaded successfully
      await this.logEvent(deploymentId, 'info', 'upload_assets', `Uploaded ${assetResult.uploaded} assets successfully`, {
        uploadedCount: assetResult.uploaded,
      })

      // Update status
      // Calculate actual bytes: strings need Buffer.byteLength, Buffers use .length
      const totalAssetBytes = config.staticAssets.reduce((sum, a) => {
        if (typeof a.content === 'string') {
          return sum + Buffer.byteLength(a.content, 'utf8')
        }
        return sum + a.content.length // Buffer.length is already bytes
      }, 0)

      await db.query(`
        UPDATE inhouse_deployments
        SET status = 'deploying', static_assets_count = $2, static_assets_bytes = $3
        WHERE id = $1
      `, [deploymentId, assetResult.uploaded, totalAssetBytes])

      // 3. Deploy Worker script (if SSR bundle provided)
      let workerDeployed = false
      if (config.serverBundle) {
        await this.logEvent(deploymentId, 'info', 'deploy_worker', 'Deploying server bundle to Workers...', {
          entryPoint: config.serverBundle.entryPoint,
        })

        const workerResult = await deployWorkerScript(
          this.config,
          config.projectId,
          config.buildId,
          config.serverBundle,
          config.environment
        )

        if (!workerResult.success) {
          await this.logEvent(deploymentId, 'error', 'error', `Worker deployment failed: ${workerResult.error}`)
          throw new Error(workerResult.error || 'Worker deployment failed')
        }

        await this.logEvent(deploymentId, 'info', 'deploy_worker', 'Server bundle deployed successfully')
        workerDeployed = true
      } else {
        await this.logEvent(deploymentId, 'info', 'deploy_worker', 'No server bundle - skipping worker deployment')
      }

      // 4. Update KV mappings (critical for site routing)
      await this.logEvent(deploymentId, 'info', 'update_kv', 'Updating routing configuration...')

      const subdomain = await this.getProjectSubdomain(config.projectId)
      const hostname = `${subdomain}.sheenapps.com`

      // EXPERT FIX: Sequential KV updates for clearer error attribution
      // Hostname mapping first (stable/idempotent per project)
      const hostnameSuccess = await updateHostnameMapping(this.config, hostname, config.projectId)
      if (!hostnameSuccess) {
        await this.logEvent(deploymentId, 'error', 'error', `Hostname mapping failed for ${hostname}`)
        throw new Error(`Failed to update hostname mapping for ${hostname} - site will not be reachable`)
      }

      const customDomains = await this.getProjectCustomDomains(config.projectId)
      for (const domain of customDomains) {
        const customSuccess = await updateHostnameMapping(this.config, domain, config.projectId)
        if (!customSuccess) {
          await this.logEvent(deploymentId, 'warn', 'update_kv', `Custom domain mapping failed for ${domain}`)
        }
      }

      // Build mapping second (updates to new build)
      // If this fails, previous build remains in KV (safe fallback)
      const buildSuccess = await updateBuildMapping(this.config, config.projectId, config.buildId)
      if (!buildSuccess) {
        await this.logEvent(deploymentId, 'error', 'error', `Build mapping failed for project ${config.projectId}`)
        throw new Error(`Failed to update build mapping for project ${config.projectId} - site will serve previous build`)
      }

      await this.logEvent(deploymentId, 'info', 'update_kv', 'Routing configuration updated', {
        hostname,
        buildId: config.buildId,
      })

      // 5. Activate build
      await this.logEvent(deploymentId, 'info', 'activate', 'Activating build...')

      // 6. Update deployment + project atomically
      // EXPERT FIX: Wrap final updates in transaction to prevent inconsistent state
      // (e.g., site is live but DB says deployment failed)
      const duration = Date.now() - startTime
      await db.query('BEGIN')
      try {
        await db.query(`
          UPDATE inhouse_deployments
          SET status = 'deployed',
              deployed_at = NOW(),
              deploy_duration_ms = $2,
              cf_worker_name = $3
          WHERE id = $1
        `, [deploymentId, duration, config.projectId])

        await db.query(`
          UPDATE projects
          SET inhouse_build_id = $2,
              inhouse_deployed_at = NOW(),
              preview_url = $3
          WHERE id = $1
        `, [config.projectId, config.buildId, `https://${hostname}`])

        await db.query('COMMIT')
      } catch (txError) {
        await db.query('ROLLBACK')
        throw txError
      }

      // Log: Deployment complete
      await this.logEvent(deploymentId, 'info', 'done', `Deployment complete! Site live at https://${hostname}`, {
        url: `https://${hostname}`,
        durationMs: duration,
        assetsUploaded: assetResult.uploaded,
        workerDeployed,
      })

      // Funnel: deploy_succeeded
      try {
        await getBusinessEventsService().insertEvent({
          projectId: config.projectId,
          eventType: 'deploy_succeeded',
          occurredAt: new Date().toISOString(),
          source: 'server',
          payload: {
            deploymentId,
            buildId: config.buildId,
            url: `https://${hostname}`,
            durationMs: duration,
            assetsUploaded: assetResult.uploaded,
          },
          idempotencyKey: `deploy-succeeded:${deploymentId}`,
        })
      } catch (_) { /* non-critical */ }

      return {
        success: true,
        deploymentId,
        buildId: config.buildId,
        url: `https://${hostname}`,
        staticAssetsUploaded: assetResult.uploaded,
        workerDeployed,
        duration,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const duration = Date.now() - startTime

      // Update deployment as failed - guard with try/catch to not mask original error
      try {
        await db.query(`
          UPDATE inhouse_deployments
          SET status = 'failed',
              error_message = $2,
              deploy_duration_ms = $3
          WHERE id = $1
        `, [deploymentId, errorMessage, duration])
      } catch (dbError) {
        // Log DB failure but don't mask the original deployment error
        console.error('[InhouseDeployment] Failed to update deployment status:', dbError)
      }

      console.error('[InhouseDeployment] Deployment failed:', error)

      // Funnel: deploy_failed
      try {
        await getBusinessEventsService().insertEvent({
          projectId: config.projectId,
          eventType: 'deploy_failed',
          occurredAt: new Date().toISOString(),
          source: 'server',
          payload: {
            deploymentId,
            buildId: config.buildId,
            errorMessage: errorMessage?.slice(0, 500),
            durationMs: duration,
          },
          idempotencyKey: `deploy-failed:${deploymentId}`,
        })
      } catch (_) { /* non-critical */ }

      return {
        success: false,
        deploymentId,
        buildId: config.buildId,
        url: '',
        staticAssetsUploaded: 0,
        workerDeployed: false,
        duration,
        error: errorMessage,
      }
    }
  }

  /**
   * Rollback to a previous build
   */
  async rollback(projectId: string, buildId: string): Promise<DeploymentResult> {
    // Simply update the KV mapping to point to the previous build
    // The assets and worker for that build should still exist

    const startTime = Date.now()
    const db = getDatabase()

    try {
      // Verify the build exists
      const buildCheck = await db.query(`
        SELECT id FROM inhouse_deployments
        WHERE project_id = $1 AND build_id = $2 AND status = 'deployed'
        LIMIT 1
      `, [projectId, buildId])

      if (buildCheck.rows.length === 0) {
        throw new Error(`Build ${buildId} not found or was not successfully deployed`)
      }

      // Update KV to point to the rollback build
      const kvSuccess = await updateBuildMapping(this.config, projectId, buildId)
      if (!kvSuccess) {
        throw new Error(`Failed to update build mapping - rollback may not take effect`)
      }

      // Update project
      await db.query(`
        UPDATE projects
        SET inhouse_build_id = $2,
            inhouse_deployed_at = NOW()
        WHERE id = $1
      `, [projectId, buildId])

      const subdomain = await this.getProjectSubdomain(projectId)
      const duration = Date.now() - startTime

      return {
        success: true,
        deploymentId: `rollback-${Date.now()}`,
        buildId,
        url: `https://${subdomain}.sheenapps.com`,
        staticAssetsUploaded: 0,
        workerDeployed: false,
        duration,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        deploymentId: `rollback-${Date.now()}`,
        buildId,
        url: '',
        staticAssetsUploaded: 0,
        workerDeployed: false,
        duration: Date.now() - startTime,
        error: errorMessage,
      }
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId: string): Promise<{
    status: string
    deployedAt?: string
    duration?: number
    error?: string
  } | null> {
    const db = getDatabase()
    const result = await db.query(`
      SELECT status, deployed_at, deploy_duration_ms, error_message
      FROM inhouse_deployments
      WHERE id = $1
    `, [deploymentId])

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    return {
      status: row.status,
      deployedAt: row.deployed_at,
      duration: row.deploy_duration_ms,
      error: row.error_message,
    }
  }

  /**
   * Get deployment history for a project with cursor-based pagination
   *
   * Returns deployments ordered by created_at DESC with cursor for efficient pagination.
   * Cursor format: base64(created_at:id) for tie-breaking on same timestamp.
   */
  async getDeploymentHistory(
    projectId: string,
    options: {
      limit?: number
      cursor?: string
    } = {}
  ): Promise<{
    deployments: DeploymentHistoryItem[]
    nextCursor: string | null
  }> {
    const db = getDatabase()
    const limit = Math.min(Math.max(options.limit || 20, 1), 100) // 1-100, default 20

    // Decode cursor if provided
    let cursorCreatedAt: string | null = null
    let cursorId: string | null = null

    if (options.cursor) {
      try {
        const decoded = Buffer.from(options.cursor, 'base64').toString('utf8')
        // Use JSON to avoid delimiter issues with ISO timestamps (which contain colons)
        const parsed = JSON.parse(decoded) as { createdAt?: string; id?: string }
        if (parsed.createdAt && parsed.id) {
          cursorCreatedAt = parsed.createdAt
          cursorId = parsed.id
        }
      } catch {
        // Invalid cursor, ignore and start from beginning
      }
    }

    // Get current active deployment for this project
    const activeResult = await db.query(`
      SELECT inhouse_build_id FROM projects WHERE id = $1
    `, [projectId])
    const currentActiveBuildId = activeResult.rows[0]?.inhouse_build_id || null

    // Build query with cursor pagination
    let query: string
    let params: (string | number)[]

    if (cursorCreatedAt && cursorId) {
      // Cursor-based pagination: WHERE (created_at, id) < (cursor_created_at, cursor_id)
      query = `
        SELECT
          id, build_id, status, deployed_at, error_message,
          static_assets_count, static_assets_bytes, deploy_duration_ms, created_at
        FROM inhouse_deployments
        WHERE project_id = $1
          AND (created_at, id) < ($2::timestamptz, $3)
        ORDER BY created_at DESC, id DESC
        LIMIT $4
      `
      params = [projectId, cursorCreatedAt, cursorId, limit + 1] // +1 to check if more exist
    } else {
      query = `
        SELECT
          id, build_id, status, deployed_at, error_message,
          static_assets_count, static_assets_bytes, deploy_duration_ms, created_at
        FROM inhouse_deployments
        WHERE project_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `
      params = [projectId, limit + 1]
    }

    const result = await db.query(query, params)

    // Check if there are more results
    const hasMore = result.rows.length > limit
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows

    // Map to response format
    const deployments: DeploymentHistoryItem[] = rows.map(row => ({
      id: row.id,
      buildId: row.build_id,
      status: row.status as 'uploading' | 'deploying' | 'deployed' | 'failed',
      deployedAt: row.deployed_at?.toISOString() || null,
      errorMessage: row.error_message || null,
      isCurrentlyActive: row.build_id === currentActiveBuildId && row.status === 'deployed',
      metadata: {
        assetCount: row.static_assets_count || 0,
        totalSizeBytes: row.static_assets_bytes || 0,
        durationMs: row.deploy_duration_ms || 0,
      },
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    }))

    // Generate next cursor if more results exist
    let nextCursor: string | null = null
    if (hasMore && rows.length > 0) {
      const lastRow = rows[rows.length - 1]
      // Use JSON encoding to avoid delimiter issues with ISO timestamps (which contain colons)
      const cursorPayload = JSON.stringify({
        createdAt: lastRow.created_at.toISOString(),
        id: lastRow.id,
      })
      nextCursor = Buffer.from(cursorPayload, 'utf8').toString('base64')
    }

    return { deployments, nextCursor }
  }

  /**
   * Log a deployment event
   *
   * Writes an event to the inhouse_deployment_events table for live streaming.
   * Fire-and-forget: errors are logged but don't fail deployment.
   */
  private async logEvent(
    deploymentId: string,
    level: 'info' | 'warn' | 'error',
    step: DeploymentStep,
    message: string,
    meta?: Record<string, unknown>
  ): Promise<void> {
    const db = getDatabase()
    try {
      // EXPERT FIX: Explicit JSONB cast for type safety
      await db.query(`
        INSERT INTO inhouse_deployment_events (deployment_id, level, step, message, meta)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `, [deploymentId, level, step, message, meta ? JSON.stringify(meta) : null])
    } catch (error) {
      // Fire-and-forget: don't fail deployment due to event logging failure
      console.error('[InhouseDeployment] Failed to log event:', error)
    }
  }

  /**
   * Get deployment events for live streaming
   *
   * Returns events after the given ID for cursor-based pagination.
   * Used by SSE endpoint to stream events to clients.
   */
  async getDeploymentEvents(
    deploymentId: string,
    afterId: number = 0
  ): Promise<{
    events: DeploymentEvent[]
    isComplete: boolean
    status: string
  }> {
    const db = getDatabase()

    // Get events after the cursor
    const eventsResult = await db.query(`
      SELECT id, deployment_id, ts, level, step, message, meta
      FROM inhouse_deployment_events
      WHERE deployment_id = $1 AND id > $2
      ORDER BY id ASC
      LIMIT 100
    `, [deploymentId, afterId])

    // Get current deployment status
    const statusResult = await db.query(`
      SELECT status FROM inhouse_deployments WHERE id = $1
    `, [deploymentId])

    const status = statusResult.rows[0]?.status || 'unknown'
    const isComplete = status === 'deployed' || status === 'failed'

    const events: DeploymentEvent[] = eventsResult.rows.map(row => ({
      id: parseInt(row.id, 10),
      deploymentId: row.deployment_id,
      ts: row.ts.toISOString(),
      level: row.level as 'info' | 'warn' | 'error',
      step: row.step,
      message: row.message,
      ...(row.meta ? { meta: row.meta } : {}),
    }))

    return { events, isComplete, status }
  }

  /**
   * Get project subdomain
   */
  private async getProjectSubdomain(projectId: string): Promise<string> {
    const db = getDatabase()
    const result = await db.query(`
      SELECT inhouse_subdomain FROM projects WHERE id = $1
    `, [projectId])

    if (result.rows.length === 0 || !result.rows[0].inhouse_subdomain) {
      throw new Error(`Project ${projectId} does not have a subdomain configured`)
    }

    return result.rows[0].inhouse_subdomain
  }

  private async getProjectCustomDomains(projectId: string): Promise<string[]> {
    const db = getDatabase()
    const result = await db.query(
      `
        SELECT domain
        FROM inhouse_custom_domains
        WHERE project_id = $1 AND status IN ('pending', 'active')
      `,
      [projectId]
    )
    return result.rows
      .map((row: any) => String(row.domain).trim().toLowerCase())
      .filter(Boolean)
  }

  /**
   * Generate a unique deployment ID
   */
  private generateDeploymentId(): string {
    return `dpl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
  }
}

// Singleton instance
let instance: InhouseDeploymentService | null = null

export function getInhouseDeploymentService(): InhouseDeploymentService {
  if (!instance) {
    instance = new InhouseDeploymentService()
  }
  return instance
}
