import { NextRequest, NextResponse } from 'next/server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'
import type { PricingCatalog } from '@/types/billing'

// Catalog can be cached (ETag-based) as it changes rarely
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081'

/**
 * GET /api/v1/billing/catalog?currency=USD|EUR|GBP|EGP|SAR|AED
 * Get pricing catalog with currency-aware pricing (Expert enhancement)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const currency = searchParams.get('currency') || 'USD'
    
    // Validate currency format
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED']
    if (!supportedCurrencies.includes(currency)) {
      return NextResponse.json(
        { error: 'Unsupported currency', supported: supportedCurrencies },
        { status: 400 }
      )
    }

    logger.info(`📊 Pricing Catalog API: Fetching catalog for currency: ${currency}`)

    // Call worker API for pricing catalog
    const path = `/v1/billing/catalog`
    const pathWithQuery = `${path}?currency=${currency}`
    const body = ''
    
    // Generate authentication headers
    const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, body)

    // Get If-None-Match header for ETag caching (Expert recommendation)
    const ifNoneMatch = request.headers.get('If-None-Match')
    const requestHeaders: Record<string, string> = {
      'Accept': 'application/json',
      ...authHeaders
    }
    
    if (ifNoneMatch) {
      requestHeaders['If-None-Match'] = ifNoneMatch
    }

    const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
      method: 'GET',
      headers: requestHeaders
    })

    // Handle 304 Not Modified (ETag match)
    if (response.status === 304) {
      logger.info(`✅ Pricing Catalog API: ETag match - returning 304 for ${currency}`)
      return new NextResponse(null, { 
        status: 304,
        headers: {
          'ETag': ifNoneMatch || '',
          'Cache-Control': 'public, max-age=300', // 5 minutes
        }
      })
    }

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Worker API pricing catalog error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        currency
      })
      
      return NextResponse.json(
        { error: `Worker API error: ${response.status}` },
        { status: response.status }
      )
    }

    const catalog: PricingCatalog = await response.json()
    
    logger.info(`✅ Pricing Catalog API: Catalog retrieved for ${currency}`, {
      subscriptions: catalog.subscriptions?.length || 0,
      packages: catalog.packages?.length || 0,
      version: catalog.version,
      currency_fallback: catalog.currency_fallback_from
    })

    // Forward ETag from worker response for caching (Expert recommendation)
    const responseHeaders: Record<string, string> = {
      'Cache-Control': 'public, max-age=300', // 5 minutes
      'Content-Type': 'application/json'
    }
    
    const etag = response.headers.get('ETag')
    if (etag) {
      responseHeaders['ETag'] = etag
    }

    return NextResponse.json(catalog, { headers: responseHeaders })
    
  } catch (error) {
    logger.error('❌ Pricing Catalog API: Failed to fetch catalog:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch pricing catalog' },
      { status: 500 }
    )
  }
}