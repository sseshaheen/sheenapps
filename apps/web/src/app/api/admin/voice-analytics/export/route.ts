/**
 * Voice Analytics Export API
 *
 * Exports voice recordings data as CSV for offline analysis.
 * Supports filtering by date range and source.
 *
 * Phase 2 Enhancement: CSV export functionality
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { logger } from '@/utils/logger'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Maximum records to export (prevent memory issues)
const MAX_EXPORT_RECORDS = 10000

export async function GET(request: NextRequest) {
  // Permission check: voice_analytics.read (same as list API)
  const { session, error } = await requireAdmin('voice_analytics.read')
  if (error) return error

  const { searchParams } = new URL(request.url)

  // Filters (same as recordings list API)
  const source = searchParams.get('source') // 'hero' | 'project' | null (all)
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const days = searchParams.get('days') ? parseInt(searchParams.get('days')!) : 30

  try {
    const supabase = await createServerSupabaseClientNew()

    // Build query - select specific columns for CSV
    let query = supabase
      .from('voice_recordings')
      .select(`
        id,
        user_id,
        project_id,
        source,
        duration_seconds,
        file_size_bytes,
        transcription,
        detected_language,
        confidence_score,
        provider,
        model_version,
        processing_duration_ms,
        cost_usd,
        input_tokens,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_RECORDS)

    // Apply filters
    if (source) {
      query = query.eq('source', source)
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    } else {
      // Default to last N days
      query = query.gte(
        'created_at',
        new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      )
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo)
    }

    const { data, error: queryError } = await query

    if (queryError) {
      logger.error('Failed to fetch voice recordings for export', queryError)
      return new NextResponse('Failed to fetch recordings', { status: 500 })
    }

    // Get user emails for all users in the export
    const userIds = [...new Set((data || []).map((r) => r.user_id).filter((id): id is string => Boolean(id)))]
    const userEmailMap = new Map<string, string | null>()

    // Batch fetch emails (more efficient than individual lookups for large exports)
    await Promise.all(
      userIds.map(async (uid: string) => {
        try {
          const { data: userData } = await supabase.auth.admin.getUserById(uid)
          userEmailMap.set(uid, userData?.user?.email ?? null)
        } catch {
          userEmailMap.set(uid, null)
        }
      })
    )

    // Generate CSV
    const csvHeaders = [
      'id',
      'user_id',
      'user_email',
      'project_id',
      'source',
      'duration_seconds',
      'file_size_bytes',
      'transcription',
      'detected_language',
      'confidence_score',
      'provider',
      'model_version',
      'processing_duration_ms',
      'cost_usd',
      'input_tokens',
      'created_at'
    ]

    const csvRows = (data || []).map((record) => {
      return [
        record.id,
        record.user_id,
        userEmailMap.get(record.user_id) || '',
        record.project_id || '',
        record.source || '',
        record.duration_seconds ?? '',
        record.file_size_bytes ?? '',
        // Escape transcription for CSV (handle quotes, newlines)
        `"${(record.transcription || '').replace(/"/g, '""').replace(/\n/g, '\\n')}"`,
        record.detected_language || '',
        record.confidence_score ?? '',
        record.provider || '',
        record.model_version || '',
        record.processing_duration_ms ?? '',
        record.cost_usd ?? '',
        record.input_tokens ?? '',
        record.created_at
      ].join(',')
    })

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n')

    // Generate filename with date range
    const now = new Date()
    const filename = `voice-recordings-${now.toISOString().split('T')[0]}.csv`

    logger.info('Voice analytics exported', {
      adminId: session.user.id,
      recordCount: data?.length || 0,
      filters: { source, dateFrom, dateTo, days }
    })

    // Return CSV with appropriate headers
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (err) {
    logger.error('Voice analytics export error', err)
    return new NextResponse(
      err instanceof Error ? err.message : 'Internal server error',
      { status: 500 }
    )
  }
}
