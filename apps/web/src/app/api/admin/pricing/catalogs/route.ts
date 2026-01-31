/**
 * Pricing Catalogs API Route
 * Manages pricing catalog configurations
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// Mock pricing catalogs for fallback
const mockCatalogs = [
  {
    id: 'catalog_001',
    name: 'Standard Pricing',
    status: 'active',
    version: '1.0.0',
    plans: [
      {
        id: 'starter',
        name: 'Starter',
        price: 29,
        currency: 'USD',
        interval: 'month',
        features: ['5 Projects', 'Basic Support', '10GB Storage']
      },
      {
        id: 'pro',
        name: 'Professional',
        price: 99,
        currency: 'USD',
        interval: 'month',
        features: ['Unlimited Projects', 'Priority Support', '100GB Storage', 'Advanced Analytics']
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 299,
        currency: 'USD',
        interval: 'month',
        features: ['Everything in Pro', 'Dedicated Support', 'Unlimited Storage', 'Custom Integrations']
      }
    ],
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'catalog_002',
    name: 'Holiday Promotion',
    status: 'draft',
    version: '0.1.0',
    plans: [
      {
        id: 'starter_promo',
        name: 'Starter (Holiday)',
        price: 19,
        currency: 'USD',
        interval: 'month',
        features: ['5 Projects', 'Basic Support', '10GB Storage', '30% Discount']
      }
    ],
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  }
]

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user has pricing permissions
    const hasPricingPermission = 
      await AdminAuthService.hasPermission('pricing.view') ||
      await AdminAuthService.hasPermission('admin.read')

    if (!hasPricingPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view pricing catalogs' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()

    logger.info('Fetching pricing catalogs', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getPricingCatalogs({ 
        adminToken: session.token 
      })
      
      return NextResponse.json({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      // If worker API fails, fall back to mock data for development
      logger.warn('Worker API unavailable, using mock data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return NextResponse.json({
        success: true,
        catalogs: mockCatalogs,
        total_count: mockCatalogs.length,
        active_catalog_id: 'catalog_001',
        correlation_id: correlationId,
        _mock: true
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in pricing catalogs endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch pricing catalogs',
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