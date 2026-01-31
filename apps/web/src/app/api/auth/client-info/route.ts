/**
 * 🌐 Client Information API
 * Provides client IP and user agent for security logging
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger';

export async function GET(request: NextRequest) {
  try {
    // Extract client IP from various headers (priority order)
    const ip = 
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') || // Cloudflare
      request.headers.get('x-client-ip') ||
      request.headers.get('x-cluster-client-ip') ||
      'unknown'

    // Extract user agent
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Additional security headers for geo-location (if available)
    const country = request.headers.get('cf-ipcountry') || request.headers.get('x-country-code')
    const region = request.headers.get('cf-region') || request.headers.get('x-region')

    // Detect if request is from mobile
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent)

    // Return client information
    return NextResponse.json({
      ip,
      userAgent,
      isMobile,
      country,
      region,
      timestamp: new Date().toISOString(),
      // Additional security context
      headers: {
        origin: request.headers.get('origin'),
        referer: request.headers.get('referer'),
        acceptLanguage: request.headers.get('accept-language'),
      }
    })

  } catch (error) {
    logger.error('❌ Failed to get client info:', error);
    
    return NextResponse.json({
      ip: 'unknown',
      userAgent: 'unknown',
      isMobile: false,
      country: null,
      region: null,
      timestamp: new Date().toISOString(),
      error: 'Failed to determine client information'
    }, { status: 500 })
  }
}

// Also support POST for when we need to include additional context
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const clientInfo = await GET(request)
    const clientData = await clientInfo.json()

    // Merge with any additional context provided
    return NextResponse.json({
      ...clientData,
      context: body
    })

  } catch {
    // Fall back to GET method
    return GET(request)
  }
}