/**
 * Project Matches API Route
 *
 * Following CLAUDE.md patterns:
 * - Triple-layer cache prevention
 * - RLS-based authentication
 * - Consistent route structure (/api/projects/[id]/*)
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
 * GET /api/advisor-matching/projects/[projectId]/matches
 * Get all match requests for a specific project
 */
export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const correlationId = uuidv4()
  const { projectId } = params

  try {
    // ✅ CLAUDE.md: RLS-based authentication
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return noCacheErrorResponse('Unauthorized', 401)
    }

    if (!projectId) {
      return noCacheErrorResponse('Project ID is required', 400)
    }

    // Verify project ownership via RLS
    // Note: projects table uses owner_id, not user_id
    const { data: project } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .eq('owner_id', user.id)
      .single()

    if (!project) {
      logger.warn('Project matches: Project not found or access denied', {
        correlationId,
        projectId,
        userId: user.id
      })
      return noCacheErrorResponse('Project not found', 404)
    }

    // Get all match requests for this project
    // Note: Column mapping - code uses suggested_advisor_id, DB has matched_advisor_id
    const { data: matches, error: queryError } = await supabase
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
      .eq('project_id', projectId)
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false })

    if (queryError) {
      logger.error('Project matches: Query failed', {
        correlationId,
        error: queryError.message,
        projectId,
        userId: user.id
      })
      return noCacheErrorResponse('Failed to fetch matches', 500)
    }

    logger.info('Project matches fetched successfully', {
      correlationId,
      projectId,
      userId: user.id,
      matchCount: matches?.length || 0
    })

    // Transform response to maintain backward compatibility with frontend
    // Frontend expects suggested_advisor_id, DB has matched_advisor_id
    const transformedMatches = (matches || []).map(match => ({
      ...match,
      suggested_advisor_id: match.matched_advisor_id, // Alias for frontend compatibility
      user_id: user.id // Add user_id for compatibility
    }))

    return noCacheResponse({
      matches: transformedMatches,
      project_id: projectId,
      total: transformedMatches.length
    })

  } catch (error) {
    logger.error('Project matches: Unexpected error', {
      correlationId,
      projectId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return noCacheErrorResponse('Internal server error', 500)
  }
}