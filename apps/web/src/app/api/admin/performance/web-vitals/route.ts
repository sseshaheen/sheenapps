/**
 * Admin Web Vitals API Route
 *
 * Proxies to worker API for Web Vitals metrics.
 * Worker has service role access to query web_vitals_hourly table.
 *
 * See: docs/PERFORMANCE_ANALYSIS.md - Section 12
 */

import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Core Web Vitals thresholds (p75 targets from Google)
const VITALS_THRESHOLDS = {
  INP: { good: 200, poor: 500 },
  LCP: { good: 2500, poor: 4000 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
  FCP: { good: 1800, poor: 3000 },
}

// Mock data for development fallback
const mockWebVitalsData = {
  metrics: {
    INP: { p50: 0, p75: 0, p95: 0, samples: 0, rating: 'needs-improvement' as const, goodPercent: 0, needsImprovementPercent: 0, poorPercent: 0 },
    LCP: { p50: 0, p75: 0, p95: 0, samples: 0, rating: 'needs-improvement' as const, goodPercent: 0, needsImprovementPercent: 0, poorPercent: 0 },
    CLS: { p50: 0, p75: 0, p95: 0, samples: 0, rating: 'needs-improvement' as const, goodPercent: 0, needsImprovementPercent: 0, poorPercent: 0 },
    TTFB: { p50: 0, p75: 0, p95: 0, samples: 0, rating: 'needs-improvement' as const, goodPercent: 0, needsImprovementPercent: 0, poorPercent: 0 },
    FCP: { p50: 0, p75: 0, p95: 0, samples: 0, rating: 'needs-improvement' as const, goodPercent: 0, needsImprovementPercent: 0, poorPercent: 0 },
  },
  trends: { INP: [], LCP: [], CLS: [], TTFB: [], FCP: [] },
  topRoutes: [],
  thresholds: VITALS_THRESHOLDS,
  totalSamples: 0,
}

export async function GET(request: NextRequest) {
  const correlationId = uuidv4()

  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse(
        { error: 'Authentication required' },
        401
      )
    }

    // Check if user has analytics permissions (parallelize permission checks)
    const [analyticsPermission, adminPermission] = await Promise.all([
      AdminAuthService.hasPermission('analytics.read'),
      AdminAuthService.hasPermission('admin.read')
    ])
    const hasPermission = analyticsPermission || adminPermission

    if (!hasPermission) {
      return noCacheErrorResponse(
        { error: 'Insufficient permissions to view performance metrics' },
        403
      )
    }

    // Extract query parameters
    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || '24h'
    const route = searchParams.get('route') || undefined
    const build = searchParams.get('build') || undefined

    logger.info('Fetching web vitals from worker', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      range,
      correlationId
    })

    try {
      // Fetch from worker API
      const data = await adminApiClient.getWebVitals(
        { range, route, build },
        { adminToken: session.token }
      )

      return noCacheResponse({
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
        endpoint: '/api/admin/performance/web-vitals'
      })

      if (errorResponse) {
        return errorResponse
      }

      // Mock fallback is enabled - return empty data
      logger.warn('Worker API unavailable, using mock data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return noCacheResponse({
        success: true,
        ...mockWebVitalsData,
        timeRange: range,
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    logger.error('Web vitals API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return noCacheErrorResponse(
      { error: 'Failed to fetch web vitals metrics', correlation_id: correlationId },
      500,
      { 'X-Correlation-Id': correlationId }
    )
  }
}
