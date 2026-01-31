/**
 * Advisors Search API Route (BFF)
 * Proxies requests to the worker's public advisors search endpoint
 * This endpoint returns approved, bookable advisors
 */

import { NextRequest, NextResponse } from 'next/server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL || 'http://localhost:8081'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const correlationId = uuidv4()
    const searchParams = request.nextUrl.searchParams
    
    // Extract query parameters
    const limit = searchParams.get('limit') || '20'
    const page = searchParams.get('page') || '1'
    const specialties = searchParams.get('specialties')
    const languages = searchParams.get('languages')
    const country = searchParams.get('country')
    const rating = searchParams.get('rating')
    const locale = searchParams.get('lang') || 'en'
    
    // Build query string for worker API
    const queryParams = new URLSearchParams({
      limit,
      page
    })
    
    if (specialties) queryParams.set('specialties', specialties)
    if (languages) queryParams.set('languages', languages)
    if (country) queryParams.set('country', country)
    if (rating) queryParams.set('rating', rating)
    if (locale) queryParams.set('lang', locale)
    
    const workerPath = `/api/v1/advisors/search?${queryParams.toString()}`
    
    logger.info('Fetching public advisors', {
      limit,
      page,
      specialties,
      languages,
      country,
      locale,
      correlationId
    })

    // Create authentication headers for worker API
    const authHeaders = createWorkerAuthHeaders('GET', workerPath, '')
    
    // Add locale header from request
    const requestLocale = request.headers.get('x-sheen-locale') || locale
    
    const response = await fetch(`${WORKER_BASE_URL}${workerPath}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-locale': requestLocale,
        'x-correlation-id': correlationId,
        ...authHeaders
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Worker API request failed', {
        status: response.status,
        error: errorText.substring(0, 200),
        workerPath,
        correlationId
      })
      
      return NextResponse.json({
        error: 'Failed to fetch advisors',
        message: 'Advisor search service is currently unavailable',
        correlation_id: correlationId
      }, { 
        status: 503,
        headers: { 'X-Correlation-Id': correlationId }
      })
    }
    
    const data = await response.json()
    
    logger.info('Public advisors fetched successfully', {
      advisorCount: data.advisors?.length || 0,
      totalCount: data.pagination?.total || 0,
      correlationId
    })
    
    return NextResponse.json({
      ...data,
      correlation_id: correlationId
    }, {
      headers: {
        'X-Correlation-Id': correlationId,
        'Content-Language': response.headers.get('content-language') || locale
      }
    })
    
  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in advisors search endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while fetching advisors',
      correlation_id: correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}

// Disable caching for this endpoint to ensure fresh advisor data
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'