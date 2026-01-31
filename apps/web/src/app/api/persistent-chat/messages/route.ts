/**
 * Persistent Chat Messages API Route
 * Server-side proxy for backend chat messages with HMAC authentication
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { getLocaleFromRequest } from '@/lib/persistent-chat-server-utils'
import { logger } from '@/utils/logger'

const PERSISTENT_CHAT_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081'

// CRITICAL: Prevent caching for real-time chat messages
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/persistent-chat/messages
 * Fetch message history with pagination
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
    const before = searchParams.get('before')
    const limit = searchParams.get('limit') || '50'
    
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    // Build query string (project_id is already in the URL path)
    const queryParams = new URLSearchParams({
      limit
    })
    if (before) queryParams.set('before', before)

    const path = `/v1/projects/${projectId}/chat/messages`
    const query = queryParams.toString()
    const pathWithQuery = `${path}?${query}`
    
    const body = ''
    
    // Generate dual signature headers (V1 + V2 for rollout compatibility)
    const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, body)

    // EXPERT FIX: Use proper locale handling instead of parseLocale
    const locale = await getLocaleFromRequest(request) // Preserves ar-eg, fr-ma

    // TEMPORARY: Skip database fallback and go directly to worker backend for now
    logger.info('Skipping database fallback, going directly to worker backend', {
      projectId,
      userId: user.id
    })
    
    try {
      
      // If database fallback fails, try the worker backend
      const response = await fetch(`${PERSISTENT_CHAT_BASE_URL}${pathWithQuery}`, {
        method: 'GET',
        headers: {
          ...authHeaders,                // HMAC authentication only
          'x-sheen-locale': locale,      // Full BCP-47 locale preserved
          'x-user-id': user.id           // User context
          // EXPERT FIX: Removed Authorization: Bearer ${user.id} - not a proper token
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Persistent chat messages API error:', {
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
      
      logger.info('Backend response received:', {
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
          logger.warn('Backend returned empty response body, using default', { projectId, userId: user.id })
          data = { messages: [], pagination: { has_more_older: false } } // Default for empty message response
        } else {
          data = JSON.parse(responseText)
          logger.info('Successfully parsed backend JSON response', { projectId, userId: user.id })
        }
      } catch (parseError) {
        logger.error('Failed to parse backend response as JSON:', {
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
      
      // Debug: Log backend data structure
      logger.info('Backend message data received:', {
        messageCount: data.messages?.length || 0,
        sampleMessage: data.messages?.[0] ? {
          id: data.messages[0].id,
          seq: data.messages[0].seq,
          messageType: data.messages[0].message?.type,
          hasText: !!data.messages[0].message?.text
        } : 'No messages',
        pagination: data.pagination
      })
      
      // Transform backend data format to frontend-expected format
      const transformedData = transformMessagesResponse(data)
      
      // Debug: Log transformed data structure
      logger.info('Transformed message data:', {
        messageCount: transformedData.messages?.length || 0,
        sampleTransformed: transformedData.messages?.[0] ? {
          id: transformedData.messages[0].id,
          seq: transformedData.messages[0].seq,
          text: transformedData.messages[0].text?.substring(0, 50) + '...',
          messageType: transformedData.messages[0].message_type
        } : 'No messages'
      })
      
      return NextResponse.json(transformedData)
    } catch (error) {
      logger.error('Persistent chat messages API error (worker backend):', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        projectId,
        userId: user.id
      })
      return NextResponse.json(
        { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      )
    }

  } catch (error) {
    logger.error('Persistent chat messages API error:', {
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
 * POST /api/persistent-chat/messages
 * Send a new message (team or AI)
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
    const { project_id, text, message_type = 'user', target = 'team', client_msg_id, mode = 'unified' } = body

    if (!project_id || !text) {
      return NextResponse.json(
        { error: 'project_id and text are required' },
        { status: 400 }
      )
    }

    // Generate client_msg_id if not provided
    const clientMsgId = client_msg_id || `client_${Date.now()}_${Math.random().toString(36).slice(2)}`

    // Build request payload
    const payload = {
      project_id,
      text,
      message_type,
      target,
      client_msg_id: clientMsgId,
      mode, // EXPERT FIX: Include mode field for backend compatibility
      user_id: user.id
    }

    const path = `/v1/projects/${project_id}/chat/messages`
    const bodyStr = JSON.stringify(payload)
    
    // Generate dual signature headers (V1 + V2 for rollout compatibility)
    const authHeaders = createWorkerAuthHeaders('POST', path, bodyStr)

    // EXPERT FIX: Use proper locale handling instead of parseLocale  
    const locale = await getLocaleFromRequest(request) // Preserves ar-eg, fr-ma

    // Proxy request to backend
    const response = await fetch(`${PERSISTENT_CHAT_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...authHeaders,                // HMAC authentication only  
        'x-sheen-locale': locale,      // Full BCP-47 locale preserved
        'x-user-id': user.id           // User context
        // EXPERT FIX: Removed Authorization: Bearer ${user.id} - not a proper token
      },
      body: bodyStr
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Persistent chat send message API error:', {
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

    // Get response as text first to handle empty/malformed responses
    const responseText = await response.text()
    const contentType = response.headers.get('content-type') || 'unknown'
    
    logger.info('Backend POST response received:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      hasContent: !!responseText,
      contentLength: responseText.length,
      contentPreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
      userId: user.id
    })

    // Parse JSON safely with empty response handling
    let data
    try {
      if (!responseText || responseText.trim() === '') {
        logger.warn('Backend returned empty POST response body, using default', { userId: user.id })
        data = { success: true, message: { id: clientMsgId, seq: -1 } } // Default for empty send response
      } else {
        data = JSON.parse(responseText)
        logger.info('Successfully parsed backend POST JSON response', { userId: user.id })
      }
    } catch (parseError) {
      logger.error('Failed to parse backend POST response as JSON:', {
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
    logger.error('Persistent chat send message API error:', error)
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

/**
 * Transform backend message format to frontend-expected format
 */
function transformMessagesResponse(backendData: any): any {
  if (!backendData || !backendData.messages) {
    logger.warn('transformMessagesResponse: No messages in backend data', { backendData })
    return backendData
  }

  logger.info('transformMessagesResponse: Starting transformation', {
    messageCount: backendData.messages.length,
    firstMessageId: backendData.messages[0]?.id
  })

  const transformedMessages = backendData.messages.map((msg: any) => {
    // Extract text from nested JSON structure
    let messageText = msg.message?.text || ''
    
    // Handle JSON-encoded text in assistant messages
    if (msg.message?.type === 'assistant' && messageText.startsWith('{')) {
      try {
        const parsed = JSON.parse(messageText)
        messageText = parsed.message || messageText
      } catch {
        // If parsing fails, use the original text
      }
    }

    // Transform to expected frontend format
    return {
      id: msg.id,
      seq: parseInt(msg.seq, 10), // Convert string to number
      project_id: msg.projectId,
      user_id: msg.user?.id,
      message_type: msg.message?.type || 'user',
      text: messageText,
      target: 'team', // Default target
      created_at: msg.message?.timestamp,
      updated_at: msg.message?.timestamp,
      client_msg_id: msg.client_msg_id,
      // Include additional backend data for reference
      _backend_data: {
        user: msg.user,
        plan: msg.plan,
        thread: msg.thread,
        metadata: msg.metadata,
        isDeleted: msg.isDeleted,
        editedAt: msg.editedAt,
        visibility: msg.visibility
      }
    }
  })

  return {
    messages: transformedMessages,
    has_more: backendData.pagination?.has_more_older || false,
    next_before: backendData.pagination?.end_seq,
    total_count: transformedMessages.length,
    // Include original pagination info
    pagination: backendData.pagination
  }
}