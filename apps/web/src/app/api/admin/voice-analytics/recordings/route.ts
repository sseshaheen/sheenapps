/**
 * Voice Recordings List API
 *
 * Lists voice recordings with filtering, sorting, and pagination.
 * Used by admin panel to browse and manage voice input data.
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface VoiceRecording {
  id: string
  user_id: string
  user_email: string | null
  project_id: string | null
  source: 'hero' | 'project' | null
  client_recording_id: string | null
  audio_url: string
  audio_format: string
  duration_seconds: number | null
  file_size_bytes: number | null
  transcription: string
  detected_language: string | null
  confidence_score: number | null
  provider: string
  model_version: string | null
  processing_duration_ms: number | null
  cost_usd: number | null
  input_tokens: number | null  // Token count for cost transparency (Phase 2)
  message_id: string | null
  created_at: string
  // Moderation fields (Phase 3)
  flagged_at: string | null
  flagged_by: string | null
  flag_reason: string | null
  deleted_at: string | null
  deleted_by: string | null
}

interface RecordingsResponse {
  recordings: VoiceRecording[]
  total_count: number
  page: number
  page_size: number
  has_more: boolean
}

export async function GET(request: NextRequest) {
  // Permission check: voice_analytics.read
  const { session, error } = await requireAdmin('voice_analytics.read')
  if (error) return error

  const { searchParams } = new URL(request.url)

  // Pagination
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = Math.min(parseInt(searchParams.get('page_size') || '50'), 100)
  const offset = (page - 1) * pageSize

  // Filters
  const userId = searchParams.get('user_id')
  const projectId = searchParams.get('project_id')
  const source = searchParams.get('source') // 'hero' | 'project'
  const language = searchParams.get('language')
  const minDuration = searchParams.get('min_duration') ? parseInt(searchParams.get('min_duration')!) : null
  const maxDuration = searchParams.get('max_duration') ? parseInt(searchParams.get('max_duration')!) : null
  const minCost = searchParams.get('min_cost') ? parseFloat(searchParams.get('min_cost')!) : null
  const maxCost = searchParams.get('max_cost') ? parseFloat(searchParams.get('max_cost')!) : null
  const lowConfidence = searchParams.get('low_confidence') === 'true' // confidence < 0.7
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  // Moderation filters (Phase 3)
  const flaggedOnly = searchParams.get('flagged') === 'true' // only show flagged recordings
  const includeDeleted = searchParams.get('include_deleted') === 'true' // include soft-deleted recordings

  // Sorting
  const sortBy = searchParams.get('sort_by') || 'created_at'
  const sortOrder = searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc'

  try {
    const supabase = await createServerSupabaseClientNew()

    // Build query
    let query = supabase
      .from('voice_recordings')
      .select('*', { count: 'exact' })

    // Apply filters
    if (userId) query = query.eq('user_id', userId)
    if (projectId) query = query.eq('project_id', projectId)
    if (source) query = query.eq('source', source)
    if (language) query = query.eq('detected_language', language)
    if (minDuration !== null) query = query.gte('duration_seconds', minDuration)
    if (maxDuration !== null) query = query.lte('duration_seconds', maxDuration)
    if (minCost !== null) query = query.gte('cost_usd', minCost)
    if (maxCost !== null) query = query.lte('cost_usd', maxCost)
    if (lowConfidence) query = query.lt('confidence_score', 0.7)
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo)
    // Moderation filters (Phase 3)
    if (flaggedOnly) query = query.not('flagged_at', 'is', null)
    if (!includeDeleted) query = query.is('deleted_at', null) // Default: exclude deleted

    // Apply sorting
    const validSortColumns = [
      'created_at',
      'duration_seconds',
      'cost_usd',
      'confidence_score',
      'processing_duration_ms'
    ]
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at'
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' })

    // Apply pagination
    query = query.range(offset, offset + pageSize - 1)

    const { data, count, error: queryError } = await query

    if (queryError) {
      logger.error('Failed to fetch voice recordings', queryError)
      return noCacheErrorResponse({ error: 'Failed to fetch recordings' }, 500)
    }

    // Get user emails for recordings (per-user lookup, efficient for page)
    const userIds = [...new Set((data || []).map((r) => r.user_id).filter((id): id is string => Boolean(id)))]

    const emailEntries: Array<[string, string | null]> = await Promise.all(
      userIds.map(async (uid) => {
        try {
          const { data } = await supabase.auth.admin.getUserById(uid)
          return [uid as string, data?.user?.email ?? null] as [string, string | null]
        } catch {
          return [uid as string, null] as [string, string | null]
        }
      })
    )

    const userEmailMap = new Map<string, string | null>(emailEntries)

    // Enrich recordings with user emails
    const recordings: VoiceRecording[] = (data || []).map((r) => ({
      ...r,
      user_email: userEmailMap.get(r.user_id) ?? null
    }))

    const totalCount = count || 0
    const hasMore = offset + pageSize < totalCount

    const response: RecordingsResponse = {
      recordings,
      total_count: totalCount,
      page,
      page_size: pageSize,
      has_more: hasMore
    }

    logger.info('Voice recordings listed', {
      adminId: session.user.id,
      count: recordings.length,
      totalCount,
      filters: { userId, projectId, source, language, lowConfidence, flaggedOnly, includeDeleted }
    })

    return noCacheResponse(response)

  } catch (err) {
    logger.error('Voice recordings list error', err)
    return noCacheErrorResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500
    )
  }
}
