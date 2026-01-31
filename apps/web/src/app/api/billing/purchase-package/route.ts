/**
 * Multi-Provider Package Purchase API Route
 * Creates checkout sessions for package purchases with automatic provider selection
 * Based on MULTI_PROVIDER_FRONTEND_INTEGRATION_PLAN.md
 */

import { NextRequest } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import type { 
  MultiProviderPurchaseRequest, 
  MultiProviderCheckoutResult, 
  MultiProviderError 
} from '@/types/billing'
import { 
  getRegionForCurrency, 
  generateIdempotencyKey,
  isMultiProviderError 
} from '@/types/billing'
import { getRegionalDefaults } from '@/utils/regional-config'

// Route configuration for dynamic responses  
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
  let user: any = null // Initialize user outside try block for catch access
  
  try {
    // 1. Authentication - Use server auth client
    const supabase = await createServerSupabaseClientNew()
    const { data: { user: authenticatedUser }, error: authError } = await supabase.auth.getUser()
    user = authenticatedUser
    
    if (authError || !user) {
      logger.warn('Unauthorized purchase attempt', { error: authError?.message }, 'api')
      return noCacheErrorResponse({
        error: 'Unauthorized',
        details: 'Authentication required'
      }, 401)
    }

    // 2. Parse and validate request body
    const body: MultiProviderPurchaseRequest = await request.json()
    
    // Validate required fields
    if (!body.package_key) {
      return noCacheErrorResponse({
        error: 'Missing package_key',
        details: 'Package key is required (mini, booster, mega, max)'
      }, 400)
    }
    
    if (!body.currency) {
      return noCacheErrorResponse({
        error: 'Missing currency',
        details: 'Currency is required'
      }, 400)
    }

    // 3. Set defaults for optional fields
    const region = body.region || getRegionForCurrency(body.currency)
    const locale = (request.headers.get('x-sheen-locale') as 'en' | 'ar') || 'en'
    const idempotencyKey = body.idempotencyKey || generateIdempotencyKey('checkout', user.id, body.package_key)

    logger.info('Multi-provider purchase initiated', {
      package_key: body.package_key,
      currency: body.currency,
      region,
      locale,
      user_id: user.id,
      has_phone: !!body.phone,
      has_resume_token: !!body.resumeToken
    }, 'api')

    // 4. Call backend multi-provider system
    const checkoutResult = await createMultiProviderCheckout({
      package_key: body.package_key,
      currency: body.currency,
      region,
      locale,
      idempotencyKey,
      phone: body.phone,
      resumeToken: body.resumeToken,
      user_id: user.id
    })

    logger.info('Multi-provider checkout created', {
      order_id: checkoutResult.order_id,
      checkout_type: checkoutResult.checkout_type,
      payment_provider: checkoutResult.payment_provider,
      currency: checkoutResult.currency
    }, 'api')

    // 5. Return checkout result
    return noCacheResponse(checkoutResult)

  } catch (error) {
    logger.error('Multi-provider purchase failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      user_id: user?.id || 'unknown'
    }, 'api')

    // Handle specific multi-provider errors
    if (isMultiProviderError(error)) {
      return noCacheErrorResponse(error, 400)
    }

    // Handle insufficient funds errors
    if (error && typeof error === 'object' && 'error' in error && error.error === 'INSUFFICIENT_AI_TIME') {
      return noCacheErrorResponse(error, 402)
    }

    // Generic error response
    return noCacheErrorResponse({
      error: 'Purchase failed',
      details: 'Failed to create checkout session'
    }, 500)
  }
}

/**
 * Real implementation of multi-provider checkout creation
 * Calls the actual worker API endpoint: POST /v1/billing/packages/purchase
 */
async function createMultiProviderCheckout(request: {
  package_key: string
  currency: string
  region: string
  locale: string
  idempotencyKey: string
  phone?: string
  resumeToken?: string
  user_id: string
}): Promise<MultiProviderCheckoutResult> {
  
  const workerBaseUrl = process.env.WORKER_BASE_URL
  if (!workerBaseUrl) {
    throw new Error('WORKER_BASE_URL environment variable not configured')
  }

  // Prepare request body for worker API
  const requestBody = {
    userId: request.user_id, // Required by backend for user association
    package_key: request.package_key,
    currency: request.currency,
    region: request.region,
    locale: request.locale,
    ...(request.phone && { phone: request.phone }),
    ...(request.resumeToken && { resume_token: request.resumeToken })
  }

  const body = JSON.stringify(requestBody)
  const endpoint = '/v1/billing/packages/purchase'

  logger.info('Calling worker multi-provider API', {
    endpoint,
    user_id: request.user_id.slice(0, 8), // Log first 8 chars for debugging
    package_key: request.package_key,
    currency: request.currency,
    region: request.region,
    locale: request.locale,
    has_phone: !!request.phone,
    has_resume_token: !!request.resumeToken
  }, 'api')

  try {
    // Generate dual signature headers (V1 + V2 for rollout compatibility)
    const authHeaders = createWorkerAuthHeaders('POST', endpoint, body, {
      'x-sheen-locale': request.locale
    })

    const response = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: authHeaders,
      body
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: any
      
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: 'UNKNOWN_ERROR', message: errorText || 'Unknown error' }
      }

      logger.error('Worker multi-provider API error', {
        status: response.status,
        error: errorData,
        endpoint,
        package_key: request.package_key,
        currency: request.currency,
        region: request.region
      }, 'api')

      // Handle specific multi-provider errors from worker
      if (response.status === 400 && errorData.error) {
        throw errorData as MultiProviderError
      }

      // Handle insufficient funds (402)
      if (response.status === 402) {
        throw errorData
      }

      throw new Error(`Worker API error: ${response.status} ${errorData.message || errorText}`)
    }

    const result = await response.json()
    
    // Add server_now timestamp for timer synchronization
    const enhancedResult: MultiProviderCheckoutResult = {
      ...result,
      server_now: new Date().toISOString()
    }

    logger.info('Worker multi-provider API success', {
      order_id: result.order_id,
      checkout_type: result.checkout_type,
      payment_provider: result.payment_provider,
      currency: result.currency,
      endpoint
    }, 'api')

    return enhancedResult

  } catch (error) {
    // Re-throw multi-provider errors and insufficient funds errors
    if (isMultiProviderError(error) || (error && typeof error === 'object' && 'error' in error && error.error === 'INSUFFICIENT_AI_TIME')) {
      throw error
    }

    logger.error('Worker multi-provider API call failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint,
      package_key: request.package_key,
      currency: request.currency
    }, 'api')

    throw new Error(`Failed to create multi-provider checkout: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Add OPTIONS handler for CORS support
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Allow': 'POST, OPTIONS',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-sheen-locale',
    }
  })
}