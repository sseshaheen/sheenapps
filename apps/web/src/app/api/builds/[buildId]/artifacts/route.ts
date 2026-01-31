/**
 * Build Artifacts API Route
 *
 * Proxies to worker to fetch build artifacts (staticAssets, serverBundle, envVars)
 * for deployment via DeployDialog.
 */

import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { NextRequest, NextResponse } from 'next/server'

// Ensure this API route is always dynamic
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildId: string }> }
) {
  try {
    const { buildId } = await params

    // SECURITY: Get userId from session, NOT from query parameters
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.error('Unauthorized request - invalid session')
      return NextResponse.json(
        { error: 'Unauthorized - invalid session' },
        { status: 401 }
      )
    }

    const userId = user.id

    logger.info('BUILD ARTIFACTS API REQUEST:', {
      buildId: buildId.slice(0, 8),
      userId: userId.slice(0, 8),
      timestamp: new Date().toISOString()
    })

    // Validate buildId format (should be ULID, 26+ chars)
    if (!buildId || buildId.length < 26) {
      logger.error('Invalid buildId format:', { buildId })
      return NextResponse.json(
        { error: 'Invalid buildId format - must be 26+ characters' },
        { status: 400 }
      )
    }

    // Build worker URL
    const workerBaseUrl = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'
    const workerPath = `/v1/builds/${buildId}/artifacts`
    const workerUrl = `${workerBaseUrl}${workerPath}?userId=${encodeURIComponent(userId)}`

    logger.info('Calling worker:', { url: workerUrl })

    // Create HMAC auth headers
    const headers = createWorkerAuthHeaders('GET', workerPath, '', {
      'x-user-id': userId,
    })

    // Call worker
    const response = await fetch(workerUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorJson: any = null
      try {
        errorJson = JSON.parse(errorText)
      } catch {
        // Not JSON
      }

      logger.error('Worker returned error:', {
        status: response.status,
        error: errorJson || errorText,
      })

      // Pass through the worker's error response
      return NextResponse.json(
        errorJson || { error: 'Failed to fetch build artifacts' },
        { status: response.status }
      )
    }

    const artifacts = await response.json()

    logger.info('BUILD ARTIFACTS SUCCESS:', {
      buildId: buildId.slice(0, 8),
      assetCount: artifacts.staticAssets?.length || 0,
      hasServerBundle: !!artifacts.serverBundle,
      envVarCount: Object.keys(artifacts.envVars || {}).length,
    })

    // Return with no-cache headers
    return NextResponse.json(artifacts, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

  } catch (error) {
    logger.error('Build artifacts API error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
