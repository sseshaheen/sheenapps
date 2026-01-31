/**
 * Single Promotion API Route
 * Handles getting, updating, and deleting individual promotions
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// ✅ Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Get single promotion
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Check permissions
    const hasPermission = 
      await AdminAuthService.hasPermission('promotions.view') ||
      await AdminAuthService.hasPermission('admin.read')

    if (!hasPermission) {
      return noCacheErrorResponse({
        error: 'Insufficient permissions to view promotion details',
        required: 'promotions.view or admin.read',
        available: session.permissions
      }, 403)
    }

    const correlationId = uuidv4()

    try {
      const data = await adminApiClient.getPromotionDetails(id, {
        adminToken: session.token
      })

      return noCacheResponse({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      logger.error('Failed to fetch promotion details', {
        promotionId: id,
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return noCacheErrorResponse({
        error: 'Unable to fetch promotion details',
        details: apiError instanceof Error ? apiError.message : 'Unknown error',
        correlation_id: correlationId
      }, 500)
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in promotion details endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return noCacheErrorResponse({
      error: 'Failed to fetch promotion details',
      correlation_id: correlationId
    }, 500)
  }
}

// Update promotion
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Check permissions
    const hasPermission = 
      await AdminAuthService.hasPermission('promotions.edit') ||
      await AdminAuthService.hasRole('super_admin')

    if (!hasPermission) {
      return noCacheErrorResponse({
        error: 'Insufficient permissions to edit promotions',
        required: 'promotions.edit or super_admin role',
        available: session.permissions
      }, 403)
    }

    const body = await request.json()
    const reason = request.headers.get('x-admin-reason') || 'Editing promotion via admin panel'
    const correlationId = uuidv4()

    logger.info('Updating promotion', {
      promotionId: id,
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Update via admin API client
      const data = await adminApiClient.updatePromotion(id, body, reason, {
        adminToken: session.token,
        correlationId
      })

      return noCacheResponse({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      logger.error('Failed to update promotion via worker', {
        promotionId: id,
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return noCacheErrorResponse({
        error: 'Unable to update promotion',
        details: apiError instanceof Error ? apiError.message : 'Unknown error',
        correlation_id: correlationId
      }, 500)
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in promotion update endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return noCacheErrorResponse({
      error: 'Promotion update failed',
      correlation_id: correlationId
    }, 500)
  }
}