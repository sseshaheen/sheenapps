/**
 * Admin Build Logs Streaming API Endpoint
 * Streams build logs as NDJSON with support for byte ranges
 * Uses JWT Bearer token authentication for admin endpoints
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'

interface RouteParams {
  params: Promise<{ buildId: string }> // ✅ Next.js 15: params is async
}

export async function GET(request: NextRequest, props: RouteParams) {
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

    const { buildId } = await props.params

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

    // Extract query parameters
    const searchParams = request.nextUrl.searchParams
    const bytes = searchParams.get('bytes') // e.g., "-1024" for last 1KB
    const range = request.headers.get('range') // HTTP Range header

    // Stream build logs from worker API
    const response = await adminApiClient.streamBuildLogs(buildId, {
      adminToken: adminSession.token,
      bytes: bytes || undefined,
      range: range || undefined
    })

    // Return the streamed response with proper headers
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
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

  } catch (error) {
    console.error('Admin build logs streaming API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to stream build logs',
        details: error instanceof Error ? error.message : String(error)
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