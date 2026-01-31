/**
 * Admin Token Refresh API Route
 * Uses the dedicated refresh endpoint to get a new admin JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL || 'http://localhost:8081'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const correlationId = uuidv4()
    
    // Get current admin session
    const currentSession = await AdminAuthService.getAdminSession()
    if (!currentSession) {
      logger.warn('Token refresh attempted without valid admin session', { correlationId })
      return NextResponse.json(
        { error: 'No active admin session' },
        { status: 401 }
      )
    }

    logger.info('Refreshing admin JWT token', {
      adminId: currentSession.user.id.slice(0, 8),
      adminEmail: currentSession.user.email,
      correlationId
    })

    // Use the dedicated refresh endpoint - send empty JSON body
    const refreshResponse = await fetch(`${WORKER_BASE_URL}/v1/admin/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentSession.token}`,
        'X-Correlation-Id': correlationId
      },
      body: JSON.stringify({}) // Backend expects JSON body, even if empty
    })

    if (!refreshResponse.ok) {
      const error = await refreshResponse.json().catch(() => ({}))
      
      logger.error('Admin token refresh failed', {
        status: refreshResponse.status,
        error: error.message || 'Unknown error',
        correlationId
      })
      
      // If refresh fails with 401, token is expired
      if (refreshResponse.status === 401) {
        await AdminAuthService.clearAdminSession()
        return NextResponse.json(
          { error: 'Token expired. Please login again.' },
          { status: 401 }
        )
      }
      
      return NextResponse.json(
        { 
          error: error.message || 'Token refresh failed',
          correlation_id: correlationId 
        },
        { status: refreshResponse.status }
      )
    }

    const refreshData = await refreshResponse.json()
    
    // Store the new admin JWT
    await AdminAuthService.storeAdminSession({
      admin_jwt: refreshData.admin_jwt,
      expires_in: refreshData.expires_in,
      expires_at: refreshData.expires_at,
      session_id: refreshData.session_id || currentSession.sessionId,
      user: refreshData.user || currentSession.user,
      permissions: refreshData.permissions || currentSession.permissions,
      success: true,
      correlationId: correlationId
    })

    // Get the updated session
    const updatedSession = await AdminAuthService.getAdminSession()
    
    logger.info('Admin JWT refreshed successfully', {
      adminId: currentSession.user.id.slice(0, 8),
      newExpiresAt: refreshData.expires_at,
      correlationId
    })

    return NextResponse.json({
      success: true,
      session: updatedSession,
      correlation_id: correlationId
    })

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in admin token refresh endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json(
      { 
        error: 'Internal server error during token refresh',
        correlation_id: correlationId 
      },
      { 
        status: 500,
        headers: { 'X-Correlation-Id': correlationId }
      }
    )
  }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'