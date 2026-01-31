/**
 * Log Viewer Component
 *
 * Enhanced log display with both live streaming and historical modes
 * Uses VirtualChatList for performance with large log datasets
 */

'use client'

import { useState, useCallback } from 'react'
import { VirtualChatList } from '@/components/ui/virtual-list'
import { LogFilters } from './log-filters'
import { LogEventItem } from './log-event-item'
import { LogSearch } from './log-search'
import { LogHistory } from './log-history'

interface LogEvent {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  tier: 'system' | 'application' | 'build' | 'deploy'
  message: string
  metadata?: Record<string, any>
}

interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
  retryCount?: number
}

interface LogViewerProps {
  projectId: string
  advisorId: string
  logs: LogEvent[]
  connectionStatus: ConnectionStatus
  onReconnect: () => void
  onClear: () => void
  translations: {
    logs: string
    reconnect: string
    clear: string
    paused: string
    live: string
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
    streamConnected?: string
    streamDisconnected?: string
    streamError?: string
    streamPaused?: string
    maxReconnectionAttempts?: string
    connecting?: string
    disconnected?: string
    error?: string
    searchPlaceholder?: string
    resume?: string
  }
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
const LOG_TIERS = ['system', 'application', 'build', 'deploy'] as const

export function LogViewer({
  projectId,
  advisorId,
  logs,
  connectionStatus,
  onReconnect,
  onClear,
  translations
}: LogViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set(LOG_LEVELS))
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(LOG_TIERS))
  const [isPaused, setIsPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [viewMode, setViewMode] = useState<'live' | 'history'>('live')

  // Filter logs based on search and filters
  const filteredLogs = logs.filter(log => {
    // Level filter
    if (!selectedLevels.has(log.level)) return false

    // Tier filter
    if (!selectedTiers.has(log.tier)) return false

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        log.message.toLowerCase().includes(query) ||
        log.id.toLowerCase().includes(query) ||
        JSON.stringify(log.metadata || {}).toLowerCase().includes(query)
      )
    }

    return true
  })

  // Memory cap: Expert pattern from implementation plan (4000 lines max)
  const displayLogs = filteredLogs.slice(-4000)

  const handleLevelToggle = (level: string) => {
    const newLevels = new Set(selectedLevels)
    if (newLevels.has(level)) {
      newLevels.delete(level)
    } else {
      newLevels.add(level)
    }
    setSelectedLevels(newLevels)
  }

  const handleTierToggle = (tier: string) => {
    const newTiers = new Set(selectedTiers)
    if (newTiers.has(tier)) {
      newTiers.delete(tier)
    } else {
      newTiers.add(tier)
    }
    setSelectedTiers(newTiers)
  }

  const renderLogEvent = useCallback((log: LogEvent, index: number) => {
    return (
      <LogEventItem
        key={log.id}
        log={log}
        index={index}
        searchQuery={searchQuery}
      />
    )
  }, [searchQuery])

  const estimateLogHeight = useCallback(() => {
    return 60 // Estimated height per log line
  }, [])

  const handleScroll = (scrollTop: number, isAtBottom: boolean) => {
    // Auto-pause when user scrolls up
    if (!isAtBottom && autoScroll) {
      setIsPaused(true)
    }
  }

  const resumeLive = () => {
    setIsPaused(false)
    setAutoScroll(true)
  }

  const connectionStatusColor = connectionStatus.status === 'connected'
    ? 'bg-green-500'
    : connectionStatus.status === 'connecting'
    ? 'bg-yellow-500'
    : 'bg-red-500'

  const connectionStatusText = connectionStatus.status === 'connected'
    ? translations.live
    : connectionStatus.status === 'connecting'
    ? (translations.connecting || 'Connecting...')
    : connectionStatus.status === 'error'
    ? (translations.error || 'Error')
    : (translations.disconnected || 'Disconnected')

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Screen reader announcements */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="sr-only"
        id="log-announcements"
      >
        {connectionStatus.status === 'connected' && (translations.streamConnected || 'Log stream connected')}
        {connectionStatus.status === 'disconnected' && (translations.streamDisconnected || 'Log stream disconnected')}
        {connectionStatus.status === 'error' && (
          connectionStatus.error === 'Max reconnection attempts reached'
            ? (translations.maxReconnectionAttempts || translations.streamError || connectionStatus.error)
            : (translations.streamError || `Log stream error: ${connectionStatus.error}`)
        )}
        {isPaused && (translations.streamPaused || 'Log stream paused')}
      </div>

      {/* Header with controls */}
      <div className="flex-shrink-0 p-3 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-foreground">
              {translations.logs}
            </h3>

            {/* Live/History mode toggle */}
            <div className="flex bg-muted rounded-md p-0.5">
              <button
                onClick={() => setViewMode('live')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === 'live'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {translations.live}
              </button>
              <button
                onClick={() => setViewMode('history')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === 'history'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {translations.history}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Connection status */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connectionStatusColor}`} />
              <span className="text-xs text-muted-foreground">
                {connectionStatusText}
              </span>
            </div>

            {/* Paused indicator */}
            {isPaused && (
              <button
                onClick={resumeLive}
                className="px-2 py-1 text-xs bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400"
                aria-label={translations.resume || 'Resume live log stream'}
                title={translations.resume || 'Press Space or Enter to resume live logs'}
              >
                {translations.paused} - {translations.resume || 'Resume'}
              </button>
            )}

            {/* Reconnect button */}
            {connectionStatus.status === 'error' && (
              <button
                onClick={onReconnect}
                className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                {translations.reconnect}
              </button>
            )}

            {/* Clear logs */}
            <button
              onClick={onClear}
              className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
            >
              {translations.clear}
            </button>
          </div>
        </div>

        {/* Search and Filters - only show for live mode */}
        {viewMode === 'live' && (
          <>
            <LogSearch
              query={searchQuery}
              onQueryChange={setSearchQuery}
              placeholder={translations.searchPlaceholder || 'Search logs...'}
            />

            <LogFilters
              selectedLevels={selectedLevels}
              selectedTiers={selectedTiers}
              onLevelToggle={handleLevelToggle}
              onTierToggle={handleTierToggle}
            />
          </>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'live' ? (
          /* Live logs with virtual scrolling */
          <VirtualChatList
            messages={displayLogs}
            height={400} // Will be overridden by container height
            renderMessage={renderLogEvent}
            autoScrollToBottom={!isPaused && autoScroll}
            estimateMessageHeight={estimateLogHeight}
            onScroll={handleScroll}
            className="h-full"
          />
        ) : (
          /* Historical logs with pagination */
          <LogHistory
            projectId={projectId}
            advisorId={advisorId}
            translations={{
              history: translations.history,
              loading: translations.loading,
              noLogs: translations.noLogs,
              page: translations.page,
              of: translations.of,
              previous: translations.previous,
              next: translations.next,
              filters: translations.filters,
              search: translations.search,
              timeRange: translations.timeRange,
              levels: translations.levels,
              tiers: translations.tiers
            }}
          />
        )}
      </div>

      {/* Status bar - only show for live mode */}
      {viewMode === 'live' && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {displayLogs.length} logs
              {displayLogs.length === 4000 && ' (capped)'}
              {filteredLogs.length !== logs.length && ` (filtered from ${logs.length})`}
            </span>
            <span>
              {connectionStatus.retryCount && `Retry ${connectionStatus.retryCount}`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}