/**
 * Project Timeline API Route
 * Fetches timeline items (chat messages, builds, deployments) for a project
 * Supports pagination and filtering for infinite scroll
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkerClient } from '@/server/services/worker-api-client'
import { logger } from '@/utils/logger'
import { type TimelineQuery, type TimelineResponse } from '@/types/chat-plan'

/**
 * Handle GET requests for project timeline
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const { searchParams } = req.nextUrl

    // Parse query parameters
    const mode = searchParams.get('mode') as 'all' | 'plan' | 'build' || 'all'
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100) // Cap at 100
    const before = searchParams.get('before') || undefined
    const after = searchParams.get('after') || undefined

    // Validate project ID
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        {
          error: 'INVALID_PROJECT_ID',
          message: 'Valid project ID is required'
        },
        { status: 400 }
      )
    }

    logger.info('Fetching project timeline', {
      projectId: projectId.slice(0, 8),
      mode,
      offset,
      limit,
      hasBefore: !!before,
      hasAfter: !!after
    }, 'timeline')

    // Get worker client instance
    const workerClient = getWorkerClient()
    
    // Build query parameters for worker API
    const queryParams = new URLSearchParams({
      mode,
      offset: String(offset),
      limit: String(limit)
    })

    if (before) queryParams.set('before', before)
    if (after) queryParams.set('after', after)

    // Make request to worker service
    const timelineResponse = await workerClient.get<TimelineResponse>(
      `/v1/projects/${projectId}/timeline?${queryParams.toString()}`
    )

    logger.info('Timeline response received', {
      projectId: projectId.slice(0, 8),
      itemCount: timelineResponse.items.length,
      total: timelineResponse.total,
      hasMore: timelineResponse.hasMore,
      offset: timelineResponse.offset
    }, 'timeline')

    // Return successful response
    return NextResponse.json(timelineResponse, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, must-revalidate' // Timeline data should be fresh
      }
    })

  } catch (error) {
    // Handle different types of errors
    if (error instanceof Error) {
      logger.error('Timeline fetch failed', {
        error: error.message,
        stack: error.stack
      }, 'timeline')

      // Check for specific worker API errors
      if (error.message.includes('404') || error.message.includes('Not Found')) {
        return NextResponse.json(
          {
            error: 'PROJECT_NOT_FOUND',
            message: 'Project not found or access denied',
            code: 404
          },
          { status: 404 }
        )
      }

      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        return NextResponse.json(
          {
            error: 'AUTHENTICATION_FAILED',
            message: 'Authentication failed - invalid signature',
            code: 401
          },
          { status: 401 }
        )
      }

      if (error.message.includes('429') || error.message.includes('Rate limit')) {
        return NextResponse.json(
          {
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests - please wait before trying again',
            code: 429
          },
          { status: 429 }
        )
      }

      // Generic server error
      return NextResponse.json(
        {
          error: 'TIMELINE_FETCH_FAILED',
          message: `Failed to fetch timeline: ${error.message}`,
          code: 500
        },
        { status: 500 }
      )
    }

    // Unknown error type
    logger.error('Unknown error in timeline fetch', {
      error: String(error)
    }, 'timeline')

    return NextResponse.json(
      {
        error: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred while fetching timeline',
        details: String(error)
      },
      { status: 500 }
    )
  }
}

/**
 * Handle POST requests for adding timeline items (future feature)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  
  // For now, return not implemented
  return NextResponse.json(
    {
      error: 'NOT_IMPLEMENTED',
      message: 'Adding timeline items is not yet implemented',
      endpoint: `/api/projects/${projectId}/timeline`,
      supportedMethods: ['GET']
    },
    { status: 501 }
  )
}

/**
 * Handle OPTIONS requests for CORS
 */
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    }
  )
}

// Example response for documentation
export const dynamic = 'force-dynamic' // Ensure fresh timeline data

/*
Example timeline response:
{
  "items": [
    {
      "id": "timeline_123",
      "project_id": "proj_456",
      "timeline_seq": 1234567890,
      "item_type": "chat_message",
      "content": {
        "message": "How do I add dark mode?",
        "response": {
          "mode": "question",
          "answer": "To add dark mode...",
          "metadata": {
            "duration_ms": 2500,
            "tokens_used": 450,
            "billed_seconds": 3
          }
        }
      },
      "created_at": "2025-08-09T10:30:00Z",
      "is_visible": true
    },
    {
      "id": "timeline_124", 
      "project_id": "proj_456",
      "timeline_seq": 1234567891,
      "item_type": "build_event",
      "content": {
        "build_id": "build_789",
        "event_type": "started",
        "message": "Starting build process..."
      },
      "created_at": "2025-08-09T10:35:00Z",
      "is_visible": true
    }
  ],
  "total": 42,
  "offset": 0,
  "limit": 50,
  "hasMore": false
}
*/