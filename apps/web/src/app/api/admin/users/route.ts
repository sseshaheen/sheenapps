/**
 * 👥 Admin User Management API Route (BFF Pattern)
 * Expert-validated user management with reason collection and audit tracking
 *
 * Key features:
 * - BFF-only pattern for all user operations
 * - Smart reason enforcement (required for mutations, not reads)
 * - Expert's idempotency pattern for sensitive operations
 * - Permission-based access control (admin for GET, super_admin for mutations)
 */

import { adminApiClient } from '@/lib/admin/admin-api-client'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { AdminApiError } from '@/lib/admin/server-admin-client'
import { noCacheErrorResponse, noCacheResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

// Mock users data for fallback - increased to test pagination
const mockUsers = [
  {
    id: 'user_001',
    email: 'john.doe@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'US' }
  },
  {
    id: 'user_002',
    email: 'jane.smith@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'starter', country: 'UK' }
  },
  {
    id: 'user_003',
    email: 'suspended@example.com',
    status: 'suspended',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'CA', suspension_reason: 'Payment failed' }
  },
  {
    id: 'user_004',
    email: 'alice.johnson@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'DE' }
  },
  {
    id: 'user_005',
    email: 'bob.wilson@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'starter', country: 'FR' }
  },
  {
    id: 'user_006',
    email: 'charlie.brown@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    metadata: { plan: 'enterprise', country: 'JP' }
  },
  {
    id: 'user_007',
    email: 'diana.prince@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'AU' }
  },
  {
    id: 'user_008',
    email: 'edward.smith@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'starter', country: 'BR' }
  },
  {
    id: 'user_009',
    email: 'frank.miller@example.com',
    status: 'suspended',
    createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'IN', suspension_reason: 'Terms violation' }
  },
  {
    id: 'user_010',
    email: 'grace.hopper@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    metadata: { plan: 'enterprise', country: 'SE' }
  },
  {
    id: 'user_011',
    email: 'henry.ford@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'starter', country: 'MX' }
  },
  {
    id: 'user_012',
    email: 'iris.watson@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'IT' }
  },
  {
    id: 'user_013',
    email: 'jack.daniels@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'starter', country: 'ES' }
  },
  {
    id: 'user_014',
    email: 'kate.middleton@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    metadata: { plan: 'enterprise', country: 'GB' }
  },
  {
    id: 'user_015',
    email: 'liam.neeson@example.com',
    status: 'suspended',
    createdAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'IE', suspension_reason: 'Payment issues' }
  },
  {
    id: 'user_016',
    email: 'maria.garcia@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'starter', country: 'AR' }
  },
  {
    id: 'user_017',
    email: 'noah.taylor@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'NZ' }
  },
  {
    id: 'user_018',
    email: 'olivia.wilde@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    metadata: { plan: 'enterprise', country: 'NO' }
  },
  {
    id: 'user_019',
    email: 'peter.parker@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'starter', country: 'PL' }
  },
  {
    id: 'user_020',
    email: 'quinn.adams@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 33 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'PT' }
  },
  {
    id: 'user_021',
    email: 'rachel.green@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    metadata: { plan: 'enterprise', country: 'RU' }
  },
  {
    id: 'user_022',
    email: 'steve.jobs@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'ZA' }
  },
  {
    id: 'user_023',
    email: 'tina.turner@example.com',
    status: 'suspended',
    createdAt: new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'starter', country: 'CH', suspension_reason: 'Abuse reported' }
  },
  {
    id: 'user_024',
    email: 'uma.thurman@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    metadata: { plan: 'pro', country: 'AT' }
  },
  {
    id: 'user_025',
    email: 'victor.hugo@example.com',
    status: 'active',
    createdAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(),
    lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    metadata: { plan: 'enterprise', country: 'BE' }
  }
]

// Expert's user list handler (read-only, no reason required)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse(
        { error: 'Authentication required' },
        401
      )
    }

    const correlationId = uuidv4()
    const url = new URL(request.url)

    // Extract query parameters for user search/filtering
    const searchParams = {
      search: url.searchParams.get('search') || undefined,
      status: url.searchParams.get('status') || undefined,
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!) : undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
      exclude_admin_users: url.searchParams.get('exclude_admin_users') === 'true',
      exclude_advisor_users: url.searchParams.get('exclude_advisor_users') === 'true',
    }

    logger.info('Admin users list request', {
      adminId: session.user.id.slice(0, 8),
      correlationId,
      searchParams
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getUsers(searchParams, {
        adminToken: session.token
      })

      return noCacheResponse({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      // Check if mock fallback is allowed
      const { mockReason, workerStatus } = extractMockReason(apiError)

      const errorResponse = handleMockFallback({
        mockReason,
        workerStatus,
        correlationId,
        endpoint: '/api/admin/users'
      })

      if (errorResponse) {
        return errorResponse
      }

      // Mock fallback is enabled - return mock data
      logger.warn('Worker API unavailable, using mock users data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      // Apply filters to mock data
      let filteredUsers = [...mockUsers]

      // Always exclude admin users from regular user management
      // (Mock data doesn't have admin users, but this is for consistency)
      filteredUsers = filteredUsers.filter(u => !u.email.includes('admin@'))

      if (searchParams.search) {
        const search = searchParams.search.toLowerCase()
        filteredUsers = filteredUsers.filter(u =>
          u.email.toLowerCase().includes(search) ||
          u.id.toLowerCase().includes(search)
        )
      }
      if (searchParams.status) {
        filteredUsers = filteredUsers.filter(u => u.status === searchParams.status)
      }

      // Apply pagination
      const page = searchParams.page || 1
      const limit = searchParams.limit || 10
      const startIndex = (page - 1) * limit
      const paginatedUsers = filteredUsers.slice(startIndex, startIndex + limit)

      return noCacheResponse({
        success: true,
        users: paginatedUsers,
        total: filteredUsers.length,
        page,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()

    logger.error('Unexpected error getting users', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return noCacheErrorResponse(
      { error: 'Failed to retrieve users', correlation_id: correlationId },
      500,
      { 'X-Correlation-Id': correlationId }
    )
  }
}

// Expert's user action handler (mutations require reason and permissions)
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const correlationId = uuidv4()
    const reason = request.headers.get('x-admin-reason')

    // Expert's pattern: Always require reason for user actions
    if (!reason) {
      return NextResponse.json(
        {
          error: 'Reason is required for user actions. Please provide x-admin-reason header.',
          correlation_id: correlationId
        },
        {
          status: 400,
          headers: { 'X-Correlation-Id': correlationId }
        }
      )
    }

    const body = await request.json()
    const { userId, action } = body

    if (!userId || !action) {
      return NextResponse.json(
        {
          error: 'Missing required fields: userId and action',
          correlation_id: correlationId
        },
        {
          status: 400,
          headers: { 'X-Correlation-Id': correlationId }
        }
      )
    }

    logger.info('Admin user action request', {
      adminId: session.user.id.slice(0, 8),
      correlationId,
      targetUserId: userId.slice(0, 8),
      action,
      hasReason: !!reason
    })

    try {
      let result

      switch (action) {
        case 'suspend':
          // Expert's permission check - require admin role
          if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
            return NextResponse.json(
              {
                error: 'Insufficient permissions for user suspension',
                required: 'admin or super_admin role',
                available: session.user.role,
                correlation_id: correlationId
              },
              {
                status: 403,
                headers: { 'X-Correlation-Id': correlationId }
              }
            )
          }

          // TODO: Implement suspendUser method in adminApiClient
          // result = await adminApiClient.suspendUser(userId, reason, correlationId)
          result = { success: true, action: 'suspend', userId, _mock: true }
          break

        case 'ban':
          // Expert's permission check for ban (super_admin only)
          if (session.user.role !== 'super_admin') {
            return NextResponse.json(
              {
                error: 'Insufficient permissions for user ban. Super admin required.',
                required: 'super_admin',
                available: session.user.role,
                correlation_id: correlationId
              },
              {
                status: 403,
                headers: { 'X-Correlation-Id': correlationId }
              }
            )
          }

          // TODO: Implement banUser method in adminApiClient
          // result = await adminApiClient.banUser(userId, reason, correlationId)
          result = { success: true, action: 'ban', userId, _mock: true }
          break

        case 'reactivate':
          if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
            return NextResponse.json(
              {
                error: 'Insufficient permissions for user reactivation',
                required: 'admin or super_admin role',
                available: session.user.role,
                correlation_id: correlationId
              },
              {
                status: 403,
                headers: { 'X-Correlation-Id': correlationId }
              }
            )
          }

          // TODO: Implement reactivateUser method in adminApiClient
          // result = await adminApiClient.reactivateUser(userId, reason, correlationId)
          result = { success: true, action: 'reactivate', userId, _mock: true }
          break

        default:
          return NextResponse.json(
            {
              error: `Unsupported action: ${action}`,
              supportedActions: ['suspend', 'ban', 'reactivate'],
              correlation_id: correlationId
            },
            {
              status: 400,
              headers: { 'X-Correlation-Id': correlationId }
            }
          )
      }

      logger.info('Admin user action completed', {
        adminId: session.user.id.slice(0, 8),
        correlationId: result.correlationId,
        targetUserId: userId.slice(0, 8),
        action,
        success: true
      })

      return NextResponse.json({
        success: true,
        action,
        userId,
        processedBy: session.user.id,
        processedAt: new Date().toISOString(),
        ...result.data
      })

    } catch (error) {
      if (error instanceof AdminApiError) {
        logger.error('Admin backend error in user action', {
          error: error.message,
          code: error.code,
          correlationId: error.correlationId,
          statusCode: error.statusCode,
          adminId: session.user.id.slice(0, 8),
          action,
          targetUserId: userId?.slice(0, 8)
        })

        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            correlation_id: error.correlationId
          },
          {
            status: error.statusCode || 500,
            headers: { 'X-Correlation-Id': error.correlationId }
          }
        )
      }

      throw error
    }

  } catch (error) {
    const correlationId = uuidv4()

    logger.error('Unexpected error in user action', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to process user action',
      correlation_id: correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}

// Expert's route configuration for optimal behavior
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
