/**
 * Support Tickets API Route
 * Manages customer support tickets for admin panel
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// Mock support tickets for fallback
const mockTickets = [
  {
    id: 'ticket_001',
    user_id: 'user_123',
    user_email: 'customer1@example.com',
    subject: 'Unable to access premium features',
    status: 'open',
    priority: 'high',
    category: 'billing',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    messages_count: 3,
    assigned_to: null
  },
  {
    id: 'ticket_002',
    user_id: 'user_456',
    user_email: 'customer2@example.com',
    subject: 'Feature request: Export to PDF',
    status: 'in_progress',
    priority: 'medium',
    category: 'feature_request',
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    messages_count: 5,
    assigned_to: 'support_agent_1'
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

    // Check if user has support permissions
    const hasSupportPermission = 
      await AdminAuthService.hasPermission('support.view') ||
      await AdminAuthService.hasPermission('admin.read')

    if (!hasSupportPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view support tickets' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')

    logger.info('Fetching support tickets', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      filters: { status, priority },
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const params: Record<string, any> = {}
      if (status) params.status = status
      if (priority) params.priority = priority

      const data = await adminApiClient.getSupportTickets(params, { 
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

      // Filter mock data based on query params
      let filteredTickets = [...mockTickets]
      if (status) {
        filteredTickets = filteredTickets.filter(t => t.status === status)
      }
      if (priority) {
        filteredTickets = filteredTickets.filter(t => t.priority === priority)
      }

      return NextResponse.json({
        success: true,
        tickets: filteredTickets,
        total_count: filteredTickets.length,
        correlation_id: correlationId,
        _mock: true
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in support tickets endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch support tickets',
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