/**
 * Persistent Chat Read Status API Route
 * Server-side proxy for backend read status tracking with HMAC authentication
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'

const PERSISTENT_CHAT_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081'

// CRITICAL: Prevent caching for real-time read status tracking
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * PUT /api/persistent-chat/read  
 * Mark messages as read up to a specific sequence number
 * UPDATED: Backend uses PUT method, not POST
 */
export async function PUT(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body with proper error handling
    let body: any
    try {
      const bodyText = await request.text()
      if (!bodyText || bodyText.trim() === '') {
        return NextResponse.json(
          { error: 'Request body is empty' },
          { status: 400 }
        )
      }
      body = JSON.parse(bodyText)
    } catch (jsonError) {
      logger.error('Persistent chat read - invalid JSON:', {
        error: jsonError instanceof Error ? jsonError.message : String(jsonError),
        userId: user.id,
        timestamp: new Date().toISOString()
      })
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { project_id, read_up_to_seq } = body

    // Validate required fields and data types
    if (!project_id || typeof project_id !== 'string') {
      return NextResponse.json(
        { error: 'project_id is required and must be a string' },
        { status: 400 }
      )
    }

    if (read_up_to_seq === undefined || read_up_to_seq === null) {
      return NextResponse.json(
        { error: 'read_up_to_seq is required' },
        { status: 400 }
      )
    }

    // Validate read_up_to_seq is a valid number
    const seqNumber = Number(read_up_to_seq)
    if (isNaN(seqNumber) || seqNumber < 0) {
      return NextResponse.json(
        { error: 'read_up_to_seq must be a valid non-negative number' },
        { status: 400 }
      )
    }

    // Build request payload with validated data
    // UPDATED: Backend expects "up_to_seq", not "read_up_to_seq"
    const payload = {
      project_id,
      up_to_seq: seqNumber,
      user_id: user.id
    }

    const path = `/v1/projects/${project_id}/chat/read`
    const bodyStr = JSON.stringify(payload)
    
    // Generate dual signature headers (V1 + V2 for rollout compatibility)
    const authHeaders = createWorkerAuthHeaders('PUT', path, bodyStr)

    // Get locale from request headers
    const headersList = await headers()
    const acceptLanguage = headersList.get('accept-language')
    const locale = parseLocale(acceptLanguage) || 'en'

    // Proxy request to backend  
    const response = await fetch(`${PERSISTENT_CHAT_BASE_URL}${path}`, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'x-sheen-locale': locale,
        'x-user-id': user.id,
        'Authorization': `Bearer ${user.id}`
      },
      body: bodyStr
    })

    // Get response as text first to handle empty/malformed responses
    const responseText = await response.text()
    const contentType = response.headers.get('content-type') || 'unknown'
    
    logger.info('Backend response received:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      hasContent: !!responseText,
      contentLength: responseText.length,
      contentPreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
      userId: user.id
    })

    if (!response.ok) {
      logger.error('Backend request failed:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
        payload,
        userId: user.id
      })
      
      return NextResponse.json(
        { error: 'Backend request failed', details: responseText || `${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    // Parse JSON safely with empty response handling
    let data
    try {
      if (!responseText || responseText.trim() === '') {
        logger.warn('Backend returned empty response body, using default', { userId: user.id })
        data = { success: true } // Default for empty successful response
      } else {
        data = JSON.parse(responseText)
        logger.info('Successfully parsed backend JSON response', { userId: user.id })
      }
    } catch (parseError) {
      logger.error('Failed to parse backend response as JSON:', {
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        responseText: responseText.substring(0, 500),
        contentType,
        userId: user.id
      })
      
      return NextResponse.json(
        { error: 'Invalid JSON response from backend', details: 'Backend returned malformed JSON' },
        { status: 502 }
      )
    }

    return NextResponse.json(data)

  } catch (error) {
    logger.error('Persistent chat read status API error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    })
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/persistent-chat/read
 * Get read status information for project participants
 * UPDATED: Calls backend /chat/unread endpoint to get unread message info
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('project_id')
    
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    // Build query string (project_id is already in the URL path)
    const queryParams = new URLSearchParams()

    const path = `/v1/projects/${projectId}/chat/unread`
    const query = queryParams.toString()
    const pathWithQuery = query ? `${path}?${query}` : path
    const body = ''
    
    // Generate dual signature headers (V1 + V2 for rollout compatibility)
    const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, body)

    // Get locale from request headers
    const headersList = await headers()
    const acceptLanguage = headersList.get('accept-language')
    const locale = parseLocale(acceptLanguage) || 'en'

    // Proxy request to backend
    const response = await fetch(`${PERSISTENT_CHAT_BASE_URL}${pathWithQuery}`, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'x-sheen-locale': locale,
        'x-user-id': user.id,
        'Authorization': `Bearer ${user.id}`
      }
    })

    // Get response as text first to handle empty/malformed responses (same pattern as PUT)
    const responseText = await response.text()
    const contentType = response.headers.get('content-type') || 'unknown'
    
    logger.info('Backend GET response received:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      hasContent: !!responseText,
      contentLength: responseText.length,
      contentPreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
      projectId,
      userId: user.id
    })

    if (!response.ok) {
      logger.error('Backend GET request failed:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
        projectId,
        userId: user.id
      })
      
      return NextResponse.json(
        { error: 'Backend request failed', details: responseText || `${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    // Parse JSON safely with empty response handling (same pattern as PUT)
    let data
    try {
      if (!responseText || responseText.trim() === '') {
        logger.warn('Backend returned empty GET response body, using default', { projectId, userId: user.id })
        data = { read_statuses: [] } // Default for empty unread status response
      } else {
        data = JSON.parse(responseText)
        logger.info('Successfully parsed backend GET JSON response', { projectId, userId: user.id })
      }
    } catch (parseError) {
      logger.error('Failed to parse backend GET response as JSON:', {
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        responseText: responseText.substring(0, 500),
        contentType,
        projectId,
        userId: user.id
      })
      
      return NextResponse.json(
        { error: 'Invalid JSON response from backend', details: 'Backend returned malformed JSON' },
        { status: 502 }
      )
    }

    return NextResponse.json(data)

  } catch (error) {
    logger.error('Persistent chat read status GET API error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      projectId: request.nextUrl.searchParams.get('project_id'),
      timestamp: new Date().toISOString()
    })
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

/**
 * Parse Accept-Language header to extract locale
 */
function parseLocale(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null
  
  const locales = acceptLanguage.split(',').map(lang => {
    const [locale] = lang.trim().split(';')
    return locale.toLowerCase()
  })
  
  // Convert to base locale for backend compatibility  
  for (const locale of locales) {
    const base = locale.split('-')[0]
    const supportedBaseLocales = ['en', 'ar', 'fr', 'es', 'de']
    if (supportedBaseLocales.includes(base)) {
      return base
    }
  }
  
  return 'en'
}