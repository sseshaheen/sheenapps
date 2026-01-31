import { NextRequest, NextResponse } from 'next/server'

/**
 * Legacy Build Events API - Redirect to new clean events API
 * This provides backward compatibility while transitioning to clean events
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ buildId: string }> }
) {
  try {
    const params = await context.params
    const buildId = params.buildId
    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor') || '1970-01-01T00:00:00Z'

    // For now, return empty events array to prevent 404 errors
    // In production, you might want to redirect to the new endpoint
    const response = {
      events: [],
      nextCursor: cursor,
      hasNext: false,
      metadata: {
        buildId,
        queryTime: new Date().toISOString(),
        eventsCount: 0,
        message: 'Legacy endpoint - no events available. Use /api/builds/[buildId]/events with clean events API.'
      }
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Error in legacy build events API:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        events: [],
        nextCursor: '1970-01-01T00:00:00Z',
        hasNext: false
      },
      { status: 500 }
    )
  }
}