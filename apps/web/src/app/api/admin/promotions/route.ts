import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { PromotionsAdminClient } from '@/lib/admin/promotions-admin-client'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// ✅ BACKEND CONFIRMED: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Mock promotions for fallback
const mockPromotions = [
  {
    id: 'promo_001',
    code: 'SUMMER2024',
    type: 'percentage',
    value: 25,
    status: 'active',
    usage_count: 145,
    usage_limit: 500,
    valid_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'promo_002',
    code: 'NEWUSER50',
    type: 'percentage',
    value: 50,
    status: 'active',
    usage_count: 89,
    usage_limit: null,
    restrictions: { new_users_only: true },
    valid_from: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    valid_until: null,
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
  }
]

export async function GET(request: NextRequest) {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Check if user has promotion viewing permissions
    const hasPromotionPermission = 
      await AdminAuthService.hasPermission('promotions.view') ||
      await AdminAuthService.hasPermission('admin.read')

    if (!hasPromotionPermission) {
      return noCacheErrorResponse({
        error: 'Insufficient permissions to view promotions',
        required: 'promotions.view or admin.read',
        available: session.permissions
      }, 403)
    }
    
    const correlationId = uuidv4()

    logger.info('Fetching promotions', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getPromotions({ 
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
        endpoint: '/api/admin/promotions'
      })

      if (errorResponse) {
        return errorResponse
      }

      // Mock fallback is enabled - return mock data
      logger.warn('Worker API unavailable, using mock promotions', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return noCacheResponse({
        success: true,
        promotions: mockPromotions,
        total_count: mockPromotions.length,
        active_count: mockPromotions.filter(p => p.status === 'active').length,
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }
    
  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to fetch promotions',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Check if user has promotion creation permissions
    const hasPromotionPermission = 
      await AdminAuthService.hasPermission('promotions.create') ||
      await AdminAuthService.hasRole('super_admin')

    if (!hasPromotionPermission) {
      return noCacheErrorResponse({
        error: 'Insufficient permissions to create promotions',
        required: 'promotions.create or super_admin role',
        available: session.permissions
      }, 403)
    }
    
    const body = await request.json()
    const correlationId = uuidv4()
    
    logger.info('Creating promotion', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Get reason from request headers
      const reason = request.headers.get('x-admin-reason') || 'Creating promotion via admin panel'
      
      // Use admin API client to call worker API
      const data = await adminApiClient.createPromotion(body, reason, { 
        adminToken: session.token,
        correlationId 
      })
      
      // Debug logging to see worker response structure
      logger.info('Worker API response for promotion creation', {
        workerResponse: data,
        hasId: !!data?.id,
        hasPromotionId: !!data?.promotion_id,
        hasPromotion: !!data?.promotion,
        promotionHasId: !!data?.promotion?.id,
        correlationId
      })
      
      return noCacheResponse({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      logger.error('Failed to create promotion via worker', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      // No mock fallback for creation operations - they should fail properly
      return noCacheErrorResponse({
        error: 'Unable to create promotion',
        details: apiError instanceof Error ? apiError.message : 'Unknown error',
        correlation_id: correlationId
      }, 500)
    }
    
  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in promotion creation endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return noCacheErrorResponse({
      error: 'Promotion creation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      correlation_id: correlationId
    }, 500)
  }
}