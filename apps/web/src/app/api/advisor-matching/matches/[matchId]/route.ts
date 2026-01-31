/**
 * Individual Match Status API Route
 *
 * Following CLAUDE.md patterns:
 * - Triple-layer cache prevention
 * - RLS-based authentication
 * - ETag support for conditional requests
 */

import { NextRequest } from 'next/server'
import 'server-only'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// ✅ CLAUDE.md: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/advisor-matching/matches/[matchId]
 * Get details for a specific match request
 */
export async function GET(request: NextRequest, props: { params: Promise<{ matchId: string }> }) {
  const params = await props.params;
  const correlationId = uuidv4()
  const { matchId } = params

  try {
    // ✅ CLAUDE.md: RLS-based authentication
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return noCacheErrorResponse('Unauthorized', 401)
    }

    if (!matchId) {
      return noCacheErrorResponse('Match ID is required', 400)
    }

    // Get match request with RLS-based access control
    // Note: DB uses matched_advisor_id and requested_by instead of suggested_advisor_id and user_id
    const { data: match, error: queryError } = await supabase
      .from('advisor_match_requests')
      .select(`
        id,
        project_id,
        status,
        matched_advisor_id,
        match_criteria,
        match_score,
        match_reason,
        scoring_features,
        expires_at,
        created_at,
        updated_at
      `)
      .eq('id', matchId)
      .eq('requested_by', user.id)
      .single()

    if (queryError || !match) {
      logger.warn('Match status: Match not found or access denied', {
        correlationId,
        matchId,
        userId: user.id,
        error: queryError?.message
      })
      return noCacheErrorResponse('Match not found', 404)
    }

    // Add server timestamp and transform for frontend compatibility
    const response = {
      ...match,
      suggested_advisor_id: match.matched_advisor_id, // Alias for frontend
      user_id: user.id, // Add for compatibility
      server_timestamp: Date.now(),
      _etag: `"${match.updated_at}"`
    }

    logger.debug('api', 'Match status fetched successfully', {
      correlationId,
      matchId,
      status: match.status,
      userId: user.id
    })

    return noCacheResponse(response, {
      headers: {
        // Add ETag header for caching
        'ETag': response._etag
      }
    })

  } catch (error) {
    logger.error('Match status: Unexpected error', {
      correlationId,
      matchId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return noCacheErrorResponse('Internal server error', 500)
  }
}