/**
 * Persistent Chat Search API Route
 * Server-side proxy for backend message search with HMAC authentication
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'

const PERSISTENT_CHAT_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081'

// CRITICAL: Prevent caching for dynamic search results
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/persistent-chat/search
 * Search messages in a project with text query
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
    const query = searchParams.get('q')
    const messageType = searchParams.get('message_type') // 'user', 'assistant', 'system'
    const limit = searchParams.get('limit') || '20'
    const offset = searchParams.get('offset') || '0'
    
    if (!projectId || !query) {
      return NextResponse.json(
        { error: 'project_id and q (query) are required' },
        { status: 400 }
      )
    }

    // Build query string (project_id is already in the URL path)
    const queryParams = new URLSearchParams({
      q: query,
      limit,
      offset
    })
    if (messageType) queryParams.set('message_type', messageType)

    const path = `/v1/projects/${projectId}/chat/search`
    const queryStr = queryParams.toString()
    const pathWithQuery = `${path}?${queryStr}`
    
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
      logger.error('Persistent chat search API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        projectId,
        query,
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
    
    logger.info('Backend search response received:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      hasContent: !!responseText,
      contentLength: responseText.length,
      contentPreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
      projectId,
      query,
      userId: user.id
    })

    // Parse JSON safely with empty response handling
    let data
    try {
      if (!responseText || responseText.trim() === '') {
        logger.warn('Backend returned empty search response body, using default', { projectId, query, userId: user.id })
        data = { messages: [], total_count: 0, query } // Default for empty search response
      } else {
        data = JSON.parse(responseText)
        logger.info('Successfully parsed backend search JSON response', { projectId, query, userId: user.id })
      }
    } catch (parseError) {
      logger.error('Failed to parse backend search response as JSON:', {
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        responseText: responseText.substring(0, 500),
        contentType,
        projectId,
        query,
        userId: user.id
      })
      
      return NextResponse.json(
        { error: 'Invalid JSON response from backend', details: 'Backend returned malformed JSON' },
        { status: 502 }
      )
    }
    
    return NextResponse.json(data)

  } catch (error) {
    logger.error('Persistent chat search API error:', error)
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