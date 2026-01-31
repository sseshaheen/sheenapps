/**
 * Unified Log Stream API Route
 * Replaces: /v1/admin/builds/{buildId}/logs (NDJSON) and raw endpoints
 * Supports all 5 log tiers: system, build, deploy, action, lifecycle
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

interface UnifiedLogsQuery {
  tier?: 'system' | 'build' | 'deploy' | 'action' | 'lifecycle'
  buildId?: string
  userId?: string
  projectId?: string
  startDate?: string
  endDate?: string
  instanceId?: string
  format?: 'ndjson' | 'raw'
  limit?: string
  offset?: string  // For pagination support
}

export async function GET(request: NextRequest) {
  const correlationId = uuidv4()

  try {
    // 1. Admin authentication (reuse existing pattern)
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

    // 2. Permission check (reuse existing pattern)
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

    // 3. Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const query: UnifiedLogsQuery = {
      tier: searchParams.get('tier') as UnifiedLogsQuery['tier'] || undefined,
      buildId: searchParams.get('buildId') || undefined,
      userId: searchParams.get('userId') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      instanceId: searchParams.get('instanceId') || undefined,
      format: (searchParams.get('format') as 'ndjson' | 'raw') || 'ndjson', // Updated: Backend now defaults to NDJSON
      limit: searchParams.get('limit') || '1000',
      offset: searchParams.get('offset') || undefined
    }

    // 4. Validate parameters
    if (query.limit) {
      const limitNum = parseInt(query.limit)
      if (isNaN(limitNum) || limitNum > 10000 || limitNum < 1) {
        return NextResponse.json(
          { error: 'Limit must be between 1 and 10000' },
          { status: 400 }
        )
      }
    }

    if (query.offset) {
      const offsetNum = parseInt(query.offset)
      if (isNaN(offsetNum) || offsetNum < 0) {
        return NextResponse.json(
          { error: 'Offset must be a non-negative number' },
          { status: 400 }
        )
      }
    }

    // 5. Build query string for worker API
    const queryString = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) {
        queryString.append(key, value)
      }
    })

    try {
      // 6. Call new unified worker endpoint
      const workerBaseUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL || 'http://localhost:8081'
      const path = `/admin/unified-logs/stream`
      const pathWithQuery = `${path}?${queryString.toString()}`
      const url = `${workerBaseUrl}${pathWithQuery}`

      // 7. Create worker auth headers (reuse existing dual-signature pattern)
      const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, '')

      logger.info('Unified logs API request', {
        adminId: adminSession.user.id.slice(0, 8),
        correlationId,
        query,
        url: path,
        workerUrl: url
      })

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...authHeaders,
          'Accept': query.format === 'raw' ? 'text/plain' : 'application/x-ndjson',
          ...(adminSession.token && { 'Authorization': `Bearer ${adminSession.token}` })
        },
        // Add timeout for production safety
        signal: AbortSignal.timeout(30000) // 30 second timeout
      })

      if (response.ok) {
        const contentType = query.format === 'raw'
          ? 'text/plain; charset=utf-8'
          : 'application/x-ndjson; charset=utf-8'

        const logData = await response.text()

        logger.info('Unified logs API success', {
          adminId: adminSession.user.id.slice(0, 8),
          correlationId,
          responseSize: logData.length,
          contentType
        })

        return new NextResponse(logData, {
          status: response.status,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Correlation-ID': correlationId,
            ...(response.headers.get('Content-Length') && {
              'Content-Length': response.headers.get('Content-Length')!
            }),
            ...(response.headers.get('Content-Range') && {
              'Content-Range': response.headers.get('Content-Range')!
            })
          }
        })
      } else {
        throw new Error(`Worker API returned ${response.status}: ${response.statusText}`)
      }
    } catch (workerError) {
      // 8. Mock fallback (reuse existing pattern)
      const mockFallbackEnabled = process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true'

      logger.warn('Worker API unified logs request failed', {
        adminId: adminSession.user.id.slice(0, 8),
        correlationId,
        mockFallbackEnabled,
        query,
        error: workerError instanceof Error ? workerError.message : String(workerError),
        endpoint: `/admin/unified-logs/stream`
      })

      if (!mockFallbackEnabled) {
        throw workerError
      }

      // Mock data for development
      const mockLogData = query.format === 'raw' ? generateMockRawLogs(query) : generateMockNDJSONLogs(query)

      return new NextResponse(mockLogData, {
        status: 200,
        headers: {
          'Content-Type': query.format === 'raw' ? 'text/plain; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
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
    logger.error('Admin unified logs API error', {
      correlationId,
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json(
      {
        error: 'Failed to fetch unified logs',
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

function generateMockRawLogs(query: UnifiedLogsQuery): string {
  const tier = query.tier || 'build'
  const buildId = query.buildId?.slice(0, 8) || 'MOCK'
  const limit = parseInt(query.limit || '1000')
  const offset = parseInt(query.offset || '0')

  const logs = []
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')

  // Generate logs starting from offset
  for (let i = offset; i < Math.min(offset + limit, offset + 100); i++) {
    const logLine = `[${timestamp}] ${tier.toUpperCase()} [${buildId}] Mock ${tier} log entry #${i + 1}`
    logs.push(logLine)
  }

  // Add tier-specific mock content
  switch (tier) {
    case 'build':
      logs.push(`[${timestamp}] BUILD [${buildId}] Starting build process`)
      logs.push(`[${timestamp}] BUILD [${buildId}] Installing dependencies...`)
      logs.push(`[${timestamp}] BUILD [${buildId}] Dependencies installed successfully`)
      logs.push(`[${timestamp}] BUILD [${buildId}] Running TypeScript compilation`)
      logs.push(`[${timestamp}] BUILD [${buildId}] Build completed successfully`)
      break
    case 'deploy':
      logs.push(`[${timestamp}] DEPLOY [${buildId}] Starting deployment`)
      logs.push(`[${timestamp}] DEPLOY [${buildId}] Uploading assets...`)
      logs.push(`[${timestamp}] DEPLOY [${buildId}] Deployment completed`)
      break
    case 'system':
      logs.push(`[${timestamp}] SYSTEM [${buildId}] System health check passed`)
      logs.push(`[${timestamp}] SYSTEM [${buildId}] Memory usage: 512MB`)
      break
    case 'action':
      logs.push(`[${timestamp}] ACTION [${buildId}] User action: build_trigger`)
      logs.push(`[${timestamp}] ACTION [${buildId}] API call: POST /api/builds`)
      break
    case 'lifecycle':
      logs.push(`[${timestamp}] LIFECYCLE [${buildId}] Application started`)
      logs.push(`[${timestamp}] LIFECYCLE [${buildId}] Workers initialized`)
      break
  }

  return logs.join('\n') + '\n'
}

function generateMockNDJSONLogs(query: UnifiedLogsQuery): string {
  const tier = query.tier || 'build'
  const buildId = query.buildId || '01HMOCK'
  const limit = parseInt(query.limit || '1000')
  const offset = parseInt(query.offset || '0')

  const logs = []

  for (let i = offset; i < Math.min(offset + limit, offset + 10); i++) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      instanceId: "01H8MOCK",
      tier,
      seq: i + 1,
      buildId,
      userId: query.userId || "mock-user-123",
      projectId: query.projectId || "mock-project-456",
      event: "stdout",
      message: `Mock ${tier} log entry #${i + 1}`,
      metadata: {
        mockData: true,
        tier,
        offset,
        limit
      }
    }
    logs.push(JSON.stringify(logEntry))
  }

  return logs.join('\n') + '\n'
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'