/**
 * Test Route for I18n Implementation
 * Safe testing ground for new multilingual API patterns
 *
 * Test endpoints:
 * GET  /api/test/i18n - Test locale detection and response headers
 * POST /api/test/i18n - Test error localization
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLocaleFromRequest } from '@/lib/server-locale-utils'
import { createLocalizedErrorResponse } from '@/lib/api/error-messages'

/**
 * GET endpoint - Test successful response with proper headers
 */
export async function GET(request: NextRequest) {
  const locale = await getLocaleFromRequest(request)

  const response = NextResponse.json({
    message: 'I18n test endpoint working',
    detectedLocale: locale,
    timestamp: new Date().toISOString(),
    headers: {
      'x-sheen-locale': request.headers.get('x-sheen-locale'),
      'accept-language': request.headers.get('accept-language'),
      'cookie': request.headers.get('cookie')?.includes('locale=') ? 'locale cookie present' : 'no locale cookie'
    }
  })

  // Apply the new header pattern
  response.headers.set('Content-Language', locale)
  response.headers.set('Vary', 'x-sheen-locale, Accept-Language')

  return response
}

/**
 * POST endpoint - Test error localization patterns
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const locale = await getLocaleFromRequest(request)

    // Test different error scenarios based on request body
    if (body.testError === 'general') {
      const errorResponse = await createLocalizedErrorResponse(
        request,
        'general.internalError',
        'TEST_GENERAL_ERROR'
      )

      const response = NextResponse.json(errorResponse, { status: 500 })
      response.headers.set('Content-Language', locale)
      response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
      return response
    }

    if (body.testError === 'trials') {
      const errorResponse = await createLocalizedErrorResponse(
        request,
        'trials.planRequired',
        'PLAN_REQUIRED'
      )

      const response = NextResponse.json(errorResponse, { status: 400 })
      response.headers.set('Content-Language', locale)
      response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
      return response
    }

    if (body.testError === 'export') {
      const errorResponse = await createLocalizedErrorResponse(
        request,
        'export.serviceUnavailable',
        'SERVICE_UNAVAILABLE'
      )

      const response = NextResponse.json(errorResponse, { status: 503 })
      response.headers.set('Content-Language', locale)
      response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
      return response
    }

    if (body.testError === 'interpolation') {
      // Test message interpolation
      const errorResponse = await createLocalizedErrorResponse(
        request,
        'general.internalError',
        'INTERPOLATION_TEST'
      )

      const response = NextResponse.json(errorResponse, { status: 400 })
      response.headers.set('Content-Language', locale)
      response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
      return response
    }

    // Successful response
    const response = NextResponse.json({
      success: true,
      locale,
      receivedBody: body,
      message: 'Test POST endpoint successful'
    })

    response.headers.set('Content-Language', locale)
    response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
    return response

  } catch (error) {
    // Test unhandled error scenario
    const errorResponse = await createLocalizedErrorResponse(
      request,
      'general.internalError',
      'UNHANDLED_ERROR'
    )

    const locale = await getLocaleFromRequest(request)
    const response = NextResponse.json(errorResponse, { status: 500 })
    response.headers.set('Content-Language', locale)
    response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
    return response
  }
}

// Force dynamic rendering for testing
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'