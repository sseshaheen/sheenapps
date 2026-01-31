'use client'

/**
 * Build Log Viewer Component
 * Enhanced with A/B testing between legacy NDJSON and new unified logs API
 * Streams and displays build logs with real-time updates for active builds
 */

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, RefreshCw, Download, Eye, EyeOff, ChevronDown, Zap, Archive } from 'lucide-react'
import type { LogEntry, LogLineEntry, LogMetaEntry, BuildInfo } from '@/types/admin-build-logs'
import { useUnifiedLogs, useBuildLogs, useUnifiedLogsWithSmartCaching } from '@/hooks/use-unified-logs'

interface BuildLogViewerProps {
  buildId: string
  buildInfo: BuildInfo
  // adminToken no longer needed - API routes handle authentication
  tailMode?: boolean // Start from end of file
  initialBytes?: string // e.g., "-5120" for last 5KB
}

export function BuildLogViewer({
  buildId,
  buildInfo,
  tailMode = false,
  initialBytes = tailMode ? '-10240' : undefined // Default to last 10KB in tail mode
}: BuildLogViewerProps) {
  // A/B Testing: Toggle between unified and legacy APIs
  const [useUnifiedAPI, setUseUnifiedAPI] = useState(() => {
    // Check URL parameter for admin override
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const forceMode = urlParams.get('log_api')
      if (forceMode === 'unified') return true
      if (forceMode === 'legacy') return false
    }

    // Check localStorage for user preference
    if (typeof window !== 'undefined') {
      const preference = localStorage.getItem('admin_log_api_preference')
      if (preference) return preference === 'unified'
    }

    // Default: Start with legacy for stability
    return false
  })

  const [showStderr, setShowStderr] = useState(true)
  const [showStdout, setShowStdout] = useState(true)
  const [isPolling, setIsPolling] = useState(false)

  // Legacy state
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [metadata, setMetadata] = useState<LogMetaEntry[]>([])

  const logContainerRef = useRef<HTMLDivElement>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Unified API hook with smart caching (only active when useUnifiedAPI is true)
  const unifiedLogsQuery = useUnifiedLogsWithSmartCaching({
    tier: 'build',
    buildId,
    format: 'raw',
    limit: 5000,
    enabled: useUnifiedAPI
  }, buildInfo.status)

  // Determine which data source to use
  const isUnifiedMode = useUnifiedAPI
  const isLoading = isUnifiedMode ? unifiedLogsQuery.isLoading : false
  const error = isUnifiedMode ? unifiedLogsQuery.error?.message || null : null
  const rawLogs = isUnifiedMode ? (unifiedLogsQuery.data as string) : null

  // Toggle API mode and save preference
  const toggleAPIMode = (mode: 'unified' | 'legacy') => {
    setUseUnifiedAPI(mode === 'unified')
    localStorage.setItem('admin_log_api_preference', mode)
  }

  // Process NDJSON stream
  const processLogStream = async (response: Response, append: boolean = false) => {
    if (!response.body) {
      throw new Error('No response body available')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const newLogs: LogEntry[] = []
    const newMetadata: LogMetaEntry[] = []

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const logEntry: LogEntry = JSON.parse(line)

              if (logEntry.kind === 'meta') {
                newMetadata.push(logEntry)
              } else if (logEntry.kind === 'line') {
                newLogs.push(logEntry)
              }
            } catch (parseError) {
              console.warn('Failed to parse log line:', line, parseError)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Update state
    if (append) {
      setLogs(prev => [...prev, ...newLogs])
      setMetadata(prev => [...prev, ...newMetadata])
    } else {
      setLogs(newLogs)
      setMetadata(newMetadata)
    }
  }

  // Legacy fetch logs (only used when useUnifiedAPI is false)
  const [legacyLoading, setLegacyLoading] = useState(false)
  const [legacyError, setLegacyError] = useState<string | null>(null)

  const fetchLogs = async (appendMode: boolean = false) => {
    if (useUnifiedAPI) return // Skip legacy fetch if using unified API

    try {
      setLegacyError(null)
      if (!appendMode) {
        setLegacyLoading(true)
      }

      const params = new URLSearchParams({
        _t: Date.now().toString() // Cache-busting timestamp
      })

      // Add bytes parameter for initial load in tail mode
      if (!appendMode && initialBytes) {
        params.append('bytes', initialBytes)
      }

      const response = await fetch(`/api/admin/builds/${buildId}/logs?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Network error' }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      await processLogStream(response, appendMode)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load build logs'
      setLegacyError(errorMessage)
      console.error('Build log fetch error:', err)
    } finally {
      setLegacyLoading(false)
    }
  }

  // Unified approach: determine final loading/error state
  const finalLoading = useUnifiedAPI ? unifiedLogsQuery.isLoading : legacyLoading
  const finalError = useUnifiedAPI ? (unifiedLogsQuery.error?.message || null) : legacyError

  // Start polling for active builds
  const startPolling = () => {
    if (pollingIntervalRef.current) return

    setIsPolling(true)
    pollingIntervalRef.current = setInterval(() => {
      // Only poll if build is still active
      if (buildInfo.status === 'building') {
        fetchLogs(true) // Append mode for polling
      } else {
        stopPolling()
      }
    }, 3000) // Poll every 3 seconds
  }

  // Stop polling
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setIsPolling(false)
  }

  // Auto-scroll to bottom for tail mode
  const scrollToBottom = () => {
    if (logContainerRef.current && tailMode) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }

  // Load logs on mount (legacy mode only)
  useEffect(() => {
    if (!useUnifiedAPI) {
      fetchLogs()

      // Auto-start polling for active builds in legacy mode
      if (buildInfo.status === 'building') {
        setTimeout(startPolling, 2000) // Start polling after initial load
      }
    }

    // Cleanup
    return () => {
      stopPolling()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [buildId, useUnifiedAPI])

  // Auto-scroll when new logs arrive in tail mode
  useEffect(() => {
    if (tailMode) {
      scrollToBottom()
    }
  }, [logs])

  // Format timestamp
  const formatTimestamp = (ts: number) => {
    const date = new Date(ts)
    const timeString = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    // Add milliseconds manually since fractionalSecondDigits is not widely supported
    const ms = date.getMilliseconds().toString().padStart(3, '0')
    return `${timeString}.${ms}`
  }

  // Process unified logs into displayable format
  const processUnifiedLogs = (rawLogs: string): LogLineEntry[] => {
    if (!rawLogs) return []

    return rawLogs.split('\n')
      .filter(line => line.trim())
      .map((line, index) => {
        // Try to parse structured log format: [timestamp] TIER [buildId] (source) message
        const structuredMatch = line.match(/^\[(.*?)\] (\w+) \[(.*?)\] \((stdout|stderr)\) (.*)$/)
        if (structuredMatch) {
          const [, timestamp, tier, buildId, source, message] = structuredMatch
          return {
            kind: 'line' as const,
            ts: new Date(timestamp).getTime() || Date.now(),
            seq: index + 1,
            src: source as 'stdout' | 'stderr',
            buildId,
            msg: message
          }
        }

        // Fallback: treat as stdout with basic parsing
        const timestampMatch = line.match(/^\[(.*?)\](.*)$/)
        if (timestampMatch) {
          const [, timestamp, message] = timestampMatch
          return {
            kind: 'line' as const,
            ts: new Date(timestamp).getTime() || Date.now(),
            seq: index + 1,
            src: 'stdout' as const,
            buildId,
            msg: message.trim()
          }
        }

        // Raw line without timestamp
        return {
          kind: 'line' as const,
          ts: Date.now(),
          seq: index + 1,
          src: 'stdout' as const,
          buildId,
          msg: line
        }
      })
  }

  // Get final logs based on API mode
  const finalLogs = useUnifiedAPI && rawLogs
    ? processUnifiedLogs(rawLogs)
    : logs

  // Filter logs based on source visibility
  const filteredLogs = finalLogs.filter((log): log is LogLineEntry => {
    if (log.kind !== 'line') return false
    if (log.src === 'stdout' && !showStdout) return false
    if (log.src === 'stderr' && !showStderr) return false
    return true
  })

  // Download logs - unified approach supporting both APIs
  const downloadLogs = async (format: 'ndjson' | 'raw') => {
    try {
      let url: string
      let filename: string

      if (useUnifiedAPI) {
        // Use unified logs API
        const params = new URLSearchParams({
          tier: 'build',
          buildId,
          format,
          limit: '10000' // Higher limit for downloads
        })
        url = `/api/admin/unified-logs/stream?${params.toString()}`
        filename = `build-${buildId.slice(0, 8)}-logs-unified.${format === 'raw' ? 'log' : 'ndjson'}`
      } else {
        // Use legacy API
        url = format === 'raw'
          ? `/api/admin/builds/${buildId}/logs/raw`
          : `/api/admin/builds/${buildId}/logs`
        filename = `build-${buildId.slice(0, 8)}-logs-legacy.${format === 'raw' ? 'log' : 'ndjson'}`
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(objectUrl)
      document.body.removeChild(a)
    } catch (err) {
      console.error(`Failed to download ${format} logs:`, err)
      // You might want to show a toast notification here
    }
  }

  // Legacy download functions for backward compatibility
  const downloadNDJSONLogs = () => downloadLogs('ndjson')
  const downloadRawLogs = () => downloadLogs('raw')

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            Build Logs
            {buildInfo.status === 'building' && (
              <Badge variant="secondary" className="ml-2">
                {isPolling ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Live
                  </>
                ) : (
                  'Building'
                )}
              </Badge>
            )}

            {/* A/B Testing API Mode Indicator */}
            <Badge variant={useUnifiedAPI ? "default" : "outline"} className="ml-2">
              {useUnifiedAPI ? (
                <>
                  <Zap className="h-3 w-3 mr-1" />
                  Unified API
                </>
              ) : (
                <>
                  <Archive className="h-3 w-3 mr-1" />
                  Legacy API
                </>
              )}
            </Badge>
          </CardTitle>

          <div className="flex items-center space-x-2">
            {/* Source filters */}
            <Button
              variant={showStdout ? "default" : "outline"}
              size="sm"
              onClick={() => setShowStdout(!showStdout)}
            >
              {showStdout ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
              stdout
            </Button>

            <Button
              variant={showStderr ? "default" : "outline"}
              size="sm"
              onClick={() => setShowStderr(!showStderr)}
            >
              {showStderr ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
              stderr
            </Button>

            {/* A/B Testing Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {useUnifiedAPI ? (
                    <Zap className="h-4 w-4 mr-1" />
                  ) : (
                    <Archive className="h-4 w-4 mr-1" />
                  )}
                  API Mode
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => toggleAPIMode('unified')}
                  className={useUnifiedAPI ? "bg-blue-50" : ""}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Unified API
                  <span className="ml-auto text-xs text-muted-foreground">New</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => toggleAPIMode('legacy')}
                  className={!useUnifiedAPI ? "bg-blue-50" : ""}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Legacy API
                  <span className="ml-auto text-xs text-muted-foreground">Stable</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Controls */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (useUnifiedAPI) {
                  unifiedLogsQuery.refetch()
                } else {
                  fetchLogs()
                }
              }}
              disabled={finalLoading}
            >
              {finalLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Refresh
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={downloadNDJSONLogs}>
                  <Download className="h-4 w-4 mr-2" />
                  Download NDJSON (.ndjson)
                  <span className="ml-auto text-xs text-muted-foreground">Structured</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={downloadRawLogs}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Raw Log (.log)
                  <span className="ml-auto text-xs text-muted-foreground">Plain text</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {buildInfo.status === 'building' && (
              <Button
                variant={isPolling ? "secondary" : "outline"}
                size="sm"
                onClick={isPolling ? stopPolling : startPolling}
              >
                {isPolling ? 'Stop Live' : 'Start Live'}
              </Button>
            )}
          </div>
        </div>

        {/* Metadata summary */}
        {metadata.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {metadata.map((meta, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {meta.version && `v${meta.version}`}
                {meta.startedAt && ` started ${new Date(meta.startedAt).toLocaleTimeString()}`}
                {meta.endedAt && ` ended ${new Date(meta.endedAt).toLocaleTimeString()}`}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {finalError && (
          <div className="p-4 bg-red-50 border-b border-red-200">
            <div className="text-sm font-medium text-red-800">Error loading logs:</div>
            <div className="mt-1 text-sm text-red-700">{finalError}</div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                if (useUnifiedAPI) {
                  unifiedLogsQuery.refetch()
                } else {
                  fetchLogs()
                }
              }}
            >
              Retry
            </Button>
            <span className="ml-2 text-xs text-gray-500">
              Using {useUnifiedAPI ? 'Unified' : 'Legacy'} API
            </span>
          </div>
        )}

        <div
          ref={logContainerRef}
          className="h-96 overflow-y-auto bg-gray-900 text-green-400 font-mono text-sm"
          style={{ maxHeight: '600px' }}
        >
          {finalLoading && filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Loader2 className="h-6 w-6 mr-2 animate-spin" />
              <span>Loading logs...</span>
              <span className="text-xs mt-1">
                Using {useUnifiedAPI ? 'Unified' : 'Legacy'} API
              </span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <span>No logs to display</span>
              {(!showStdout || !showStderr) && (
                <span className="text-sm mt-1">(check your filters)</span>
              )}
              <span className="text-xs mt-1">
                Using {useUnifiedAPI ? 'Unified' : 'Legacy'} API
              </span>
            </div>
          ) : (
            <div className="p-4 space-y-1">
              {filteredLogs.map((log, i) => (
                <div key={`${log.seq}-${i}`} className="flex">
                  <span className="text-gray-400 mr-2 flex-shrink-0 w-16">
                    {formatTimestamp(log.ts)}
                  </span>
                  <span
                    className={`mr-2 flex-shrink-0 w-12 ${
                      log.src === 'stderr' ? 'text-red-400' : 'text-blue-400'
                    }`}
                  >
                    [{log.src}]
                  </span>
                  <span className="text-gray-100 whitespace-pre-wrap break-all">
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer stats */}
        <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-600 flex justify-between">
          <span>
            {filteredLogs.length} lines displayed
            {logs.length !== filteredLogs.length && ` (${logs.length} total)`}
          </span>
          <span>
            Size: {(buildInfo.logSizeBytes / 1024).toFixed(1)} KB
            {isPolling && ' • Live updating...'}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}