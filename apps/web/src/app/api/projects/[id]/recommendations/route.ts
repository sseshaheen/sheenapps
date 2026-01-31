import { NextRequest, NextResponse } from 'next/server'
import { makeUserCtx } from '@/lib/db'
import { createServerTiming } from '@/lib/server-timing'
import { logger } from '@/utils/logger'
import type {
  ProjectRecommendation,
  ProjectRecommendationsResponse
} from '@/types/project-recommendations'

// Ensure this API route is always dynamic and never cached
export const dynamic = 'force-dynamic'

// Project ID format validation - accepts both ULID and UUID
// ULID: 26 chars, Crockford Base32 (excludes I, L, O, U)
// UUID: 36 chars with hyphens (8-4-4-4-12 format)
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidProjectId(id: string | null | undefined): boolean {
  if (!id) return false
  return ULID_RE.test(id) || UUID_RE.test(id)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timing = createServerTiming()

  try {
    const { id: projectId } = await params
    const { searchParams } = new URL(request.url)
    const buildId = searchParams.get('buildId')

    // Validate projectId format (ULID or UUID)
    if (!isValidProjectId(projectId)) {
      logger.error('❌ Invalid projectId format:', { projectId })
      return NextResponse.json({
        success: false,
        error: 'Invalid projectId format',
        projectId: projectId || '',
        recommendations: []
      } as ProjectRecommendationsResponse, { status: 400, headers: timing.getHeaders() })
    }

    // Use authenticated client with RLS - derives userId from session
    timing.start('auth')
    const userCtx = await makeUserCtx()
    const { data: { user }, error: authError } = await userCtx.client.auth.getUser()
    timing.end('auth')

    if (authError || !user) {
      logger.error('❌ User not authenticated')
      return NextResponse.json({
        success: false,
        error: 'Authentication required',
        projectId,
        recommendations: []
      } as ProjectRecommendationsResponse, { status: 401, headers: timing.getHeaders() })
    }

    const userId = user.id

    logger.info('🎯 RECOMMENDATIONS REQUEST:', {
      projectId: projectId.slice(0, 8),
      userId: userId.slice(0, 8),
      buildId: buildId?.slice(0, 8),
      timestamp: new Date().toISOString()
    })

    // Build query - filter by buildId if provided for precise correlation
    // Always use order + limit + maybeSingle for defensive stability
    // (handles edge cases like duplicate rows without throwing)
    timing.start('db')
    let query = userCtx.client
      .from('project_recommendations')
      .select('recommendations, created_at, build_id')
      .eq('project_id', projectId)
      .eq('user_id', userId)

    // If buildId provided, filter by it for precise correlation
    // Otherwise fall back to latest recommendations for the project
    if (buildId) {
      query = query.eq('build_id', buildId)
    }

    // Always order by created_at desc and limit to 1 for defensive stability
    // This handles edge cases like duplicate rows without throwing
    const { data: recommendationData, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    timing.end('db')

    if (error) {
      logger.error('❌ Database query failed:', {
        error: error.message,
        code: error.code,
        projectId: projectId.slice(0, 8)
      })

      return NextResponse.json({
        success: false,
        error: 'Database query failed',
        projectId,
        recommendations: []
      } as ProjectRecommendationsResponse, { status: 500, headers: timing.getHeaders() })
    }

    // maybeSingle() returns null when no rows found (not an error)
    if (!recommendationData) {
      logger.info('📝 No recommendations found for project:', {
        projectId: projectId.slice(0, 8),
        userId: userId.slice(0, 8),
        buildId: buildId?.slice(0, 8)
      })

      return NextResponse.json({
        success: true,
        projectId,
        recommendations: []
      } as ProjectRecommendationsResponse, { headers: timing.getHeaders() })
    }

    logger.info('✅ Recommendations query successful:', {
      projectId: projectId.slice(0, 8),
      hasRecommendations: !!recommendationData?.recommendations,
      recommendationsCount: Array.isArray(recommendationData?.recommendations) 
        ? recommendationData.recommendations.length 
        : 0
    })

    // Parse and validate recommendations
    let recommendations: ProjectRecommendation[] = []
    
    if (recommendationData?.recommendations) {
      try {
        // Handle both string and object formats
        const parsedRecommendations = typeof recommendationData.recommendations === 'string'
          ? JSON.parse(recommendationData.recommendations)
          : recommendationData.recommendations
          
        // Ensure it's an array
        if (Array.isArray(parsedRecommendations)) {
          recommendations = parsedRecommendations.map((rec, index) => ({
            id: rec.id || index + 1,
            title: rec.title || 'Untitled Recommendation',
            description: rec.description || 'No description available',
            category: rec.category || 'features',
            priority: rec.priority || 'medium',
            complexity: rec.complexity || 'medium',
            impact: rec.impact || 'medium',
            versionHint: rec.versionHint || 'patch',
            prompt: rec.prompt || rec.title || 'Untitled Recommendation'
          }))
        }
      } catch (parseError) {
        logger.warn('⚠️ Failed to parse recommendations JSON:', {
          projectId: projectId.slice(0, 8),
          error: parseError instanceof Error ? parseError.message : String(parseError)
        })
      }
    }

    const response: ProjectRecommendationsResponse = {
      success: true,
      projectId,
      recommendations
    }

    logger.info('🎯 RECOMMENDATIONS RESPONSE:', {
      projectId: projectId.slice(0, 8),
      recommendationsCount: recommendations.length,
      categories: [...new Set(recommendations.map(r => r.category))],
      priorities: [...new Set(recommendations.map(r => r.priority))],
      timestamp: new Date().toISOString()
    })

    return NextResponse.json(response, { headers: timing.getHeaders() })

  } catch (error) {
    logger.error('❌ Project recommendations API error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      projectId: '',
      recommendations: []
    } as ProjectRecommendationsResponse, { status: 500, headers: timing.getHeaders() })
  }
}