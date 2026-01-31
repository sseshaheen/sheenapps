/**
 * 📊 Admin Usage Spikes API Route (BFF Pattern)
 * Real-time usage spike monitoring with admin authentication
 * 
 * Key features:
 * - Admin-only access with JWT authentication
 * - Worker API integration for real usage spike data
 * - Mock fallback for development/testing
 * - Real-time spike detection and analytics
 * - Proper cache prevention for live data
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

// Mock usage spikes for fallback
const mockUsageSpikes = [
  {
    id: 'spike_001',
    user_id: 'user_5d2k9m1x3p',
    metric: 'ai_generation',
    hour: new Date().toISOString(),
    usage_count: 150,
    avg_hourly_usage: 30,
    spike_ratio: 5.0,
    severity: 'critical',
    created_at: new Date().toISOString()
  },
  {
    id: 'spike_002', 
    user_id: 'user_8h4j2n9z6k',
    metric: 'ai_generation',
    hour: new Date(Date.now() - 3600000).toISOString(),
    usage_count: 120,
    avg_hourly_usage: 40,
    spike_ratio: 3.0,
    severity: 'high',
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'spike_003',
    user_id: 'user_2p8m5q1r7t',
    metric: 'workspace_builds',
    hour: new Date(Date.now() - 7200000).toISOString(),
    usage_count: 80,
    avg_hourly_usage: 25,
    spike_ratio: 3.2,
    severity: 'high', 
    created_at: new Date(Date.now() - 7200000).toISOString()
  }
]

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
    
    // Extract query parameters
    const searchParams = {
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 20,
      hours: url.searchParams.get('hours') ? parseInt(url.searchParams.get('hours')!) : 24,
      min_ratio: url.searchParams.get('min_ratio') ? parseFloat(url.searchParams.get('min_ratio')!) : 2.0,
      metric: url.searchParams.get('metric') || undefined
    }

    logger.info('Admin usage spikes request', {
      adminId: session.user.id.slice(0, 8),
      correlationId,
      searchParams
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getUsageSpikes(searchParams, { 
        adminToken: session.token 
      })
      
      return noCacheResponse({
        success: true,
        spikes: data.spikes || [],
        total: data.total || 0,
        correlation_id: correlationId
      })

    } catch (apiError) {
      // Check if mock fallback is allowed
      const { mockReason, workerStatus } = extractMockReason(apiError)
      
      const errorResponse = handleMockFallback({
        mockReason,
        workerStatus,
        correlationId,
        endpoint: '/api/admin/usage-spikes'
      })

      if (errorResponse) {
        return errorResponse
      }

      // Mock fallback is enabled - return mock data
      logger.warn('Worker API unavailable, using mock usage spikes data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      // Apply filters to mock data
      let filteredSpikes = [...mockUsageSpikes]
      
      if (searchParams.metric) {
        filteredSpikes = filteredSpikes.filter(spike => spike.metric === searchParams.metric)
      }
      
      if (searchParams.min_ratio) {
        filteredSpikes = filteredSpikes.filter(spike => spike.spike_ratio >= searchParams.min_ratio)
      }

      if (searchParams.hours) {
        const cutoff = new Date(Date.now() - (searchParams.hours * 60 * 60 * 1000))
        filteredSpikes = filteredSpikes.filter(spike => new Date(spike.hour) >= cutoff)
      }

      // Apply limit
      filteredSpikes = filteredSpikes.slice(0, searchParams.limit)

      return noCacheResponse({
        success: true,
        spikes: filteredSpikes,
        total: filteredSpikes.length,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Unexpected error getting usage spikes', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })
    
    return noCacheErrorResponse(
      { error: 'Failed to retrieve usage spikes', correlation_id: correlationId },
      500,
      { 'X-Correlation-Id': correlationId }
    )
  }
}

// Expert's route configuration for optimal behavior
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'