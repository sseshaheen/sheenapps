/**
 * Unified Chat API Route
 * Proxies to backend /v1/chat/unified endpoint with build/plan mode support
 * 
 * EXPERT FIXES APPLIED:
 * - Full BCP-47 locale preservation (ar-eg, fr-ma)
 * - No Authorization: Bearer ${user.id} misuse
 * - Handle 201 (new) vs 200 (duplicate) responses properly
 * - Include client_msg_id for idempotency
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { getLocaleFromRequest } from '@/lib/persistent-chat-server-utils'
import { logger } from '@/utils/logger'

const PERSISTENT_CHAT_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081'

// CRITICAL: Prevent caching for real-time chat message sending
export const dynamic = 'force-dynamic'
export const revalidate = 0  
export const fetchCache = 'force-no-store'

/**
 * POST /api/persistent-chat/unified
 * Send message via unified chat endpoint with buildImmediately support
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { buildImmediately, message, projectId, client_msg_id } = body

    // Validate required fields
    if (typeof buildImmediately !== 'boolean' || !message || !projectId) {
      return NextResponse.json(
        { error: 'buildImmediately (boolean), message, and projectId are required' },
        { status: 400 }
      )
    }

    // EXPERT FIX: Generate client_msg_id if not provided (for idempotency)
    const clientMsgId = client_msg_id || `unified_${Date.now()}_${crypto.randomUUID()}`

    // Build request payload for unified endpoint
    const payload = {
      buildImmediately,
      message,
      userId: user.id,
      projectId,
      client_msg_id: clientMsgId  // Backend uses this for Redis idempotency
    }

    const path = `/v1/chat/unified`
    const bodyStr = JSON.stringify(payload)
    
    // Generate dual signature headers (V1 + V2 for rollout compatibility)
    const authHeaders = createWorkerAuthHeaders('POST', path, bodyStr)

    // EXPERT FIX: Use app's actual locale instead of parsing Accept-Language
    const locale = await getLocaleFromRequest(request) // Returns full locale like 'ar-eg', 'fr-ma'

    // Proxy request to backend
    const response = await fetch(`${PERSISTENT_CHAT_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...authHeaders,              // HMAC authentication only
        'x-sheen-locale': locale,    // Full BCP-47 locale (no collapsing)
        'x-user-id': user.id         // User context
        // EXPERT FIX: Removed Authorization: Bearer ${user.id} - not a proper token
      },
      body: bodyStr
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Unified chat API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        payload,
        userId: user.id
      })

      // EXPERT RECOMMENDATION: Specific error handling (MVP version)
      if (response.status === 429) {
        // Connection limit reached - simplified handling for MVP
        return NextResponse.json(
          { error: 'Connection limit reached', retry_after: 30, code: 'RATE_LIMIT' },
          { status: 429 }
        )
      } else if (response.status === 401 || response.status === 403) {
        // Auth errors - don't throw into boundary
        return NextResponse.json(
          { error: 'Authentication required', redirect: '/auth/login', code: 'AUTH_REQUIRED' },
          { status: response.status }
        )
      }
      
      return NextResponse.json(
        { error: 'Backend request failed', details: errorText },
        { status: response.status }
      )
    }

    // BACKEND UPDATE: Handle 201 (new) vs 200 (duplicate) responses with message_seq
    const responseText = await response.text()
    let data
    try {
      if (!responseText || responseText.trim() === '') {
        // Empty response - should not happen with new backend implementation
        logger.warn('Empty response from unified chat backend', { 
          userId: user.id,
          clientMsgId,
          status: response.status 
        })
        return NextResponse.json({ success: true, queued: true })
      } else {
        data = JSON.parse(responseText)
      }
    } catch (parseError) {
      logger.error('Failed to parse unified chat response:', {
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        responseText: responseText.substring(0, 500),
        userId: user.id,
        clientMsgId
      })
      
      return NextResponse.json(
        { error: 'Invalid JSON response from backend' },
        { status: 502 }
      )
    }
    
    // BACKEND UPDATE: Log response type for monitoring idempotency
    logger.info('Unified chat response received:', {
      status: response.status,
      isNewMessage: response.status === 201,
      isDuplicate: response.status === 200,
      messageSeq: data.message_seq,
      clientMsgId,
      userId: user.id,
      buildMode: buildImmediately ? 'build' : 'plan'
    })
    
    return NextResponse.json(data)

  } catch (error) {
    logger.error('Unified chat API error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    })
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}