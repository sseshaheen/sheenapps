/**
 * Voice Analytics Admin API
 *
 * Provides aggregated metrics for voice input feature monitoring.
 * Includes adoption rates, costs, performance, and quality metrics.
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface VoiceAnalyticsMetrics {
  summary: {
    total_recordings: number
    hero_recordings: number
    project_recordings: number
    unique_users: number
    total_cost_usd: number
    avg_duration_seconds: number
    total_audio_minutes: number
  }
  time_series: Array<{
    date: string
    recordings_count: number
    unique_users: number
    total_cost: number
  }>
  languages: Array<{
    language: string
    count: number
    percentage: number
    avg_confidence: number
  }>
  performance: {
    avg_processing_ms: number
    p50_processing_ms: number
    p95_processing_ms: number
    p99_processing_ms: number
    success_rate: number
  }
  quality: {
    avg_confidence: number
    low_confidence_count: number // confidence < 0.7
    empty_transcription_count: number
    language_mismatch_count: number
  }
  top_users: Array<{
    user_id: string
    email: string | null
    recording_count: number
    total_cost_usd: number
    avg_duration_seconds: number
  }>
}

export async function GET(request: NextRequest) {
  // Permission check: voice_analytics.read
  const { session, error } = await requireAdmin('voice_analytics.read')
  if (error) return error

  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '30')
  const limit = parseInt(searchParams.get('limit') || '10')

  try {
    const supabase = await createServerSupabaseClientNew()

    // 1. Summary metrics
    const { data: summaryData, error: summaryError } = await supabase
      .from('voice_recordings')
      .select('created_at, duration_seconds, cost_usd, user_id, source')
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())

    if (summaryError) {
      logger.error('Failed to fetch voice analytics summary', summaryError)
      return noCacheErrorResponse({ error: 'Failed to fetch analytics' }, 500)
    }

    const uniqueUsers = new Set(summaryData?.map((r) => r.user_id) || []).size
    const totalRecordings = summaryData?.length || 0
    const heroRecordings = summaryData?.filter((r) => r.source === 'hero').length || 0
    const projectRecordings = summaryData?.filter((r) => r.source === 'project').length || 0
    const totalCost = summaryData?.reduce((sum, r) => sum + (r.cost_usd || 0), 0) || 0
    const avgDuration = totalRecordings > 0
      ? (summaryData?.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) || 0) / totalRecordings
      : 0
    const totalMinutes = (summaryData?.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) || 0) / 60

    // 2. Time series data (daily aggregation)
    const { data: timeSeriesData, error: timeSeriesError } = await supabase.rpc(
      'get_voice_analytics_time_series',
      { days_back: days }
    )

    // Fallback if RPC doesn't exist - manual aggregation
    let timeSeries: any[] = []
    if (timeSeriesError) {
      logger.warn('RPC get_voice_analytics_time_series not found, using fallback')
      // Group by day manually
      const dayGroups = new Map<string, any[]>()
      summaryData?.forEach((r: any) => {
        const date = r.created_at?.split('T')[0]
        if (!dayGroups.has(date)) dayGroups.set(date, [])
        dayGroups.get(date)?.push(r)
      })

      timeSeries = Array.from(dayGroups.entries()).map(([date, records]) => ({
        date,
        recordings_count: records.length,
        unique_users: new Set(records.map((r) => r.user_id)).size,
        total_cost: records.reduce((sum, r) => sum + (r.cost_usd || 0), 0)
      })).sort((a, b) => a.date.localeCompare(b.date))
    } else {
      timeSeries = timeSeriesData || []
    }

    // 3. Language distribution
    const { data: languageData, error: languageError } = await supabase
      .from('voice_recordings')
      .select('detected_language, confidence_score')
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())

    const languageGroups = new Map<string, { count: number; confidences: number[] }>()
    languageData?.forEach((r) => {
      const lang = r.detected_language || 'unknown'
      if (!languageGroups.has(lang)) {
        languageGroups.set(lang, { count: 0, confidences: [] })
      }
      const group = languageGroups.get(lang)!
      group.count++
      if (r.confidence_score) group.confidences.push(r.confidence_score)
    })

    const languages = Array.from(languageGroups.entries())
      .map(([language, data]) => ({
        language,
        count: data.count,
        percentage: totalRecordings > 0 ? (data.count / totalRecordings) * 100 : 0,
        avg_confidence: data.confidences.length > 0
          ? data.confidences.reduce((sum, c) => sum + c, 0) / data.confidences.length
          : 0
      }))
      .sort((a, b) => b.count - a.count)

    // 4. Performance metrics
    const { data: perfData, error: perfError } = await supabase
      .from('voice_recordings')
      .select('processing_duration_ms')
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .not('processing_duration_ms', 'is', null)
      .order('processing_duration_ms', { ascending: true })

    const processingTimes = perfData?.map((r) => r.processing_duration_ms || 0) || []
    const avgProcessing = processingTimes.length > 0
      ? processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length
      : 0
    const p50Index = Math.floor(processingTimes.length * 0.5)
    const p95Index = Math.floor(processingTimes.length * 0.95)
    const p99Index = Math.floor(processingTimes.length * 0.99)

    // 5. Quality metrics
    const lowConfidenceCount = languageData?.filter((r) => r.confidence_score && r.confidence_score < 0.7).length || 0

    const { data: qualityData, error: qualityError } = await supabase
      .from('voice_recordings')
      .select('transcription, duration_seconds, confidence_score')
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())

    const emptyTranscriptionCount = qualityData?.filter(
      (r) => r.duration_seconds && r.duration_seconds > 10 && r.transcription.trim().length < 50
    ).length || 0

    const avgConfidence = languageData && languageData.length > 0
      ? languageData
          .filter((r) => r.confidence_score)
          .reduce((sum, r) => sum + (r.confidence_score || 0), 0) /
        languageData.filter((r) => r.confidence_score).length
      : 0

    // 6. Top users
    const { data: topUsersData, error: topUsersError } = await supabase
      .from('voice_recordings')
      .select(`
        user_id,
        duration_seconds,
        cost_usd
      `)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())

    const userGroups = new Map<string, { count: number; totalCost: number; totalDuration: number }>()
    topUsersData?.forEach((r) => {
      if (!userGroups.has(r.user_id)) {
        userGroups.set(r.user_id, { count: 0, totalCost: 0, totalDuration: 0 })
      }
      const group = userGroups.get(r.user_id)!
      group.count++
      group.totalCost += r.cost_usd || 0
      group.totalDuration += r.duration_seconds || 0
    })

    // Get user emails (per-user lookup, not listUsers pagination)
    const topUserIds = Array.from(userGroups.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([userId]) => userId)

    // Fetch emails only for top users (efficient)
    const emailEntries = await Promise.all(
      topUserIds.map(async (uid): Promise<[string, string | null]> => {
        try {
          const { data } = await supabase.auth.admin.getUserById(uid)
          return [uid, data?.user?.email ?? null]
        } catch {
          return [uid, null]
        }
      })
    )
    const userEmailMap = new Map<string, string | null>(emailEntries)

    const topUsers = topUserIds.map((userId) => {
      const group = userGroups.get(userId)!
      return {
        user_id: userId,
        email: userEmailMap.get(userId) || null,
        recording_count: group.count,
        total_cost_usd: group.totalCost,
        avg_duration_seconds: group.count > 0 ? group.totalDuration / group.count : 0
      }
    })

    const metrics: VoiceAnalyticsMetrics = {
      summary: {
        total_recordings: totalRecordings,
        hero_recordings: heroRecordings,
        project_recordings: projectRecordings,
        unique_users: uniqueUsers,
        total_cost_usd: parseFloat(totalCost.toFixed(4)),
        avg_duration_seconds: parseFloat(avgDuration.toFixed(1)),
        total_audio_minutes: parseFloat(totalMinutes.toFixed(1))
      },
      time_series: timeSeries,
      languages,
      performance: {
        avg_processing_ms: Math.round(avgProcessing),
        p50_processing_ms: processingTimes[p50Index] || 0,
        p95_processing_ms: processingTimes[p95Index] || 0,
        p99_processing_ms: processingTimes[p99Index] || 0,
        success_rate: 100 // TODO: Track failures
      },
      quality: {
        avg_confidence: parseFloat(avgConfidence.toFixed(3)),
        low_confidence_count: lowConfidenceCount,
        empty_transcription_count: emptyTranscriptionCount,
        language_mismatch_count: 0 // TODO: Track mismatches
      },
      top_users: topUsers
    }

    logger.info('Voice analytics fetched', {
      adminId: session.user.id,
      recordingsCount: totalRecordings,
      days
    })

    return noCacheResponse(metrics)

  } catch (err) {
    logger.error('Voice analytics error', err)
    return noCacheErrorResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500
    )
  }
}
