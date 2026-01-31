/**
 * Build Logs Integration Test Endpoint
 * For testing admin JWT authentication and build logs API integration
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'

export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    const adminSession = await AdminAuthService.getAdminSession()

    if (!adminSession) {
      return NextResponse.json(
        { error: 'Admin authentication required' },
        { status: 401 }
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
        { status: 403 }
      )
    }

    // Test builds list API
    let buildsResult
    try {
      buildsResult = await adminApiClient.getBuildsList(
        { limit: 5 },
        { adminToken: adminSession.token }
      )
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch builds list',
        details: error instanceof Error ? error.message : String(error),
        auth: {
          hasToken: !!adminSession.token,
          tokenLength: adminSession.token?.length || 0
        }
      })
    }

    // Test build info API (if we have builds)
    let buildInfoResult
    if (buildsResult.builds.length > 0) {
      const firstBuildId = buildsResult.builds[0].build_id
      try {
        buildInfoResult = await adminApiClient.getBuildInfo(
          firstBuildId,
          { adminToken: adminSession.token }
        )
      } catch (error) {
        buildInfoResult = {
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Build logs integration test successful',
      admin: {
        email: adminSession.user.email,
        role: adminSession.user.role,
        permissions: adminSession.permissions,
        hasReadLogs: hasPermission
      },
      api: {
        buildsCount: buildsResult.builds.length,
        totalBuilds: buildsResult.pagination.total,
        sampleBuildInfo: buildInfoResult
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Build logs test error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0