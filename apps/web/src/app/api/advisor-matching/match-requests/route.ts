/**
 * Match Requests API Route
 *
 * Following CLAUDE.md patterns:
 * - Triple-layer cache prevention
 * - RLS-based authentication with makeUserCtx()
 * - HMAC worker authentication
 * - Comprehensive error handling with correlation tracking
 */

import { NextRequest } from 'next/server'
import 'server-only'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
// Note: RLS-based auth is provided by createServerSupabaseClientNew() below
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'
import type { MatchCriteria } from '@/types/advisor-matching'

// ✅ CLAUDE.md: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * POST /api/advisor-matching/match-requests
 * Create a new match request
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('X-Correlation-Id') || uuidv4()

  try {
    // ✅ CLAUDE.md: RLS-based authentication
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Match request: Authentication failed', {
        correlationId,
        authError: authError?.message
      })
      return noCacheErrorResponse('Unauthorized', 401)
    }

    // Parse request body
    const body = await request.json()
    const { project_id, match_criteria } = body as {
      project_id: string
      match_criteria: MatchCriteria
    }

    if (!project_id || !match_criteria) {
      return noCacheErrorResponse('Missing required fields', 400)
    }

    // Parallelize project verification and existing match check for better TTFB
    const [projectResult, existingMatchResult] = await Promise.all([
      // Verify project access via RLS (projects table uses owner_id, not user_id)
      supabase
        .from('projects')
        .select('id, title, framework, owner_id')
        .eq('id', project_id)
        .eq('owner_id', user.id)
        .single(),
      // Check for existing active match
      supabase
        .from('advisor_match_requests')
        .select('id, status')
        .eq('project_id', project_id)
        .in('status', ['pending', 'matched'])
        .single()
    ])

    const { data: project } = projectResult
    const { data: existingMatch } = existingMatchResult

    if (!project) {
      logger.warn('Match request: Project not found or access denied', {
        correlationId,
        projectId: project_id,
        userId: user.id
      })
      return noCacheErrorResponse('Project not found', 404)
    }

    if (existingMatch) {
      logger.info('Match request: Conflict with existing match', {
        correlationId,
        projectId: project_id,
        existingMatchId: existingMatch.id,
        existingStatus: existingMatch.status
      })
      return noCacheErrorResponse('Another match request is already in progress', 409)
    }

    // Create match request in database
    // Note: DB uses requested_by instead of user_id
    const matchRequest = {
      id: uuidv4(),
      project_id,
      requested_by: user.id,
      status: 'pending' as const,
      match_criteria,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { error: insertError } = await supabase
      .from('advisor_match_requests')
      .insert([matchRequest])

    if (insertError) {
      logger.error('Match request: Database insert failed', {
        correlationId,
        error: insertError.message,
        projectId: project_id
      })
      return noCacheErrorResponse('Failed to create match request', 500)
    }

    // Trigger worker API for intelligent matching
    try {
      const workerPayload = {
        match_request_id: matchRequest.id,
        project: {
          id: project.id,
          title: project.title,
          framework: project.framework
        },
        criteria: match_criteria,
        user_context: {
          user_id: user.id,
          email: user.email
        }
      }

      const workerBody = JSON.stringify(workerPayload)
      const workerPath = '/api/v1/advisor-matching/create-match'

      const workerHeaders = createWorkerAuthHeaders('POST', workerPath, workerBody, {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId
      })

      const workerResponse = await fetch(
        `${process.env.WORKER_BASE_URL}${workerPath}`,
        {
          method: 'POST',
          headers: workerHeaders,
          body: workerBody
        }
      )

      if (!workerResponse.ok) {
        logger.warn('Match request: Worker API call failed', {
          correlationId,
          status: workerResponse.status,
          matchId: matchRequest.id
        })
        // Don't fail the request - worker will process asynchronously
      } else {
        logger.info('Match request: Worker notified successfully', {
          correlationId,
          matchId: matchRequest.id
        })
      }
    } catch (workerError) {
      logger.warn('Match request: Worker notification failed', {
        correlationId,
        error: workerError instanceof Error ? workerError.message : 'Unknown error',
        matchId: matchRequest.id
      })
      // Continue - worker can pick up pending matches
    }

    logger.info('Match request created successfully', {
      correlationId,
      matchId: matchRequest.id,
      projectId: project_id,
      userId: user.id
    })

    // ✅ CLAUDE.md: Use cache-busting response helper
    return noCacheResponse({
      success: true,
      match_id: matchRequest.id,
      status: 'pending',
      correlation_id: correlationId
    })

  } catch (error) {
    logger.error('Match request: Unexpected error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return noCacheErrorResponse('Internal server error', 500)
  }
}

/**
 * GET /api/advisor-matching/match-requests
 * List match requests for the current user
 */
export async function GET(request: NextRequest) {
  const correlationId = uuidv4()

  try {
    // ✅ CLAUDE.md: RLS-based authentication
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return noCacheErrorResponse('Unauthorized', 401)
    }

    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('project_id')
    const status = searchParams.get('status')

    // Note: DB uses matched_advisor_id and requested_by
    let query = supabase
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
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false })

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: matches, error: queryError } = await query

    if (queryError) {
      logger.error('Match requests: Query failed', {
        correlationId,
        error: queryError.message,
        userId: user.id
      })
      return noCacheErrorResponse('Failed to fetch matches', 500)
    }

    logger.info('Match requests fetched successfully', {
      correlationId,
      userId: user.id,
      matchCount: matches?.length || 0,
      projectId,
      status
    })

    // Transform for frontend compatibility (expects suggested_advisor_id)
    const transformedMatches = (matches || []).map(match => ({
      ...match,
      suggested_advisor_id: match.matched_advisor_id,
      user_id: user.id
    }))

    return noCacheResponse({
      matches: transformedMatches,
      total: transformedMatches.length
    })

  } catch (error) {
    logger.error('Match requests: Unexpected error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return noCacheErrorResponse('Internal server error', 500)
  }
}