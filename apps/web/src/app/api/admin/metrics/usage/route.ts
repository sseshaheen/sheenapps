import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { parseISO, startOfMonth, endOfMonth } from 'date-fns'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL || 'http://localhost:8081'

export async function GET(request: NextRequest) {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }
    
    const url = new URL(request.url)
    const startDateParam = url.searchParams.get('startDate')
    const endDateParam = url.searchParams.get('endDate')
    
    const startDate = startDateParam ? parseISO(startDateParam) : startOfMonth(new Date())
    const endDate = endDateParam ? parseISO(endDateParam) : endOfMonth(new Date())

    logger.info('Admin accessed usage metrics', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      dateRange: { startDate, endDate }
    })

    // For now, return stub data until worker implements usage metrics endpoint
    // TODO: Call worker API when /v1/admin/metrics/usage is available
    const usage = {
      totalGenerations: 0,
      aiGenerations: 0,
      averageGenerationsPerUser: 0,
      totalUsers: 0,
      activeUsers: 0,
      projectsCreated: 0,
      powerUsers: [],
      featureAdoption: {},
      limitHitFrequency: 0
    }

    const trials = {
      activeTrials: 0,
      totalTrials: 0,
      conversionRate: 0,
      convertedTrials: 0,
      averageTrialDuration: 0
    }

    return noCacheResponse({
      success: true,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      metrics: {
        usage,
        trials
      }
    })

  } catch (error) {
    logger.error('Failed to calculate usage metrics', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return noCacheErrorResponse({
      error: 'Failed to calculate usage metrics'
    }, 500)
  }
}