import { NextRequest, NextResponse } from 'next/server'
import { noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'

// Prevent caching
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG

/**
 * GET /api/v1/billing/usage
 * Catch-all route for missing userId parameter
 */
export async function GET(request: NextRequest) {
  return noCacheErrorResponse(
    'User ID is required. Use /api/v1/billing/usage/{userId}',
    400
  )
}