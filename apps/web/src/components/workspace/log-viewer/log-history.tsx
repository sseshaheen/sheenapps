/**
 * Log History Component
 *
 * Paginated historical logs with advanced filtering
 * Part of Phase 2 enhanced log features
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@/components/ui/icon'
import { VirtualChatList } from '@/components/ui/virtual-list'
import { LogEventItem } from './log-event-item'
import { AdvancedLogFilters } from './advanced-log-filters'
import { LogSearch } from './log-search'
import { LoadingStates } from '../shared/loading-states'

interface LogEvent {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  tier: 'system' | 'application' | 'build' | 'deploy'
  message: string
  metadata?: Record<string, any>
}

interface Pagination {
  page: number
  limit: number
  total: number
  has_next: boolean
  has_previous: boolean
}

interface Filters {
  start_time?: string
  end_time?: string
  levels: string[]
  tiers: string[]
  search?: string
}

interface LogHistoryProps {
  projectId: string
  advisorId: string
  translations: {
    history: string
    loading: string
    noLogs: string
    page: string
    of: string
    previous: string
    next: string
    filters: string
    search: string
    timeRange: string
    levels: string
    tiers: string
  }
}

export function LogHistory({
  projectId,
  advisorId,
  translations
}: LogHistoryProps) {
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    has_next: false,
    has_previous: false
  })
  const [filters, setFilters] = useState<Filters>({
    levels: ['debug', 'info', 'warn', 'error'],
    tiers: ['system', 'application', 'build', 'deploy']
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch historical logs
  const fetchHistoricalLogs = useCallback(async (page: number = 1) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        project_id: projectId,
        advisor_id: advisorId,
        page: page.toString(),
        limit: pagination.limit.toString(),
        _t: Date.now().toString() // Cache busting
      })

      // Add filters to params
      if (filters.start_time) params.append('start_time', filters.start_time)
      if (filters.end_time) params.append('end_time', filters.end_time)
      if (filters.levels.length > 0) params.append('levels', filters.levels.join(','))
      if (filters.tiers.length > 0) params.append('tiers', filters.tiers.join(','))
      if (filters.search) params.append('search', filters.search)

      const response = await fetch(`/api/workspace/logs/history?${params}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setLogs(data.logs || [])
      setPagination(data.pagination)

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch historical logs'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [projectId, advisorId, pagination.limit, filters])

  // Load logs on mount and filter changes
  useEffect(() => {
    fetchHistoricalLogs(1)
  }, [filters]) // Reset to page 1 when filters change

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    fetchHistoricalLogs(newPage)
  }

  // Handle filter changes
  const handleFiltersChange = (newFilters: Partial<Filters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }

  // Render log event
  const renderLogEvent = useCallback((log: LogEvent, index: number) => {
    return (
      <LogEventItem
        key={log.id}
        log={log}
        index={index}
        searchQuery={filters.search}
      />
    )
  }, [filters.search])

  const estimateLogHeight = useCallback(() => {
    return 80 // Slightly larger for historical logs with more metadata
  }, [])

  if (loading && logs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingStates.LogsLoading message={translations.loading} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with filters */}
      <div className="flex-shrink-0 p-3 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            {translations.history}
          </h3>

          {loading && (
            <div className="flex items-center gap-2">
              <LoadingStates.Spinner size="sm" />
              <span className="text-xs text-muted-foreground">
                Loading...
              </span>
            </div>
          )}
        </div>

        {/* Search */}
        <LogSearch
          query={filters.search || ''}
          onQueryChange={(search) => handleFiltersChange({ search: search || undefined })}
          placeholder={translations.search}
        />

        {/* Advanced Filters */}
        <AdvancedLogFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          translations={{
            timeRange: translations.timeRange,
            levels: translations.levels,
            tiers: translations.tiers,
            startTime: 'Start Time',
            endTime: 'End Time',
            clearFilters: 'Clear Filters'
          }}
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="flex-shrink-0 p-3 border-b border-border bg-red-500/10">
          <div className="text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => fetchHistoricalLogs(pagination.page)}
              className="mt-2 px-3 py-1 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Historical logs list */}
      <div className="flex-1 overflow-hidden">
        {logs.length === 0 && !loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-muted-foreground text-lg mb-2">📊</div>
              <p className="text-foreground font-medium mb-1">
                {translations.noLogs}
              </p>
              <p className="text-muted-foreground text-sm">
                Try adjusting your filters or time range
              </p>
            </div>
          </div>
        ) : (
          <VirtualChatList
            messages={logs}
            height={400} // Will be overridden by container height
            renderMessage={renderLogEvent}
            autoScrollToBottom={false} // Don't auto-scroll for historical logs
            estimateMessageHeight={estimateLogHeight}
            className="h-full"
          />
        )}
      </div>

      {/* Pagination */}
      {logs.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between">
            {/* Page info */}
            <div className="text-xs text-muted-foreground">
              {translations.page} {pagination.page} {translations.of} {Math.ceil(pagination.total / pagination.limit)} • {pagination.total} logs total
            </div>

            {/* Pagination controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={!pagination.has_previous || loading}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-background border border-border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Icon name="chevron-left" className="w-3 h-3" />
                {translations.previous}
              </button>

              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={!pagination.has_next || loading}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-background border border-border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {translations.next}
                <Icon name="chevron-right" className="w-3 h-3"  />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}