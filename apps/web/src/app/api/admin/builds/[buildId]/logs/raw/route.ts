/**
 * Admin Raw Build Logs Download API Endpoint
 * Downloads raw .log files without NDJSON processing
 * Uses JWT Bearer token authentication for admin endpoints
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

interface RouteParams {
  params: Promise<{ buildId: string }>
}

// Mock raw log content for fallback
const mockRawLogContent = `[2025-01-15 10:23:45] INFO: Starting build process
[2025-01-15 10:23:45] INFO: Initializing project structure
[2025-01-15 10:23:46] INFO: Installing dependencies...
[2025-01-15 10:23:52] INFO: Dependencies installed successfully
[2025-01-15 10:23:52] INFO: Running TypeScript compilation
[2025-01-15 10:23:55] INFO: TypeScript compilation completed
[2025-01-15 10:23:55] INFO: Building production bundle
[2025-01-15 10:24:12] INFO: Bundle optimization completed
[2025-01-15 10:24:12] INFO: Generating static pages
[2025-01-15 10:24:18] INFO: Static generation completed
[2025-01-15 10:24:18] INFO: Build process completed successfully
[2025-01-15 10:24:18] INFO: Total build time: 33.2 seconds
`

export async function GET(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  const correlationId = uuidv4()

  try {
    // Check admin authentication
    const adminSession = await AdminAuthService.getAdminSession()

    if (!adminSession) {
      return NextResponse.json(
        { error: 'Admin authentication required' },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    // Check read_logs permission
    const hasPermission = adminSession.permissions.includes('read_logs') ||
                         adminSession.permissions.includes('admin:*') ||
                         adminSession.user.role === 'super_admin'

    if (!hasPermission) {
      return NextResponse.json(
        {
          error: 'Insufficient permissions',
          required: 'read_logs',
          current: adminSession.permissions
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    const { buildId } = await params

    // Validate buildId format
    if (!buildId || typeof buildId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid build ID' },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    // Extract query parameters for byte range
    const searchParams = request.nextUrl.searchParams
    const bytes = searchParams.get('bytes') // e.g., "-1024" for last 1KB
    const range = request.headers.get('range') // HTTP Range header

    // Try to fetch raw logs from worker API
    try {
      const workerBaseUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL || 'http://localhost:8081'

      // Build URL with query params if bytes specified
      const query = bytes ? `?bytes=${encodeURIComponent(bytes)}&raw=true` : '?raw=true'
      const url = `${workerBaseUrl}/v1/admin/builds/${buildId}/logs${query}`

      // Build headers
      const headers: Record<string, string> = {
        'Accept': 'text/plain'
      }

      if (adminSession.token) {
        headers['Authorization'] = `Bearer ${adminSession.token}`
      }

      if (range) {
        headers['Range'] = range
      }

      const response = await fetch(url, {
        method: 'GET',
        headers
      })

      if (response.ok) {
        // Stream the raw log content
        const rawLogData = await response.text()

        return new NextResponse(rawLogData, {
          status: response.status,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="build-${buildId.slice(0, 8)}-logs.log"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            // Copy relevant headers from worker response
            ...(response.headers.get('Content-Length') && {
              'Content-Length': response.headers.get('Content-Length')!
            }),
            ...(response.headers.get('Content-Range') && {
              'Content-Range': response.headers.get('Content-Range')!
            })
          }
        })
      } else {
        throw new Error(`Worker API returned ${response.status}`)
      }
    } catch (workerError) {
      // Worker API failed - check if mock fallback is enabled
      const mockFallbackEnabled = process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true'

      logger.warn('Worker API raw logs request failed', {
        adminId: adminSession.user.id.slice(0, 8),
        buildId: buildId.slice(0, 8),
        correlationId,
        mockFallbackEnabled,
        error: workerError instanceof Error ? workerError.message : String(workerError),
        endpoint: `/v1/admin/builds/${buildId}/logs?raw=true`
      })

      if (!mockFallbackEnabled) {
        // Re-throw the error if mock fallback is disabled
        throw workerError
      }

      // Return mock raw log content
      return new NextResponse(mockRawLogContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="build-${buildId.slice(0, 8)}-logs.log"`,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Mock-Data': 'true',
          'X-Mock-Reason': 'Worker API unavailable',
          'X-Correlation-ID': correlationId
        }
      })
    }

  } catch (error) {
    logger.error('Admin raw build logs API error', {
      buildId: params.buildId?.slice(0, 8),
      correlationId,
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json(
      {
        error: 'Failed to fetch raw build logs',
        details: error instanceof Error ? error.message : String(error),
        correlation_id: correlationId
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'