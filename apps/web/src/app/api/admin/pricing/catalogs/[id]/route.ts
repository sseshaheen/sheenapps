/**
 * Pricing Catalog Details API Route
 * Fetches detailed catalog information including pricing items
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user has pricing view permissions
    const hasPricingPermission = 
      await AdminAuthService.hasPermission('pricing.view') ||
      await AdminAuthService.hasPermission('pricing.manage') ||
      await AdminAuthService.hasPermission('finance.read') ||
      await AdminAuthService.hasPermission('admin.read')

    if (!hasPricingPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view pricing details' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()
    const catalogId = id

    logger.info('Fetching pricing catalog details', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      catalogId,
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.request(
        `/pricing/catalogs/${catalogId}`,
        { 
          method: 'GET',
          adminToken: session.token 
        }
      )

      return NextResponse.json({
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
        endpoint: 'pricing catalog details'
      })

      if (errorResponse) {
        return errorResponse
      }

      // If mock fallback is enabled, return mock data
      logger.warn('Worker API unavailable, using mock data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session?.user?.id?.slice(0, 8) || 'unknown',
        correlationId
      })

      // Mock catalog details with pricing items
      const mockCatalogDetails = {
        success: true,
        catalog: {
          id: catalogId,
          version_tag: '2025-09-01',
          is_active: true,
          effective_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          item_count: 3
        },
        items: [
          {
            id: 'plan_1',
            name: 'Starter',
            description: 'Perfect for small teams',
            price_monthly: 29,
            price_annual: 290,
            features: [
              'Up to 5 users',
              '10 GB storage',
              'Basic support',
              'Core features'
            ],
            limits: {
              users: 5,
              storage_gb: 10,
              api_calls: 1000
            },
            is_popular: false,
            is_new: false
          },
          {
            id: 'plan_2',
            name: 'Growth',
            description: 'For growing businesses',
            price_monthly: 79,
            price_annual: 790,
            features: [
              'Up to 20 users',
              '100 GB storage',
              'Priority support',
              'Advanced features',
              'API access'
            ],
            limits: {
              users: 20,
              storage_gb: 100,
              api_calls: 10000
            },
            is_popular: true,
            is_new: false
          },
          {
            id: 'plan_3',
            name: 'Scale',
            description: 'Enterprise-ready solution',
            price_monthly: 199,
            price_annual: 1990,
            features: [
              'Unlimited users',
              'Unlimited storage',
              'Dedicated support',
              'All features',
              'Custom integrations',
              'SLA guarantee'
            ],
            limits: {
              users: -1, // unlimited
              storage_gb: -1,
              api_calls: -1
            },
            is_popular: false,
            is_new: true
          }
        ],
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      }

      return NextResponse.json(mockCatalogDetails)
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in pricing catalog details endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch catalog details',
      correlation_id: correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'