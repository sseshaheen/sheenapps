/**
 * Persistent Chat Presence API Route
 * Server-side proxy for backend presence system with HMAC authentication
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'

const PERSISTENT_CHAT_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081'

// CRITICAL: Prevent caching for real-time presence updates
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * POST /api/persistent-chat/presence
 * Update user presence status
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
    const { project_id, status, activity } = body

    if (!project_id || !status) {
      return NextResponse.json(
        { error: 'project_id and status are required' },
        { status: 400 }
      )
    }

    // Build request payload
    const payload = {
      project_id,
      status, // 'online', 'typing', 'away', 'offline'
      activity, // Optional activity description
      user_id: user.id
    }

    const path = `/v1/projects/${project_id}/chat/presence`
    const bodyStr = JSON.stringify(payload)
    
    // Generate dual signature headers (V1 + V2 for rollout compatibility)
    let authHeaders
    try {
      authHeaders = createWorkerAuthHeaders('POST', path, bodyStr)
    } catch (error) {
      return NextResponse.json(
        { error: 'Authentication setup failed', details: error.message },
        { status: 500 }
      )
    }

    // Get locale from request headers  
    const headersList = await headers()
    const acceptLanguage = headersList.get('accept-language')
    const locale = parseLocale(acceptLanguage) || 'en'

    // Proxy request to backend
    const response = await fetch(`${PERSISTENT_CHAT_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'x-sheen-locale': locale,
        'x-user-id': user.id,
        'x-user-type': 'client'
      },
      body: bodyStr
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Persistent chat presence API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        payload,
        userId: user.id
      })
      
      return NextResponse.json(
        { error: 'Backend request failed', details: errorText },
        { status: response.status }
      )
    }

    // Handle successful response
    const responseText = await response.text()
    let data
    try {
      if (!responseText || responseText.trim() === '') {
        data = { success: true } // Default for empty presence update response
      } else {
        data = JSON.parse(responseText)
      }
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON response from backend' },
        { status: 502 }
      )
    }
    
    return NextResponse.json(data)

  } catch (error) {
    logger.error('Persistent chat presence API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/persistent-chat/presence
 * Get presence information for project participants
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

    const path = `/v1/projects/${projectId}/chat/presence`
    const query = queryParams.toString()
    const pathWithQuery = `${path}?${query}`
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
        'x-user-id': user.id
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Persistent chat presence GET API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        projectId,
        userId: user.id
      })
      
      return NextResponse.json(
        { error: 'Backend request failed', details: errorText },
        { status: response.status }
      )
    }

    // Get response as text first to handle empty/malformed responses
    const responseText = await response.text()
    const contentType = response.headers.get('content-type') || 'unknown'
    
    logger.info('Backend presence GET response received:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      hasContent: !!responseText,
      contentLength: responseText.length,
      contentPreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
      projectId,
      userId: user.id
    })

    // Parse JSON safely with empty response handling
    let data
    try {
      if (!responseText || responseText.trim() === '') {
        logger.warn('Backend returned empty presence GET response body, using default', { projectId, userId: user.id })
        data = { participants: [] } // Default for empty presence response
      } else {
        data = JSON.parse(responseText)
        logger.info('Successfully parsed backend presence GET JSON response', { projectId, userId: user.id })
      }
    } catch (parseError) {
      logger.error('Failed to parse backend presence GET response as JSON:', {
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
    logger.error('Persistent chat presence GET API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
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