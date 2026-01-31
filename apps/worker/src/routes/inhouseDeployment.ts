/**
 * In-House Deployment Routes
 *
 * HTTP endpoints for deploying Easy Mode projects.
 *
 * Routes:
 * - POST /v1/inhouse/deploy - Deploy a project
 * - POST /v1/inhouse/rollback - Rollback to a previous build
 * - GET  /v1/inhouse/deployment/:id - Get deployment status
 * - GET  /v1/inhouse/projects/:projectId/deployments - List deployment history
 */

import { createHash } from 'crypto'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { getInhouseDeploymentService } from '../services/inhouse'
import { assertProjectAccess } from '../utils/projectAuth'
import type { DeploymentConfig, BuildAsset, ServerBundle } from '../services/inhouse/InhouseDeploymentService'

// =============================================================================
// DEPLOYMENT LIMITS (DoS Protection)
// =============================================================================

/**
 * Maximum body size for deploy endpoint (150MB)
 * This is the raw HTTP body limit before base64 decoding
 */
const DEPLOY_BODY_LIMIT_BYTES = 150 * 1024 * 1024

/**
 * Maximum number of static assets per deployment
 */
const MAX_ASSETS_COUNT = 2000

/**
 * Maximum size per individual asset after base64 decoding (10MB)
 */
const MAX_ASSET_SIZE_BYTES = 10 * 1024 * 1024

/**
 * Maximum total deployment size after base64 decoding (100MB)
 */
const MAX_TOTAL_DEPLOYMENT_BYTES = 100 * 1024 * 1024

/**
 * Maximum server bundle size (5MB)
 */
const MAX_SERVER_BUNDLE_BYTES = 5 * 1024 * 1024

/**
 * Maximum asset path length
 */
const MAX_ASSET_PATH_LENGTH = 500

/**
 * Maximum env var count
 */
const MAX_ENV_VAR_COUNT = 50

/**
 * Maximum size per env var value (5KB)
 */
const MAX_ENV_VALUE_BYTES = 5 * 1024

/**
 * Maximum total env vars size (128KB)
 */
const MAX_TOTAL_ENV_BYTES = 128 * 1024

/**
 * Validate and normalize asset path
 *
 * Security: Prevents path traversal, weird R2 keys, and storage attacks
 * - Must start with /
 * - No path traversal segments (. or ..)
 * - No backslashes (Windows path confusion)
 * - No null bytes or control characters
 * - Reasonable length limit
 */
function validateAssetPath(path: string): { valid: boolean; error?: string; normalized?: string } {
  // Check type
  if (typeof path !== 'string') {
    return { valid: false, error: 'Path must be a string' }
  }

  // Check length
  if (path.length === 0) {
    return { valid: false, error: 'Path cannot be empty' }
  }
  if (path.length > MAX_ASSET_PATH_LENGTH) {
    return { valid: false, error: `Path exceeds maximum length (${MAX_ASSET_PATH_LENGTH} chars)` }
  }

  // Must start with /
  if (!path.startsWith('/')) {
    return { valid: false, error: 'Path must start with /' }
  }

  // No backslashes (Windows path confusion)
  if (path.includes('\\')) {
    return { valid: false, error: 'Path cannot contain backslashes' }
  }

  // No null bytes or control characters (ASCII 0-31 except newline/tab which shouldn't be in paths anyway)
  if (/[\x00-\x1f]/.test(path)) {
    return { valid: false, error: 'Path cannot contain control characters' }
  }

  // Block percent-encoded traversal: %2e = '.', %2f = '/', %5c = '\'
  if (/%2e/i.test(path) || /%2f/i.test(path) || /%5c/i.test(path)) {
    return { valid: false, error: 'Path cannot contain percent-encoded special characters' }
  }

  // Segment-based validation (allows foo..bar.js but blocks /.. and /./segments)
  // NOTE: Must use indexed loop - indexOf('') always returns first empty segment index!
  const segments = path.split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!
    // Empty segments mean double slashes (// or trailing /)
    if (segment === '') {
      // Allow leading slash (first segment is empty)
      if (i === 0) continue
      return { valid: false, error: 'Path cannot contain empty segments (double slashes)' }
    }
    // Block traversal segments
    if (segment === '.' || segment === '..') {
      return { valid: false, error: 'Path cannot contain . or .. segments' }
    }
  }

  return { valid: true, normalized: path }
}

/**
 * Validate base64 string before decoding
 *
 * Buffer.from(str, 'base64') is permissive - this adds stricter validation
 */
function validateBase64(str: string): { valid: boolean; error?: string } {
  if (typeof str !== 'string') {
    return { valid: false, error: 'Content must be a string' }
  }

  // Reject data URLs (data:...;base64,)
  if (str.startsWith('data:')) {
    return { valid: false, error: 'Data URLs not allowed - send raw base64 only' }
  }

  // Check length is divisible by 4 (base64 is padded)
  if (str.length % 4 !== 0) {
    return { valid: false, error: 'Invalid base64 length (must be divisible by 4)' }
  }

  // Check for valid base64 characters (standard base64, not base64url)
  // Valid: A-Z, a-z, 0-9, +, /, and = for padding
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
    return { valid: false, error: 'Invalid base64 characters' }
  }

  return { valid: true }
}

/**
 * Validate serverBundle entryPoint
 *
 * Security: entryPoint is used as filename in FormData and main_module in Worker metadata
 * - Reasonable length
 * - No path separators (slashes, backslashes)
 * - No control characters
 * - Only safe filename characters
 */
const MAX_ENTRY_POINT_LENGTH = 100
const ENTRY_POINT_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function validateEntryPoint(entryPoint: string): { valid: boolean; error?: string } {
  if (typeof entryPoint !== 'string') {
    return { valid: false, error: 'Entry point must be a string' }
  }

  if (entryPoint.length === 0) {
    return { valid: false, error: 'Entry point cannot be empty' }
  }

  if (entryPoint.length > MAX_ENTRY_POINT_LENGTH) {
    return { valid: false, error: `Entry point exceeds maximum length (${MAX_ENTRY_POINT_LENGTH} chars)` }
  }

  // No path separators
  if (entryPoint.includes('/') || entryPoint.includes('\\')) {
    return { valid: false, error: 'Entry point cannot contain path separators' }
  }

  // No control characters
  if (/[\x00-\x1f]/.test(entryPoint)) {
    return { valid: false, error: 'Entry point cannot contain control characters' }
  }

  // Only safe filename characters
  if (!ENTRY_POINT_REGEX.test(entryPoint)) {
    return { valid: false, error: 'Entry point must contain only alphanumeric characters, dots, underscores, and hyphens' }
  }

  return { valid: true }
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface DeployRequestBody {
  projectId: string
  userId?: string
  buildId: string
  staticAssets?: Array<{
    path: string
    content: string // Base64 encoded
    contentType: string
    hash?: string
  }>
  serverBundle?: {
    code: string
    sourceMap?: string
    entryPoint: string
  }
  environment?: Record<string, string>
}

interface RollbackRequestBody {
  projectId: string
  userId?: string
  buildId: string
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseDeploymentRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()
  const deploymentService = getInhouseDeploymentService()

  // ===========================================================================
  // POST /v1/inhouse/deploy - Deploy a project
  // ===========================================================================
  fastify.post<{
    Body: DeployRequestBody
  }>('/v1/inhouse/deploy', {
    preHandler: hmacMiddleware as any,
    // Route-level body size limit (DoS protection)
    bodyLimit: DEPLOY_BODY_LIMIT_BYTES,
  }, async (request, reply) => {
    const { projectId, userId, buildId, staticAssets, serverBundle, environment } = request.body

    // Validate required fields
    if (!projectId || !buildId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'projectId and buildId are required',
        },
      })
    }

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    // SECURITY: Validate environment variable keys and values
    // Must match service-side validation to fail fast (before asset upload)
    const PROTO_POLLUTION_KEYS = ['__proto__', 'prototype', 'constructor']
    const RESERVED_BINDING_NAMES = new Set(['PROJECT_ID', 'PROJECT_BUILDS', 'BUILD_ID'])
    const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/
    if (environment) {
      for (const [key, value] of Object.entries(environment)) {
        // Reject prototype pollution attempts
        if (PROTO_POLLUTION_KEYS.includes(key)) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_ENV_KEY',
              message: `Invalid environment variable key: ${key}`,
            },
          })
        }
        // Reject reserved binding names (used by worker runtime)
        if (RESERVED_BINDING_NAMES.has(key)) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_ENV_KEY',
              message: `Reserved environment variable name: ${key}`,
            },
          })
        }
        // Validate name format (must be uppercase, start with letter, max 64 chars)
        if (!ENV_VAR_NAME_REGEX.test(key)) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_ENV_KEY',
              message: `Invalid environment variable name: ${key} (must be uppercase, start with letter, only letters/numbers/underscores, max 64 chars)`,
            },
          })
        }
        // Enforce string values (prevents crashes in Buffer.byteLength)
        if (typeof value !== 'string') {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_ENV_VALUE',
              message: `Environment variable '${key}' must be a string`,
            },
          })
        }
      }

      // Check env var count
      const envEntries = Object.entries(environment)
      if (envEntries.length > MAX_ENV_VAR_COUNT) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'TOO_MANY_ENV_VARS',
            message: `Too many environment variables (${envEntries.length} > ${MAX_ENV_VAR_COUNT})`,
          },
        })
      }

      // Check env var sizes
      let totalEnvBytes = 0
      for (const [key, value] of envEntries) {
        const valueBytes = Buffer.byteLength(value, 'utf8')
        if (valueBytes > MAX_ENV_VALUE_BYTES) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'ENV_VALUE_TOO_LARGE',
              message: `Environment variable '${key}' exceeds maximum size (${Math.round(valueBytes / 1024)}KB > ${MAX_ENV_VALUE_BYTES / 1024}KB)`,
            },
          })
        }
        totalEnvBytes += valueBytes
        if (totalEnvBytes > MAX_TOTAL_ENV_BYTES) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'TOTAL_ENV_TOO_LARGE',
              message: `Total environment variables size exceeds maximum (${Math.round(totalEnvBytes / 1024)}KB > ${MAX_TOTAL_ENV_BYTES / 1024}KB)`,
            },
          })
        }
      }
    }

    // ==========================================================================
    // DoS Protection: Validate deployment size limits
    // ==========================================================================

    // Check asset count
    const assetCount = staticAssets?.length || 0
    if (assetCount > MAX_ASSETS_COUNT) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'TOO_MANY_ASSETS',
          message: `Deployment exceeds maximum asset count (${assetCount} > ${MAX_ASSETS_COUNT})`,
        },
      })
    }

    // Check server bundle size and entry point
    if (serverBundle) {
      // Validate entry point first (used as filename in FormData)
      const entryPointValidation = validateEntryPoint(serverBundle.entryPoint)
      if (!entryPointValidation.valid) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_ENTRY_POINT',
            message: `Invalid server bundle entry point: ${entryPointValidation.error}`,
          },
        })
      }

      const bundleSize = Buffer.byteLength(serverBundle.code, 'utf8') +
        (serverBundle.sourceMap ? Buffer.byteLength(serverBundle.sourceMap, 'utf8') : 0)

      if (bundleSize > MAX_SERVER_BUNDLE_BYTES) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'SERVER_BUNDLE_TOO_LARGE',
            message: `Server bundle exceeds maximum size (${Math.round(bundleSize / 1024 / 1024)}MB > ${MAX_SERVER_BUNDLE_BYTES / 1024 / 1024}MB)`,
          },
        })
      }
    }

    // Convert base64 assets to buffers and validate sizes + paths
    // SECURITY: Check cumulative size BEFORE decoding to prevent memory spike attacks
    const assets: BuildAsset[] = []
    let totalAssetBytes = 0
    let estimatedTotalBytes = 0

    for (const asset of staticAssets || []) {
      // Validate asset path first (before spending CPU on base64 decode)
      const pathValidation = validateAssetPath(asset.path)
      if (!pathValidation.valid) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_ASSET_PATH',
            message: `Invalid asset path '${asset.path}': ${pathValidation.error}`,
          },
        })
      }

      // Validate contentType (prevent garbage metadata)
      if (!asset.contentType || asset.contentType.length > 255 || /[\x00-\x1f]/.test(asset.contentType)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_CONTENT_TYPE',
            message: `Invalid contentType for '${asset.path}'`,
          },
        })
      }

      // Validate base64 format before decoding (strict validation)
      const base64Validation = validateBase64(asset.content)
      if (!base64Validation.valid) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_BASE64',
            message: `Invalid base64 content for '${asset.path}': ${base64Validation.error}`,
          },
        })
      }

      // Pre-decode size estimate to reject early without allocating large buffers
      // Base64 decodes to ~75% of encoded size: decoded ≈ (encoded * 3) / 4
      const estimatedSize = Math.ceil((asset.content.length * 3) / 4)
      if (estimatedSize > MAX_ASSET_SIZE_BYTES) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'ASSET_TOO_LARGE',
            message: `Asset '${asset.path}' exceeds maximum size (estimated ${Math.round(estimatedSize / 1024 / 1024)}MB > ${MAX_ASSET_SIZE_BYTES / 1024 / 1024}MB)`,
          },
        })
      }

      // EARLY REJECTION: Check cumulative estimated total BEFORE decoding
      // This prevents memory spike from decoding many assets before rejecting
      estimatedTotalBytes += estimatedSize
      if (estimatedTotalBytes > MAX_TOTAL_DEPLOYMENT_BYTES) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'DEPLOYMENT_TOO_LARGE',
            message: `Total deployment size exceeds maximum (estimated ${Math.round(estimatedTotalBytes / 1024 / 1024)}MB > ${MAX_TOTAL_DEPLOYMENT_BYTES / 1024 / 1024}MB)`,
          },
        })
      }

      const content = Buffer.from(asset.content, 'base64')
      const assetSize = content.length

      // Verify hash if provided (integrity check for debugging + correctness)
      if (asset.hash) {
        const computedHash = createHash('sha256').update(content).digest('hex')
        if (computedHash !== asset.hash) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'HASH_MISMATCH',
              message: `Asset '${asset.path}' hash mismatch: expected ${asset.hash.slice(0, 16)}..., got ${computedHash.slice(0, 16)}...`,
            },
          })
        }
      }

      // Check individual asset size (actual, post-decode)
      if (assetSize > MAX_ASSET_SIZE_BYTES) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'ASSET_TOO_LARGE',
            message: `Asset '${asset.path}' exceeds maximum size (${Math.round(assetSize / 1024 / 1024)}MB > ${MAX_ASSET_SIZE_BYTES / 1024 / 1024}MB)`,
          },
        })
      }

      totalAssetBytes += assetSize
      assets.push({
        path: pathValidation.normalized!, // Use normalized path
        content,
        contentType: asset.contentType,
        ...(asset.hash ? { hash: asset.hash } : {}),
      })
    }

    // Final check on actual total (should rarely trigger after early estimated check)
    if (totalAssetBytes > MAX_TOTAL_DEPLOYMENT_BYTES) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'DEPLOYMENT_TOO_LARGE',
          message: `Total deployment size exceeds maximum (${Math.round(totalAssetBytes / 1024 / 1024)}MB > ${MAX_TOTAL_DEPLOYMENT_BYTES / 1024 / 1024}MB)`,
        },
      })
    }

    // Build deployment config
    const config: DeploymentConfig = {
      projectId,
      buildId,
      staticAssets: assets,
      ...(serverBundle ? {
        serverBundle: {
          code: serverBundle.code,
          entryPoint: serverBundle.entryPoint,
          ...(serverBundle.sourceMap ? { sourceMap: serverBundle.sourceMap } : {}),
        },
      } : {}),
      ...(environment ? { environment } : {}),
    }

    // Execute deployment
    const result = await deploymentService.deploy(config)

    if (!result.success) {
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'DEPLOYMENT_FAILED',
          message: result.error || 'Deployment failed',
        },
        deploymentId: result.deploymentId,
      })
    }

    return reply.code(201).send({
      ok: true,
      data: {
        deploymentId: result.deploymentId,
        buildId: result.buildId,
        url: result.url,
        staticAssetsUploaded: result.staticAssetsUploaded,
        workerDeployed: result.workerDeployed,
        duration: result.duration,
      },
    })
  })

  // ===========================================================================
  // POST /v1/inhouse/rollback - Rollback to a previous build
  // ===========================================================================
  fastify.post<{
    Body: RollbackRequestBody
  }>('/v1/inhouse/rollback', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, userId, buildId } = request.body

    if (!projectId || !buildId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'projectId and buildId are required',
        },
      })
    }

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const result = await deploymentService.rollback(projectId, buildId)

    if (!result.success) {
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'ROLLBACK_FAILED',
          message: result.error || 'Rollback failed',
        },
      })
    }

    return reply.send({
      ok: true,
      data: {
        buildId: result.buildId,
        url: result.url,
        duration: result.duration,
      },
    })
  })

  // ===========================================================================
  // GET /v1/inhouse/deployment/:id - Get deployment status
  // ===========================================================================
  fastify.get<{
    Params: { id: string }
  }>('/v1/inhouse/deployment/:id', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { id } = request.params

    const status = await deploymentService.getDeploymentStatus(id)

    if (!status) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'DEPLOYMENT_NOT_FOUND',
          message: `Deployment ${id} not found`,
        },
      })
    }

    return reply.send({
      ok: true,
      data: status,
    })
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/deployments - List deployment history
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { userId?: string; limit?: string; cursor?: string }
  }>('/v1/inhouse/projects/:projectId/deployments', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, limit: limitStr, cursor } = request.query

    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'projectId is required',
        },
      })
    }

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    // Parse and validate limit (must be integer between 1-100)
    let limit = 20
    if (limitStr) {
      const parsed = parseInt(limitStr, 10)
      if (isNaN(parsed) || parsed < 1 || parsed > 100) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_LIMIT',
            message: 'limit must be an integer between 1 and 100',
          },
        })
      }
      limit = parsed
    }

    const options: { limit?: number; cursor?: string } = { limit }
    if (cursor) {
      options.cursor = cursor
    }
    const result = await deploymentService.getDeploymentHistory(projectId, options)

    return reply.send({
      ok: true,
      data: result,
    })
  })

  // ===========================================================================
  // GET /v1/inhouse/deployments/:deploymentId/events - Get deployment events for live streaming
  // ===========================================================================
  fastify.get<{
    Params: { deploymentId: string }
    Querystring: { after?: string }
  }>('/v1/inhouse/deployments/:deploymentId/events', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { deploymentId } = request.params
    const { after: afterStr } = request.query

    if (!deploymentId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'deploymentId is required',
        },
      })
    }

    // Parse after parameter (cursor for events)
    let afterId = 0
    if (afterStr) {
      const parsed = parseInt(afterStr, 10)
      if (!isNaN(parsed) && parsed >= 0) {
        afterId = parsed
      }
    }

    const result = await deploymentService.getDeploymentEvents(deploymentId, afterId)

    return reply.send({
      ok: true,
      data: result,
    })
  })

  // ===========================================================================
  // GET /v1/inhouse/health - Deployment service health
  // ===========================================================================
  fastify.get('/v1/inhouse/health', async (request, reply) => {
    return reply.send({
      status: 'healthy',
      service: 'inhouse-deployment',
      timestamp: new Date().toISOString(),
      capabilities: {
        staticAssets: true,
        workerDeployment: true,
        rollback: true,
        liveEvents: true,
      },
    })
  })
}
