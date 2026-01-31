/**
 * Voice Analytics Admin Dashboard
 *
 * Comprehensive monitoring dashboard for voice input feature.
 * Displays adoption metrics, costs, performance, and quality insights.
 *
 * Features:
 * - Summary metrics cards (recordings, users, cost, duration)
 * - Time series chart (recordings per day)
 * - Language distribution pie chart
 * - Recent recordings table with audio playback
 * - Filters and search capabilities
 */

'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'

// Helper to safely parse numbers with fallback (prevents NaN crashes)
function safeNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : fallback
}
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

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
    low_confidence_count: number
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

interface VoiceRecording {
  id: string
  user_id: string
  user_email: string | null
  source: 'hero' | 'project' | null
  duration_seconds: number | null
  detected_language: string | null
  confidence_score: number | null
  cost_usd: number | null
  input_tokens: number | null  // Token count for cost transparency
  transcription: string
  created_at: string
  // Moderation fields (Phase 3)
  flagged_at: string | null
  flagged_by: string | null
  flag_reason: string | null
  deleted_at: string | null
  deleted_by: string | null
}

interface RecordingsListResponse {
  recordings: VoiceRecording[]
  total_count: number
  has_more: boolean
}

interface RecordingDetail extends VoiceRecording {
  signed_audio_url: string
  signed_url_expires_at: string
  audio_format: string
  file_size_bytes: number | null
  processing_duration_ms: number | null
  provider: string
  model_version: string | null
}

export default function VoiceAnalyticsPage() {
  const [metrics, setMetrics] = useState<VoiceAnalyticsMetrics | null>(null)
  const [recordings, setRecordings] = useState<VoiceRecording[]>([])
  const [selectedRecording, setSelectedRecording] = useState<RecordingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'hero' | 'project'>('all')
  const [exporting, setExporting] = useState(false)
  // Moderation state (Phase 3)
  const [flaggedFilter, setFlaggedFilter] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null) // recordingId being acted on
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
    // Clear stale delete confirmation when filters change
    setDeleteConfirmId(null)
  }, [days, sourceFilter, flaggedFilter])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch metrics
      const metricsRes = await fetch(`/api/admin/voice-analytics?days=${days}`)
      if (!metricsRes.ok) throw new Error('Failed to fetch metrics')
      const metricsData = await metricsRes.json()
      setMetrics(metricsData)

      // Calculate date_from to align recordings table with metrics time window
      const dateFromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

      // Fetch recent recordings (within same time window as metrics)
      const sourceParam = sourceFilter !== 'all' ? `&source=${sourceFilter}` : ''
      const flaggedParam = flaggedFilter ? '&flagged=true' : ''
      const recordingsRes = await fetch(
        `/api/admin/voice-analytics/recordings?page=1&page_size=20&sort_by=created_at&sort_order=desc` +
        `&date_from=${encodeURIComponent(dateFromIso)}${sourceParam}${flaggedParam}`
      )
      if (!recordingsRes.ok) throw new Error('Failed to fetch recordings')
      const recordingsData: RecordingsListResponse = await recordingsRes.json()
      setRecordings(recordingsData.recordings)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePlayRecording = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/voice-analytics/recordings/${id}`)
      if (!res.ok) throw new Error('Failed to fetch recording detail')
      const detail: RecordingDetail = await res.json()
      setSelectedRecording(detail)
    } catch (err) {
      console.error('Failed to load recording:', err)
      alert('Failed to load recording audio')
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)

      // Build export URL with current filters
      const params = new URLSearchParams()
      params.set('days', days.toString())
      if (sourceFilter !== 'all') {
        params.set('source', sourceFilter)
      }

      const res = await fetch(`/api/admin/voice-analytics/export?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to export recordings')

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = res.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch?.[1] || `voice-recordings-${new Date().toISOString().split('T')[0]}.csv`

      // Download the CSV
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export:', err)
      alert('Failed to export recordings')
    } finally {
      setExporting(false)
    }
  }

  // Moderation handlers (Phase 3)
  const handleFlag = async (id: string, flagged: boolean, reason?: string) => {
    try {
      setActionLoading(id)

      // Prompt for reason when flagging (optional but useful for audit trail)
      let finalReason = reason
      if (flagged && !finalReason) {
        const input = window.prompt('Why are you flagging this recording? (optional)')
        finalReason = input?.trim() || undefined
      }

      const res = await fetch(`/api/admin/voice-analytics/recordings/${id}/flag`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged, reason: finalReason }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update flag status')
      }
      // Refresh recordings
      await fetchData()
      // Update selected recording if open
      if (selectedRecording?.id === id) {
        const detail = await fetch(`/api/admin/voice-analytics/recordings/${id}`)
        if (detail.ok) {
          setSelectedRecording(await detail.json())
        }
      }
    } catch (err) {
      console.error('Failed to flag recording:', err)
      alert(err instanceof Error ? err.message : 'Failed to update flag status')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setActionLoading(id)
      const res = await fetch(`/api/admin/voice-analytics/recordings/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete recording')
      }
      // Close modal if deleting the selected recording
      if (selectedRecording?.id === id) {
        setSelectedRecording(null)
      }
      // Refresh recordings
      await fetchData()
      setDeleteConfirmId(null)
    } catch (err) {
      console.error('Failed to delete recording:', err)
      alert(err instanceof Error ? err.message : 'Failed to delete recording')
    } finally {
      setActionLoading(null)
    }
  }

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatCost = (cost: number | null): string => {
    if (cost === null || cost === undefined) return '$0.00'
    return `$${cost.toFixed(4)}`
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getLanguageLabel = (code: string | null): string => {
    const labels: Record<string, string> = {
      en: 'English',
      ar: 'Arabic',
      'ar-eg': 'Egyptian Arabic',
      'ar-sa': 'Saudi Arabic',
      'ar-ae': 'UAE Arabic',
      fr: 'French',
      es: 'Spanish',
      de: 'German'
    }
    return labels[code || ''] || code || 'Unknown'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        Error: {error}
      </div>
    )
  }

  if (!metrics) return null

  // Cost alert threshold (configurable via env var, default $10/day)
  // Using safeNumber to prevent NaN crashes if env var is missing/invalid
  const COST_ALERT_THRESHOLD = safeNumber(
    process.env.NEXT_PUBLIC_VOICE_COST_ALERT_THRESHOLD,
    10
  )

  // Calculate today's cost from time series
  // Note: Using UTC to match server-generated time_series dates
  const today = new Date().toISOString().split('T')[0]
  const todayCost = safeNumber(
    metrics.time_series.find((d) => d.date === today)?.total_cost,
    0
  )
  const showCostAlert = todayCost >= COST_ALERT_THRESHOLD

  return (
    <div className="space-y-6">
      {/* Cost Alert Banner */}
      {showCostAlert && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <Icon name="alert-triangle" className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-red-800">Daily Cost Alert</h4>
            <p className="text-sm text-red-700 mt-1">
              Today&apos;s voice transcription cost (${todayCost.toFixed(2)}) has exceeded the
              alert threshold (${COST_ALERT_THRESHOLD.toFixed(2)}).
            </p>
          </div>
          <div className="text-right">
            <span className="text-lg font-semibold text-red-800">
              ${todayCost.toFixed(2)}
            </span>
            <p className="text-xs text-red-600">today&apos;s cost</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Voice Input Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor adoption, costs, and quality of voice transcription feature
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Source Filter */}
          <div className="flex items-center gap-1 border-r pr-4">
            <span className="text-xs text-gray-500 mr-1">Source:</span>
            <Button
              variant={sourceFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSourceFilter('all')}
            >
              All
            </Button>
            <Button
              variant={sourceFilter === 'hero' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSourceFilter('hero')}
            >
              Hero
            </Button>
            <Button
              variant={sourceFilter === 'project' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSourceFilter('project')}
            >
              Project
            </Button>
          </div>
          {/* Flagged Filter */}
          <div className="flex items-center gap-1 border-r pr-4">
            <Button
              variant={flaggedFilter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFlaggedFilter(!flaggedFilter)}
              className={flaggedFilter ? 'bg-orange-600 hover:bg-orange-700' : ''}
            >
              <Icon name="alert-triangle" className="w-4 h-4 mr-1" />
              Flagged
            </Button>
          </div>
          {/* Time Period */}
          <div className="flex items-center gap-1 border-r pr-4">
            <Button
              variant={days === 7 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(7)}
            >
              7 days
            </Button>
            <Button
              variant={days === 30 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(30)}
            >
              30 days
            </Button>
            <Button
              variant={days === 90 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(90)}
            >
              90 days
            </Button>
          </div>
          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <>
                <Icon name="loader-2" className="w-4 h-4 mr-1 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Icon name="download" className="w-4 h-4 mr-1" />
                Export CSV
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Icon name="mic" className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-3 w-0 flex-1">
              <dt className="text-sm font-medium text-gray-500 truncate">Recordings</dt>
              <dd className="text-2xl font-semibold text-gray-900">
                {metrics.summary.total_recordings.toLocaleString()}
              </dd>
              <dd className="text-xs text-gray-500 mt-1">
                {metrics.summary.hero_recordings} hero · {metrics.summary.project_recordings} project
              </dd>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Icon name="users" className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-3 w-0 flex-1">
              <dt className="text-sm font-medium text-gray-500 truncate">Unique Users</dt>
              <dd className="text-2xl font-semibold text-gray-900">
                {metrics.summary.unique_users.toLocaleString()}
              </dd>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Icon name="dollar-sign" className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-3 w-0 flex-1">
              <dt className="text-sm font-medium text-gray-500 truncate">Total Cost</dt>
              <dd className="text-2xl font-semibold text-gray-900">
                ${metrics.summary.total_cost_usd.toFixed(2)}
              </dd>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Icon name="clock" className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-3 w-0 flex-1">
              <dt className="text-sm font-medium text-gray-500 truncate">Avg Duration</dt>
              <dd className="text-2xl font-semibold text-gray-900">
                {metrics.summary.avg_duration_seconds.toFixed(0)}s
              </dd>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Icon name="zap" className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-3 w-0 flex-1">
              <dt className="text-sm font-medium text-gray-500 truncate">Audio Minutes</dt>
              <dd className="text-2xl font-semibold text-gray-900">
                {metrics.summary.total_audio_minutes.toFixed(0)}
              </dd>
            </div>
          </div>
        </Card>
      </div>

      {/* Performance & Quality Metrics */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Metrics</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">Average Processing Time</dt>
              <dd className="text-sm font-semibold text-gray-900">
                {metrics.performance.avg_processing_ms}ms
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">P95 Processing Time</dt>
              <dd className="text-sm font-semibold text-gray-900">
                {metrics.performance.p95_processing_ms}ms
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">Success Rate</dt>
              <dd className="text-sm font-semibold text-green-600">
                {metrics.performance.success_rate.toFixed(1)}%
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quality Metrics</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">Average Confidence</dt>
              <dd className="text-sm font-semibold text-gray-900">
                {(metrics.quality.avg_confidence * 100).toFixed(1)}%
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">Low Confidence Count</dt>
              <dd className="text-sm font-semibold text-orange-600">
                {metrics.quality.low_confidence_count}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">Empty Transcriptions</dt>
              <dd className="text-sm font-semibold text-red-600">
                {metrics.quality.empty_transcription_count}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Language Distribution */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Language Distribution</h3>
        <div className="space-y-3">
          {metrics.languages.slice(0, 5).map((lang) => (
            <div key={lang.language} className="flex items-center">
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    {getLanguageLabel(lang.language)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {lang.count} ({lang.percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${lang.percentage}%` }}
                  />
                </div>
              </div>
              <span className="ml-4 text-xs text-gray-500">
                {(lang.avg_confidence * 100).toFixed(0)}% conf
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Top Users */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Top Users (by recordings)</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Recordings</TableHead>
              <TableHead>Total Cost</TableHead>
              <TableHead>Avg Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.top_users.map((user) => (
              <TableRow key={user.user_id}>
                <TableCell className="font-medium">
                  {user.email || user.user_id.slice(0, 8)}
                </TableCell>
                <TableCell>{user.recording_count}</TableCell>
                <TableCell>{formatCost(user.total_cost_usd)}</TableCell>
                <TableCell>{formatDuration(Math.round(user.avg_duration_seconds))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Recent Recordings */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Recordings</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordings.map((recording) => {
              // Explicit boolean for flag status (prevents string/null coercion bugs)
              const isFlagged = Boolean(recording.flagged_at)
              return (
              <TableRow key={recording.id} className={isFlagged ? 'bg-orange-50' : ''}>
                <TableCell className="font-medium">
                  {recording.user_email || recording.user_id.slice(0, 8)}
                </TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      recording.source === 'hero'
                        ? 'bg-purple-100 text-purple-800'
                        : recording.source === 'project'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {recording.source || 'unknown'}
                  </span>
                </TableCell>
                <TableCell>
                  {isFlagged ? (
                    <span className="px-2 py-1 rounded text-xs bg-orange-100 text-orange-800 flex items-center gap-1">
                      <Icon name="alert-triangle" className="w-3 h-3" />
                      Flagged
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                      OK
                    </span>
                  )}
                </TableCell>
                <TableCell>{formatDuration(recording.duration_seconds)}</TableCell>
                <TableCell>{getLanguageLabel(recording.detected_language)}</TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      recording.confidence_score && recording.confidence_score >= 0.9
                        ? 'bg-green-100 text-green-800'
                        : recording.confidence_score && recording.confidence_score >= 0.7
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {recording.confidence_score
                      ? `${(recording.confidence_score * 100).toFixed(0)}%`
                      : '-'}
                  </span>
                </TableCell>
                <TableCell>{formatCost(recording.cost_usd)}</TableCell>
                <TableCell className="text-xs text-gray-500">
                  {formatDate(recording.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePlayRecording(recording.id)}
                    >
                      <Icon name="play" className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFlag(recording.id, !isFlagged)}
                      disabled={actionLoading === recording.id}
                      className={isFlagged ? 'text-orange-600' : ''}
                      title={isFlagged ? 'Unflag' : 'Flag'}
                    >
                      {actionLoading === recording.id ? (
                        <Icon name="loader-2" className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon name="alert-triangle" className="w-4 h-4" />
                      )}
                    </Button>
                    {deleteConfirmId === recording.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(recording.id)}
                          disabled={actionLoading === recording.id}
                        >
                          {actionLoading === recording.id ? (
                            <Icon name="loader-2" className="w-4 h-4 animate-spin" />
                          ) : (
                            <Icon name="check" className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          <Icon name="x" className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteConfirmId(recording.id)}
                        title="Delete"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Icon name="trash-2" className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Recording Detail Modal */}
      {selectedRecording && (() => {
        // Explicit boolean for flag status in modal
        const isSelectedFlagged = Boolean(selectedRecording.flagged_at)
        // Safe numeric checks for cost per 1K tokens calculation
        const tokens = selectedRecording.input_tokens
        const cost = selectedRecording.cost_usd
        const canShowCostPerToken = typeof tokens === 'number' && tokens > 0 && typeof cost === 'number'

        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">Voice Recording Detail</h3>
                  {isSelectedFlagged && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-1 rounded text-xs bg-orange-100 text-orange-800 flex items-center gap-1">
                        <Icon name="alert-triangle" className="w-3 h-3" />
                        Flagged
                      </span>
                      {selectedRecording.flag_reason && (
                        <span className="text-xs text-gray-500">
                          {selectedRecording.flag_reason}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFlag(selectedRecording.id, !isSelectedFlagged)}
                    disabled={actionLoading === selectedRecording.id}
                    className={isSelectedFlagged ? 'text-orange-600' : ''}
                  >
                    {actionLoading === selectedRecording.id ? (
                      <Icon name="loader-2" className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Icon name="alert-triangle" className="w-4 h-4 mr-1" />
                    )}
                    {isSelectedFlagged ? 'Unflag' : 'Flag'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this recording?')) {
                        handleDelete(selectedRecording.id)
                      }
                    }}
                    disabled={actionLoading === selectedRecording.id}
                    className="text-red-600 hover:text-red-700"
                  >
                    {actionLoading === selectedRecording.id ? (
                      <Icon name="loader-2" className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Icon name="trash-2" className="w-4 h-4 mr-1" />
                    )}
                    Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedRecording(null)}
                  >
                    <Icon name="x" className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">User:</span>
                  <span className="font-medium">{selectedRecording.user_email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration:</span>
                  <span className="font-medium">
                    {formatDuration(selectedRecording.duration_seconds)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Language:</span>
                  <span className="font-medium">
                    {getLanguageLabel(selectedRecording.detected_language)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cost:</span>
                  <span className="font-medium">{formatCost(selectedRecording.cost_usd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Processing Time:</span>
                  <span className="font-medium">
                    {selectedRecording.processing_duration_ms}ms
                  </span>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Audio Playback</h4>
                <audio
                  controls
                  src={selectedRecording.signed_audio_url}
                  className="w-full"
                  preload="metadata"
                >
                  Your browser does not support audio playback.
                </audio>
                <p className="text-xs text-gray-500 mt-1">
                  Signed URL expires at: {formatDate(selectedRecording.signed_url_expires_at)}
                </p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Transcription</h4>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">
                    {selectedRecording.transcription}
                  </p>
                </div>
                {selectedRecording.confidence_score && (
                  <p className="text-xs text-gray-500 mt-2">
                    Confidence: {(selectedRecording.confidence_score * 100).toFixed(1)}% (
                    {selectedRecording.confidence_score >= 0.9
                      ? 'High'
                      : selectedRecording.confidence_score >= 0.7
                      ? 'Medium'
                      : 'Low'}
                    )
                  </p>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Metadata</h4>
                <dl className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Format:</dt>
                    <dd className="font-mono">{selectedRecording.audio_format}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">File Size:</dt>
                    <dd>
                      {selectedRecording.file_size_bytes
                        ? `${(selectedRecording.file_size_bytes / 1024).toFixed(1)} KB`
                        : '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Provider:</dt>
                    <dd>{selectedRecording.provider}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Model:</dt>
                    <dd className="font-mono">{selectedRecording.model_version || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Input Tokens:</dt>
                    <dd className="font-mono">
                      {selectedRecording.input_tokens?.toLocaleString() || '-'}
                    </dd>
                  </div>
                  {canShowCostPerToken && (
                    <div className="flex justify-between text-gray-500">
                      <dt>Cost per 1K tokens:</dt>
                      <dd className="font-mono">
                        ${((cost! / tokens!) * 1000).toFixed(4)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </Card>
        </div>
        )
      })()}
    </div>
  )
}
