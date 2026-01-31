/**
 * In-House Mode: Deploy API Route
 *
 * POST /api/inhouse/deploy
 *
 * Deploys a build to Easy Mode hosting:
 * - Uploads static assets to R2
 * - Deploys SSR bundle to Cloudflare Worker
 * - Updates DNS/routing via dispatch worker
 *
 * This is called when user clicks "Deploy" button in workspace.
 *
 * SECURITY: Session-authenticated, userId derived from session (not client input)
 * EXPERT FIX ROUND 2: Fixed auth bypass vulnerability
 */

import { callWorker } from '@/lib/api/worker-helpers'
import { getServerAuthState } from '@/lib/auth-server'
import { assertSameOrigin } from '@/lib/security/csrf'
import { assertProjectOwnership } from '@/lib/security/project-access'
import type { ApiResponse, DeployResponse } from '@/types/inhouse-api'
import { logger } from '@/utils/logger'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Force dynamic rendering and no caching
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'
// Increase body limit for deployment assets
export const maxDuration = 60 // 60 seconds for deployment

// EXPERT FIX ROUND 3: Proper asset schema to prevent DoS via payload size
// EXPERT FIX ROUND 4: Path traversal protection
const AssetSchema = z.object({
  path: z.string().min(1).max(300).regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid asset path'),
  contentType: z.string().min(1).max(100),
  // Either inline base64 content or reference to R2 key
  contentBase64: z.string().max(2_000_000).optional(), // ~2MB per file max
  r2Key: z.string().max(500).optional(),
  size: z.number().int().positive().max(10_000_000).optional() // 10MB max per asset
}).refine(
  (asset) => !!asset.contentBase64 || !!asset.r2Key,
  { message: 'Asset must have either contentBase64 or r2Key' }
).refine(
  (asset) => {
    const p = asset.path
    return (
      !p.startsWith('/') &&
      !p.includes('..') &&
      !p.includes('\\') &&
      !p.includes('//')
    )
  },
  { message: 'Invalid asset path (no absolute paths, path traversal, or backslashes)' }
)

// EXPERT FIX ROUND 4: Env var key validation + limits
const EnvVarKey = z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/i, 'Invalid env var name')
const EnvVarsSchema = z
  .record(EnvVarKey, z.string().max(2000))
  .refine(obj => Object.keys(obj).length <= 200, { message: 'Too many env vars (max 200)' })
  .optional()

// EXPERT FIX: Zod validation for deploy payload (security + stability)
const DeploySchema = z.object({
  projectId: z.string().min(1, 'Project ID required'),
  buildId: z.string().min(1, 'Build ID required'),
  staticAssets: z.array(AssetSchema).min(1, 'At least one asset required').max(500, 'Too many assets (max 500)'),
  serverBundle: z.object({
    code: z.string().min(1, 'Bundle code required').max(5_000_000, 'Bundle too large (max 5MB)'),
    // EXPERT FIX ROUND 4: Entry point path validation (prevent path traversal)
    entryPoint: z.string().min(1, 'Entry point required').max(300).refine(
      p => !p.startsWith('/') && !p.includes('..') && !p.includes('\\') && !p.includes('//'),
      'Invalid entry point path'
    )
  }),
  envVars: EnvVarsSchema
}).refine((val) => {
  // Total payload size check for base64 assets
  const totalBase64 = val.staticAssets.reduce((sum, a) => sum + (a.contentBase64?.length || 0), 0)
  return totalBase64 <= 20_000_000 // ~20MB total base64 content
}, { message: 'Total asset payload too large (max 20MB of base64 content)' })

/**
 * POST /api/inhouse/deploy
 * Deploy a build to Easy Mode hosting (session-authenticated)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // EXPERT FIX ROUND 3: Check Content-Length before parsing to prevent RAM bombs
    const contentLength = request.headers.get('content-length')
    const MAX_BODY_BYTES = 25_000_000 // 25MB max (slightly above our 20MB base64 limit)

    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      logger.warn('Deploy request rejected: payload too large', {
        contentLength,
        maxAllowed: MAX_BODY_BYTES
      })
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request payload too large (max 25MB)'
          }
        },
        { status: 413 }
      )
    }

    // CSRF Protection: Verify request origin
    try {
      assertSameOrigin(request)
    } catch (e) {
      logger.warn('CSRF check failed on deploy endpoint', {
        error: e instanceof Error ? e.message : String(e),
        origin: request.headers.get('origin'),
        host: request.headers.get('host')
      })
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Forbidden'
          }
        },
        { status: 403 }
      )
    }

    // EXPERT FIX ROUND 2: Use session auth, don't trust userId from client
    const authState = await getServerAuthState()
    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        },
        { status: 401 }
      )
    }

    const userId = authState.user.id

    // EXPERT FIX: Parse and validate with Zod
    const rawBody = await request.json()
    const parsed = DeploySchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid deploy payload',
            details: parsed.error.issues
          }
        },
        { status: 400 }
      )
    }

    const { projectId, buildId, staticAssets, serverBundle, envVars } = parsed.data

    // EXPERT FIX ROUND 3: Verify project ownership before deploying
    try {
      await assertProjectOwnership(userId, projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Access denied'
      const code = (error as { code?: string }).code || 'FORBIDDEN'
      const status = (error as { status?: number }).status || 403
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code,
            message
          }
        },
        { status }
      )
    }

    logger.info('Starting deployment to Easy Mode', {
      userId: userId.slice(0, 8),
      projectId: projectId.slice(0, 8),
      buildId: buildId.slice(0, 8),
      assetCount: staticAssets.length,
      hasEnvVars: !!envVars
    })

    // EXPERT FIX ROUND 2: Use callWorker with proper auth + timeout
    const result = await callWorker({
      method: 'POST',
      path: '/v1/inhouse/deploy',
      body: {
        userId,
        projectId,
        buildId,
        staticAssets,
        serverBundle,
        envVars
      },
      timeout: 55000 // 55 seconds (less than maxDuration)
    })

    if (!result.ok) {
      // Handle timeout errors specifically
      if (result.error?.code === 'TIMEOUT') {
        return NextResponse.json<ApiResponse<never>>(
          {
            ok: false,
            error: {
              code: 'DEPLOYMENT_TIMEOUT',
              message: 'Deployment timed out after 55 seconds. Please try again.'
            }
          },
          { status: 504 }
        )
      }

      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'DEPLOYMENT_FAILED',
            message: result.error?.message || 'Deployment failed'
          }
        },
        { status: result.status }
      )
    }

    logger.info('Deployment completed successfully', {
      projectId: projectId.slice(0, 8),
      deploymentId: result.data?.deploymentId?.slice(0, 8),
      url: result.data?.url
    })

    // Return success response
    return NextResponse.json<ApiResponse<DeployResponse>>(
      {
        ok: true,
        data: {
          deploymentId: result.data.deploymentId,
          url: result.data.url,
          status: 'deployed',
          timestamp: new Date().toISOString()
        }
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )

  } catch (error) {
    logger.error('Failed to deploy to Easy Mode', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during deployment'
        }
      },
      { status: 500 }
    )
  }
}
