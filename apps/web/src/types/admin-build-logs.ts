/**
 * Build Logs Types
 * TypeScript interfaces for the admin build logs feature
 */

// Build info from /v1/admin/builds/{buildId}/info
export interface BuildInfo {
  buildId: string
  projectId: string
  userId: string
  userEmail?: string
  status: string
  createdAt: string
  updatedAt: string
  buildDurationMs?: number
  totalLinesProcessed?: number
  claudeRequests?: number
  memoryPeakMb?: number
  errorMessage?: string
  logExists: boolean
  logSizeBytes: number
}

// Build list item from /v1/admin/builds
export interface BuildListItem {
  build_id: string
  project_id: string
  user_id: string
  user_email?: string
  status: string
  created_at: string
  updated_at: string
  build_duration_ms?: number
  error_message?: string
  logExists: boolean
  user_prompt?: string
}

// Builds list response from /v1/admin/builds
export interface BuildsList {
  builds: BuildListItem[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

// NDJSON log entry types from streaming endpoint
export interface LogMetaEntry {
  kind: 'meta'
  buildId: string
  userId?: string
  projectId?: string
  startedAt?: string
  endedAt?: string
  version?: string
}

export interface LogLineEntry {
  kind: 'line'
  ts: number
  seq: number
  src: 'stdout' | 'stderr'
  buildId: string
  msg: string
}

export type LogEntry = LogMetaEntry | LogLineEntry

// Duration range filter options
export type DurationRange = '' | 'under30s' | '30s-2m' | '2m-5m' | 'over5m'

// Duration range configuration (min/max in milliseconds)
export const DURATION_RANGES: Record<DurationRange, { min?: number; max?: number; label: string }> = {
  '': { label: 'All durations' },
  'under30s': { max: 30000, label: 'Under 30s' },
  '30s-2m': { min: 30000, max: 120000, label: '30s - 2m' },
  '2m-5m': { min: 120000, max: 300000, label: '2m - 5m' },
  'over5m': { min: 300000, label: 'Over 5m' }
}

// Query parameters for builds list
export interface BuildsListQuery {
  limit?: number
  offset?: number
  status?: string
  userId?: string
  projectId?: string
  minDurationMs?: number
  maxDurationMs?: number
}

// Filter state for the builds list UI
export interface BuildsFilterState {
  status: string
  userId: string
  projectId: string
  userEmail: string
  durationRange: DurationRange
}