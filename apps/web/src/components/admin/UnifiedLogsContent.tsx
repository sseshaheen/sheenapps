'use client'

/**
 * Unified Logs Content Component
 * Comprehensive logging interface with intelligent filtering, real-time streaming,
 * and advanced display capabilities for all log tiers
 */

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Code2,
  Copy,
  Download,
  Eye,
  FileText,
  Filter,
  Hammer,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Search,
  Server,
  Zap
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { useUnifiedLogs, UseUnifiedLogsOptions } from '@/hooks/use-unified-logs'
import { LogMessageHighlighter } from './LogMessageHighlighter'

// Types
type LogTier = 'build' | 'deploy' | 'system' | 'action' | 'lifecycle'
type DisplayMode = 'table' | 'raw' | 'split'
type TimeRange = 'hour' | 'day' | 'week' | 'custom'

interface LogFilters {
  tier: LogTier
  timeRange: TimeRange
  customStartDate: string
  customEndDate: string
  userId: string
  projectId: string
  buildId: string
  instanceId: string
  searchQuery: string
  logLevels: string[]
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface UnifiedLogsContentProps {}

const LOG_TIER_CONFIG = {
  build: {
    label: 'Build',
    icon: Hammer,
    color: 'blue',
    description: 'Build processes, compilation, and CI/CD pipeline logs'
  },
  deploy: {
    label: 'Deploy',
    icon: Rocket,
    color: 'green',
    description: 'Deployment activities, infrastructure changes, and releases'
  },
  system: {
    label: 'System',
    icon: Server,
    color: 'gray',
    description: 'Server health, performance metrics, and system events'
  },
  action: {
    label: 'Action',
    icon: Activity,
    color: 'purple',
    description: 'User actions, API calls, and application interactions'
  },
  lifecycle: {
    label: 'Lifecycle',
    icon: Zap,
    color: 'orange',
    description: 'Application startup, shutdown, and maintenance events'
  }
} as const

const TIME_RANGE_OPTIONS = [
  { value: 'hour', label: 'Last Hour', hours: 1 },
  { value: 'day', label: 'Last 24 Hours', hours: 24 },
  { value: 'week', label: 'Last Week', hours: 168 },
  { value: 'custom', label: 'Custom Range', hours: 0 }
] as const

export function UnifiedLogsContent({}: UnifiedLogsContentProps) {
  const searchParams = useSearchParams()

  // Core state
  const [filters, setFilters] = useState<LogFilters>(() => {
    // Initialize with URL params if present
    const urlBuildId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('buildId') : null
    return {
      tier: 'build',
      timeRange: 'day',
      customStartDate: '',
      customEndDate: '',
      userId: '',
      projectId: '',
      buildId: urlBuildId || '',
      instanceId: '',
      searchQuery: '',
      logLevels: []
    }
  })

  const [displayMode, setDisplayMode] = useState<DisplayMode>('split')
  // NOTE: showFilters must be declared before the useEffect that uses setShowFilters
  const [showFilters, setShowFilters] = useState(() => {
    // Auto-show filters if buildId is in URL
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).has('buildId')
    }
    return false
  })

  // Update filters when URL params change
  useEffect(() => {
    const urlBuildId = searchParams.get('buildId')
    if (urlBuildId && urlBuildId !== filters.buildId) {
      setFilters(prev => ({ ...prev, buildId: urlBuildId }))
      setShowFilters(true) // Show filters panel when buildId is provided via URL
    }
  }, [searchParams])
  const [realTimeStreaming, setRealTimeStreaming] = useState(false)
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([])
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [selectedLogEntry, setSelectedLogEntry] = useState<any | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [showJsonFormatted, setShowJsonFormatted] = useState(false)
  const [splitViewJsonFormatted, setSplitViewJsonFormatted] = useState<Record<string, boolean>>({})
  const [globalJsonFormatted, setGlobalJsonFormatted] = useState(false)

  // Pagination and sorting
  const [currentPage, setCurrentPage] = useState(0)
  const [pageSize, setPageSize] = useState(100)
  const [expandText, setExpandText] = useState(false)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc') // Default to newest first

  // Calculate date range based on time selection
  const dateRange = useMemo(() => {
    if (filters.timeRange === 'custom') {
      return {
        startDate: filters.customStartDate || undefined,
        endDate: filters.customEndDate || undefined
      }
    }

    const timeConfig = TIME_RANGE_OPTIONS.find(t => t.value === filters.timeRange)
    if (!timeConfig) return {}

    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - (timeConfig.hours * 60 * 60 * 1000))

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }
  }, [filters.timeRange, filters.customStartDate, filters.customEndDate])

  // Prepare unified logs query options
  const logsOptions: UseUnifiedLogsOptions = {
    tier: filters.tier,
    buildId: filters.buildId || undefined,
    userId: filters.userId || undefined,
    projectId: filters.projectId || undefined,
    instanceId: filters.instanceId || undefined,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    format: displayMode === 'raw' ? 'raw' : 'ndjson',
    limit: pageSize,
    offset: currentPage * pageSize,
    sortOrder: sortOrder, // Pass sortOrder to backend
    enabled: true
  }

  // Fetch logs using the unified hook
  const { data: logsData, isLoading, isError, error, refetch } = useUnifiedLogs(logsOptions)

  // Use backend data directly - sorting is handled by the backend
  const finalLogsData = logsData

  const finalIsLoading = isLoading
  const finalIsError = isError

  // Handle filter changes
  const updateFilter = <K extends keyof LogFilters>(key: K, value: LogFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(0) // Reset pagination when filters change
  }

  // Copy to clipboard with feedback
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      setTimeout(() => setCopiedText(null), 2000)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  // Smart dropdown actions for log entries
  const copyFullLogEntry = (logEntry: any) => {
    const fullEntry = JSON.stringify(logEntry, null, 2)
    copyToClipboard(fullEntry)
  }

  const filterByUser = (userId: string) => {
    updateFilter('userId', userId)
    // Auto-expand filters panel to show what was applied
    setShowFilters(true)
  }

  const filterByProject = (projectId: string) => {
    updateFilter('projectId', projectId)
    setShowFilters(true)
  }

  const filterByBuild = (buildId: string) => {
    updateFilter('buildId', buildId)
    setShowFilters(true)
  }

  // Helper component to render metadata with clickable links while preserving JSON structure
  const MetadataRenderer = ({ metadata }: { metadata: any }) => {
    const jsonString = JSON.stringify(metadata, null, 2)
    const urlRegex = /"(https?:\/\/[^"]+)"/g
    const urls: string[] = []
    let match

    // Extract all URLs from the JSON string
    while ((match = urlRegex.exec(jsonString)) !== null) {
      urls.push(match[1])
    }

    return (
      <div className="relative">
        <pre className="text-sm font-mono text-green-400 whitespace-pre-wrap break-all">
          <LogMessageHighlighter
            message={jsonString}
            className="text-green-400"
            variant="balanced"
          />
        </pre>
        {/* Overlay clickable icons for URLs */}
        {urls.length > 0 && (
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {urls.map((url, index) => (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-gray-600 text-blue-400 hover:text-blue-300 bg-gray-800/80 backdrop-blur-sm"
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                title={`Open ${url} in new tab`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </Button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Utility function to detect and parse JSON from a string
  const tryParseJson = (text: string): { isJson: boolean; parsed?: any; formatted?: string } => {
    if (!text || typeof text !== 'string') {
      return { isJson: false }
    }

    // Quick heuristic check - must start with { or [
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return { isJson: false }
    }

    try {
      const parsed = JSON.parse(trimmed)
      // Only consider it JSON if it's an object or array (not primitive values)
      if (parsed !== null && (typeof parsed === 'object')) {
        const formatted = JSON.stringify(parsed, null, 2)
        return { isJson: true, parsed, formatted }
      }
      return { isJson: false }
    } catch {
      return { isJson: false }
    }
  }

  // Helper functions for split view JSON formatting
  const toggleSplitViewJsonFormat = (logEntryId: string) => {
    setSplitViewJsonFormatted(prev => ({
      ...prev,
      [logEntryId]: !prev[logEntryId]
    }))
  }

  const isSplitViewJsonFormatted = (logEntryId: string) => {
    return splitViewJsonFormatted[logEntryId] || globalJsonFormatted
  }

  // Global format functions
  const toggleGlobalJsonFormat = () => {
    const newState = !globalJsonFormatted
    setGlobalJsonFormatted(newState)

    if (newState) {
      // When enabling global format, clear individual settings so global takes precedence
      setSplitViewJsonFormatted({})
    }
  }

  const hasJsonContent = () => {
    if (!finalLogsData) return false
    // Only check for JSON content if finalLogsData is an array (not in raw mode)
    if (!Array.isArray(finalLogsData)) return false
    // Simplified: show if there are any messages without metadata (don't check if JSON is valid)
    return finalLogsData.some((logEntry: any) => {
      const messageContent = logEntry.message || logEntry.metadata?.message || ''
      const hasMetadata = logEntry.metadata && Object.keys(logEntry.metadata).length > 0
      return messageContent && !hasMetadata && tryParseJson(messageContent).isJson
    })
  }

  const openDetailModal = (logEntry: any) => {
    setSelectedLogEntry(logEntry)
    setIsDetailModalOpen(true)
    setShowJsonFormatted(false) // Reset to raw view when opening modal
  }

  // Export functionality
  const exportLogs = async (format: 'json' | 'csv' | 'raw') => {
    if (!finalLogsData) {
      console.warn('No logs to export')
      return
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const filename = `unified-logs-${filters.tier}-${timestamp}`

    let content: string
    let mimeType: string
    let fileExtension: string

    switch (format) {
      case 'json':
        content = JSON.stringify(finalLogsData, null, 2)
        mimeType = 'application/json'
        fileExtension = 'json'
        break

      case 'csv':
        if (!Array.isArray(finalLogsData)) {
          console.error('Cannot export non-array data as CSV', { finalLogsData, type: typeof finalLogsData })
          return
        }

        // CSV headers
        const headers = ['Timestamp', 'Tier', 'Event', 'Message', 'Instance ID', 'Build ID', 'User ID', 'Project ID']
        const csvRows = [headers.join(',')]

        // CSV data rows
        finalLogsData.forEach((log, index) => {
          try {
            const row = [
              `"${log.timestamp || ''}"`,
              `"${log.tier || ''}"`,
              `"${log.event || log.action || ''}"`, // Support both event and action fields
              `"${(log.message || log.metadata?.message || '').replace(/"/g, '""')}"`, // Escape quotes in message
              `"${log.instanceId || ''}"`,
              `"${log.buildId || ''}"`,
              `"${log.userId || ''}"`,
              `"${log.projectId || ''}"`
            ]
            csvRows.push(row.join(','))
          } catch (error) {
            console.error(`Error processing log entry ${index}:`, error, log)
          }
        })

        content = csvRows.join('\n')
        mimeType = 'text/csv'
        fileExtension = 'csv'
        break

      case 'raw':
        if (typeof finalLogsData === 'string') {
          content = finalLogsData
        } else if (Array.isArray(finalLogsData)) {
          // Convert log entries to readable text format
          content = finalLogsData.map(log =>
            `[${log.timestamp}] ${log.tier.toUpperCase()} ${log.event || log.action}: ${log.message || log.metadata?.message || ''}`
          ).join('\n')
        } else {
          content = String(finalLogsData)
        }
        mimeType = 'text/plain'
        fileExtension = 'txt'
        break

      default:
        console.error('Unsupported export format:', format)
        return
    }

    // Create and download file
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.${fileExtension}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // Get tier configuration
  const currentTierConfig = LOG_TIER_CONFIG[filters.tier]
  const TierIcon = currentTierConfig.icon

  return (
    <div className="space-y-6">
      {/* Quick Actions Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div className="flex items-center space-x-3">
              <TierIcon className="h-5 w-5 text-gray-600" />
              <CardTitle className="text-lg font-semibold">
                {currentTierConfig.label} Logs
              </CardTitle>
              {realTimeStreaming && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                    <span>Live</span>
                  </div>
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Real-time toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRealTimeStreaming(!realTimeStreaming)}
                className={realTimeStreaming ? 'text-green-600 border-green-600' : ''}
              >
                {realTimeStreaming ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                {realTimeStreaming ? 'Pause' : 'Stream'}
              </Button>

              {/* Filters toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filters
              </Button>

              {/* Refresh */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Refresh
              </Button>

              {/* Sort Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                title={sortOrder === 'desc' ? 'Newest first (click for oldest first)' : 'Oldest first (click for newest first)'}
              >
                {sortOrder === 'desc' ? (
                  <ArrowDown className="h-4 w-4 mr-1" />
                ) : (
                  <ArrowUp className="h-4 w-4 mr-1" />
                )}
                {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
              </Button>

              {/* Global JSON Format Toggle */}
              {hasJsonContent() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleGlobalJsonFormat}
                  className={`${globalJsonFormatted ? 'bg-blue-50 text-blue-600 border-blue-200' : ''}`}
                  title={globalJsonFormatted ? 'Show all messages as raw' : 'Format all JSON messages on page'}
                >
                  {globalJsonFormatted ? (
                    <>
                      <FileText className="h-4 w-4 mr-1" />
                      Raw All
                    </>
                  ) : (
                    <>
                      <Code2 className="h-4 w-4 mr-1" />
                      Format All
                    </>
                  )}
                </Button>
              )}

              {/* Export */}
              <Select onValueChange={(format) => exportLogs(format as 'json' | 'csv' | 'raw')}>
                <SelectTrigger className="w-auto">
                  <SelectValue placeholder={
                    <div className="flex items-center">
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </div>
                  } />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">Export as JSON</SelectItem>
                  <SelectItem value="csv">Export as CSV</SelectItem>
                  <SelectItem value="raw">Export as Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-gray-600 mt-1">
            {currentTierConfig.description}
          </p>
        </CardHeader>
      </Card>

      {/* Log Tier Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={filters.tier} onValueChange={(value) => updateFilter('tier', value as LogTier)}>
            <TabsList className="grid w-full grid-cols-5 gap-1 p-1 h-auto">
              {Object.entries(LOG_TIER_CONFIG).map(([key, config]) => {
                const Icon = config.icon
                return (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="flex flex-col items-center justify-center gap-1 p-2 h-[60px] sm:flex-row sm:gap-2 sm:h-[40px] sm:px-3 sm:py-2 text-center"
                    title={config.label}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs hidden sm:inline-block sm:text-sm leading-tight">{config.label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Advanced Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Time Range */}
              <div>
                <Label htmlFor="time-range">Time Range</Label>
                <Select value={filters.timeRange} onValueChange={(value) => updateFilter('timeRange', value as TimeRange)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_RANGE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* User ID */}
              <div>
                <Label htmlFor="user-id">User ID</Label>
                <Input
                  id="user-id"
                  placeholder="Filter by user ID..."
                  value={filters.userId}
                  onChange={(e) => updateFilter('userId', e.target.value)}
                />
              </div>

              {/* Project ID */}
              <div>
                <Label htmlFor="project-id">Project ID</Label>
                <Input
                  id="project-id"
                  placeholder="Filter by project ID..."
                  value={filters.projectId}
                  onChange={(e) => updateFilter('projectId', e.target.value)}
                />
              </div>

              {/* Build ID */}
              <div>
                <Label htmlFor="build-id">Build ID</Label>
                <Input
                  id="build-id"
                  placeholder="Filter by build ID..."
                  value={filters.buildId}
                  onChange={(e) => updateFilter('buildId', e.target.value)}
                />
              </div>
            </div>

            {/* Custom date range */}
            {filters.timeRange === 'custom' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="datetime-local"
                    value={filters.customStartDate}
                    onChange={(e) => updateFilter('customStartDate', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="datetime-local"
                    value={filters.customEndDate}
                    onChange={(e) => updateFilter('customEndDate', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Search */}
            <div className="mt-4">
              <Label htmlFor="search">Search in logs</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search log content..."
                  value={filters.searchQuery}
                  onChange={(e) => updateFilter('searchQuery', e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Display Mode & Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <CardTitle className="text-lg">Logs</CardTitle>

              {/* Display Mode Selection */}
              <div className="flex items-center space-x-1">
                <Button
                  variant={displayMode === 'split' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDisplayMode('split')}
                >
                  Split
                </Button>
                <Button
                  variant={displayMode === 'table' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDisplayMode('table')}
                >
                  Table
                </Button>
                <Button
                  variant={displayMode === 'raw' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDisplayMode('raw')}
                >
                  Raw
                </Button>
              </div>

              {/* Expand Text Toggle - Only show for table mode, on its own line on mobile */}
              {displayMode === 'table' && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="expand-text"
                    checked={expandText}
                    onCheckedChange={(checked) => setExpandText(!!checked)}
                  />
                  <Label htmlFor="expand-text" className="text-sm font-medium cursor-pointer">
                    Expand long text
                  </Label>
                </div>
              )}
            </div>

            {/* Results info */}
            <div className="text-sm text-gray-600 self-start sm:self-auto">
              {finalIsLoading ? 'Loading...' : `Page ${currentPage + 1}`}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Loading State */}
          {finalIsLoading && (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-500" />
              <div className="text-gray-600">Loading {currentTierConfig.label.toLowerCase()} logs...</div>
            </div>
          )}

          {/* Error State */}
          {finalIsError && (
            <div className="p-8 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
              <div className="text-red-800 font-medium mb-2">Error loading logs</div>
              <div className="text-red-600 text-sm mb-4">
                {error instanceof Error ? error.message : 'Unknown error occurred'}
              </div>
              <Button onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {/* No Data State */}
          {!finalIsLoading && !finalIsError && (!finalLogsData || (Array.isArray(finalLogsData) && finalLogsData.length === 0)) && (
            <div className="p-8 text-center text-gray-500">
              <Clock className="h-8 w-8 mx-auto mb-4" />
              <div>No logs found for the selected filters</div>
              <div className="text-sm mt-2">Try adjusting your time range or removing filters</div>
            </div>
          )}

          {/* Raw Display Mode */}
          {displayMode === 'raw' && finalLogsData && typeof finalLogsData === 'string' && (
            <div className="p-4">
              <div className="bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                <LogMessageHighlighter
                  message={finalLogsData}
                  className="text-green-400"
                  variant="balanced"
                />
              </div>
            </div>
          )}

          {/* Table Display Mode */}
          {displayMode === 'table' && finalLogsData && Array.isArray(finalLogsData) && finalLogsData.length > 0 && (
            <div className="overflow-x-auto">
              <table className={`w-full ${expandText ? 'table-auto' : 'table-fixed'}`}>
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className={`text-left py-3 px-2 sm:px-4 font-medium text-gray-700 ${expandText ? '' : 'w-32 sm:w-44'}`}>
                      <span className="hidden sm:inline">Timestamp</span>
                      <span className="sm:hidden">Time</span>
                    </th>
                    <th className={`text-left py-3 px-2 sm:px-4 font-medium text-gray-700 ${expandText ? '' : 'w-24 sm:w-40'}`}>Event</th>
                    <th className="text-left py-3 px-2 sm:px-4 font-medium text-gray-700">Message</th>
                    <th className={`text-left py-3 px-2 sm:px-4 font-medium text-gray-700 hidden md:table-cell ${expandText ? '' : 'w-28'}`}>Instance</th>
                    <th className={`text-left py-3 px-2 sm:px-4 font-medium text-gray-700 ${expandText ? '' : 'w-16 sm:w-20'}`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(finalLogsData) && finalLogsData.map((logEntry, index) => (
                    <tr key={`${logEntry.instanceId}-${logEntry.seq}-${index}`} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2 sm:px-4 text-sm">
                        <div className="flex items-center space-x-1">
                          <code className="text-xs bg-gray-100 px-1 rounded truncate">
                            <span className="hidden sm:inline">{formatTimestamp(logEntry.timestamp)}</span>
                            <span className="sm:hidden">{new Date(logEntry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-5 w-5 p-0 hidden sm:flex ${copiedText === logEntry.timestamp ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                            onClick={() => copyToClipboard(logEntry.timestamp)}
                            title={copiedText === logEntry.timestamp ? 'Copied!' : 'Copy timestamp'}
                          >
                            {copiedText === logEntry.timestamp ? (
                              <Check className="h-2.5 w-2.5" />
                            ) : (
                              <Copy className="h-2.5 w-2.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                      <td className="py-3 px-2 sm:px-4">
                        <div className="flex items-center">
                          <Badge
                            variant="outline"
                            className="text-xs font-mono bg-blue-50 text-blue-700 border-blue-200 truncate max-w-full"
                            title={logEntry.event || logEntry.action}
                          >
                            <span className="hidden sm:inline">{logEntry.event || logEntry.action}</span>
                            <span className="sm:hidden">{(logEntry.event || logEntry.action)?.slice(0, 4)}</span>
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 px-2 sm:px-4">
                        <div className={`text-sm break-all overflow-hidden ${expandText ? 'max-w-none' : 'max-w-[200px] sm:max-w-md'}`} style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace' }}>
                          {expandText ? (
                            <span className="whitespace-pre-wrap break-words">
                              {logEntry.message || logEntry.metadata?.message || ''}
                            </span>
                          ) : (
                            <span className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={logEntry.message || logEntry.metadata?.message || ''}>
                              {logEntry.message || logEntry.metadata?.message || ''}
                            </span>
                          )}
                        </div>
                        {/* Show instance ID on mobile (since instance column is hidden) */}
                        <div className="md:hidden mt-1">
                          <code className="text-xs bg-gray-100 px-1 rounded text-gray-600">
                            {logEntry.instanceId?.slice(0, 8)}...
                          </code>
                        </div>
                      </td>
                      <td className="py-3 px-2 sm:px-4 hidden md:table-cell">
                        <div className="flex items-center space-x-1">
                          <code className="text-xs bg-gray-100 px-1 rounded">
                            {logEntry.instanceId?.slice(0, 8)}...
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-5 w-5 p-0 ${copiedText === logEntry.instanceId ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                            onClick={() => copyToClipboard(logEntry.instanceId)}
                            title={copiedText === logEntry.instanceId ? 'Copied!' : 'Copy instance ID'}
                          >
                            {copiedText === logEntry.instanceId ? (
                              <Check className="h-2.5 w-2.5" />
                            ) : (
                              <Copy className="h-2.5 w-2.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                      <td className="py-3 px-2 sm:px-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* Core Actions */}
                            <DropdownMenuItem onClick={() => copyFullLogEntry(logEntry)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Full Entry
                            </DropdownMenuItem>

                            {/* Contextual Filter Actions */}
                            {logEntry.userId && (
                              <DropdownMenuItem onClick={() => filterByUser(logEntry.userId)}>
                                <Filter className="h-4 w-4 mr-2" />
                                Filter by User ({logEntry.userId.slice(0, 8)}...)
                              </DropdownMenuItem>
                            )}
                            {logEntry.projectId && (
                              <DropdownMenuItem onClick={() => filterByProject(logEntry.projectId)}>
                                <Filter className="h-4 w-4 mr-2" />
                                Filter by Project
                              </DropdownMenuItem>
                            )}
                            {logEntry.buildId && (
                              <DropdownMenuItem onClick={() => filterByBuild(logEntry.buildId)}>
                                <Hammer className="h-4 w-4 mr-2" />
                                View Build Logs
                              </DropdownMenuItem>
                            )}

                            {/* Detailed View */}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openDetailModal(logEntry)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Split Display Mode */}
          {displayMode === 'split' && finalLogsData && Array.isArray(finalLogsData) && finalLogsData.length > 0 && (
            <div className="space-y-4">
              {Array.isArray(finalLogsData) && finalLogsData.map((logEntry, index) => (
                <div key={`${logEntry.instanceId}-${logEntry.seq}-${index}`} className="border rounded-lg bg-white shadow-sm">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
                    {/* Left Panel - Structured Metadata */}
                    <div className="p-4 border-b lg:border-b-0 lg:border-r bg-gray-50">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            {logEntry.event || logEntry.action}
                          </Badge>
                          <div className="text-xs text-gray-500">
                            #{logEntry.seq || index + 1}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 font-medium">Time:</span>
                            <div className="flex items-center space-x-1">
                              <code className="text-xs bg-white px-2 py-1 rounded border">
                                {formatTimestamp(logEntry.timestamp)}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-5 w-5 p-0 ${copiedText === logEntry.timestamp ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                                onClick={() => copyToClipboard(logEntry.timestamp)}
                                title={copiedText === logEntry.timestamp ? 'Copied!' : 'Copy timestamp'}
                              >
                                {copiedText === logEntry.timestamp ? (
                                  <Check className="h-2.5 w-2.5" />
                                ) : (
                                  <Copy className="h-2.5 w-2.5" />
                                )}
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 font-medium">Tier:</span>
                            <Badge variant="secondary" className="text-xs">
                              {logEntry.tier}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 font-medium">Instance:</span>
                            <div className="flex items-center space-x-1">
                              <code className="text-xs bg-white px-2 py-1 rounded border">
                                {logEntry.instanceId?.slice(0, 12)}...
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-5 w-5 p-0 ${copiedText === logEntry.instanceId ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                                onClick={() => copyToClipboard(logEntry.instanceId)}
                                title={copiedText === logEntry.instanceId ? 'Copied!' : 'Copy instance ID'}
                              >
                                {copiedText === logEntry.instanceId ? (
                                  <Check className="h-2.5 w-2.5" />
                                ) : (
                                  <Copy className="h-2.5 w-2.5" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {logEntry.buildId && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600 font-medium">Build:</span>
                              <div className="flex items-center space-x-1">
                                <code className="text-xs bg-white px-2 py-1 rounded border">
                                  {logEntry.buildId.slice(0, 8)}...
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-5 w-5 p-0 ${copiedText === logEntry.buildId ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                                  onClick={() => copyToClipboard(logEntry.buildId)}
                                  title={copiedText === logEntry.buildId ? 'Copied!' : 'Copy build ID'}
                                >
                                  {copiedText === logEntry.buildId ? (
                                    <Check className="h-2.5 w-2.5" />
                                  ) : (
                                    <Copy className="h-2.5 w-2.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}

                          {logEntry.userId && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600 font-medium">User:</span>
                              <div className="flex items-center space-x-1">
                                <code className="text-xs bg-white px-2 py-1 rounded border">
                                  {logEntry.userId.slice(0, 8)}...
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-5 w-5 p-0 ${copiedText === logEntry.userId ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                                  onClick={() => copyToClipboard(logEntry.userId)}
                                  title={copiedText === logEntry.userId ? 'Copied!' : 'Copy user ID'}
                                >
                                  {copiedText === logEntry.userId ? (
                                    <Check className="h-2.5 w-2.5" />
                                  ) : (
                                    <Copy className="h-2.5 w-2.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}

                          {logEntry.projectId && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600 font-medium">Project:</span>
                              <div className="flex items-center space-x-1">
                                <code className="text-xs bg-white px-2 py-1 rounded border">
                                  {logEntry.projectId.slice(0, 8)}...
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-5 w-5 p-0 ${copiedText === logEntry.projectId ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                                  onClick={() => copyToClipboard(logEntry.projectId)}
                                  title={copiedText === logEntry.projectId ? 'Copied!' : 'Copy project ID'}
                                >
                                  {copiedText === logEntry.projectId ? (
                                    <Check className="h-2.5 w-2.5" />
                                  ) : (
                                    <Copy className="h-2.5 w-2.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    </div>

                    {/* Right Panel - Full Message + Metadata (spans 2 columns = 2/3 width) */}
                    <div className="p-4 lg:col-span-2">
                      <div className="space-y-4">
                        {/* Actions Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                          <h3 className="text-sm font-medium text-gray-700">Log Details</h3>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* Core Actions */}
                              <DropdownMenuItem onClick={() => copyFullLogEntry(logEntry)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Full Entry
                              </DropdownMenuItem>

                              {/* Contextual Filter Actions */}
                              {logEntry.userId && (
                                <DropdownMenuItem onClick={() => filterByUser(logEntry.userId)}>
                                  <Filter className="h-4 w-4 mr-2" />
                                  Filter by User ({logEntry.userId.slice(0, 8)}...)
                                </DropdownMenuItem>
                              )}
                              {logEntry.projectId && (
                                <DropdownMenuItem onClick={() => filterByProject(logEntry.projectId)}>
                                  <Filter className="h-4 w-4 mr-2" />
                                  Filter by Project
                                </DropdownMenuItem>
                              )}
                              {logEntry.buildId && (
                                <DropdownMenuItem onClick={() => filterByBuild(logEntry.buildId)}>
                                  <Hammer className="h-4 w-4 mr-2" />
                                  View Build Logs
                                </DropdownMenuItem>
                              )}

                              {/* Detailed View */}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openDetailModal(logEntry)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Message Section */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 font-medium text-sm">Message:</span>
                            <div className="flex space-x-1">
                              {/* JSON Format Button - Show when there's no metadata section */}
                              {(() => {
                                const messageContent = logEntry.message || logEntry.metadata?.message || ''
                                const hasMetadata = logEntry.metadata && Object.keys(logEntry.metadata).length > 0

                                return messageContent && !hasMetadata && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 hover:bg-gray-200"
                                    onClick={() => toggleSplitViewJsonFormat(logEntry.instanceId + logEntry.seq)}
                                    title={isSplitViewJsonFormatted(logEntry.instanceId + logEntry.seq) ? 'Show raw message' : 'Format as JSON'}
                                  >
                                    {isSplitViewJsonFormatted(logEntry.instanceId + logEntry.seq) ? (
                                      <FileText className="h-3 w-3" />
                                    ) : (
                                      <Code2 className="h-3 w-3" />
                                    )}
                                  </Button>
                                )
                              })()}
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-6 w-6 p-0 ${copiedText === (logEntry.message || logEntry.metadata?.message || '') ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                                onClick={() => copyToClipboard(logEntry.message || logEntry.metadata?.message || '')}
                                title={copiedText === (logEntry.message || logEntry.metadata?.message || '') ? 'Copied!' : 'Copy message'}
                              >
                                {copiedText === (logEntry.message || logEntry.metadata?.message || '') ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto">
                            <pre className="whitespace-pre-wrap break-words">
                              {(() => {
                                const messageContent = logEntry.message || logEntry.metadata?.message || ''
                                const hasMetadata = logEntry.metadata && Object.keys(logEntry.metadata).length > 0
                                const entryId = logEntry.instanceId + logEntry.seq

                                // Show formatted JSON if user toggled to formatted view and no metadata
                                if (!hasMetadata && isSplitViewJsonFormatted(entryId)) {
                                  try {
                                    const parsed = JSON.parse(messageContent)
                                    const formatted = JSON.stringify(parsed, null, 2)
                                    return (
                                      <LogMessageHighlighter
                                        message={formatted}
                                        className="text-green-400"
                                        variant="balanced"
                                      />
                                    )
                                  } catch {
                                    // Fallback to original if can't parse
                                  }
                                }

                                // Default: show original message with syntax highlighting
                                return (
                                  <LogMessageHighlighter
                                    message={messageContent}
                                    className="text-green-400"
                                  />
                                )
                              })()}
                            </pre>
                          </div>
                        </div>

                        {/* Metadata Section - Now positioned under message */}
                        {logEntry.metadata && Object.keys(logEntry.metadata).length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600 font-medium text-sm">Metadata:</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-6 w-6 p-0 ${copiedText === JSON.stringify(logEntry.metadata, null, 2) ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                                onClick={() => copyToClipboard(JSON.stringify(logEntry.metadata, null, 2))}
                                title={copiedText === JSON.stringify(logEntry.metadata, null, 2) ? 'Copied!' : 'Copy metadata'}
                              >
                                {copiedText === JSON.stringify(logEntry.metadata, null, 2) ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto">
                              <MetadataRenderer metadata={logEntry.metadata} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!finalIsLoading && finalLogsData && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, Array.isArray(finalLogsData) ? finalLogsData.length : 0)} logs
                </div>

                <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                    <SelectItem value="250">250 per page</SelectItem>
                    <SelectItem value="500">500 per page</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={!finalLogsData || (Array.isArray(finalLogsData) && finalLogsData.length < pageSize)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Log View Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[85vw] max-w-4xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden bg-white text-black">
          <div className="overflow-y-auto max-h-[75vh] sm:max-h-[70vh] pr-2">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Eye className="h-5 w-5" />
              <span>Log Entry Details</span>
            </DialogTitle>
            <DialogDescription>
              Comprehensive view of log entry with metadata, actions, and related context
            </DialogDescription>
          </DialogHeader>

          {selectedLogEntry && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <div className="space-y-2">
                  <span className="text-sm font-medium text-gray-600">Timestamp</span>
                  <div className="flex items-center space-x-2">
                    <code className="text-sm bg-white px-2 py-1 rounded border flex-1 break-all overflow-hidden">
                      {formatTimestamp(selectedLogEntry.timestamp)}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-6 w-6 p-0 flex-shrink-0 ${copiedText === selectedLogEntry.timestamp ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                      onClick={() => copyToClipboard(selectedLogEntry.timestamp)}
                      title={copiedText === selectedLogEntry.timestamp ? 'Copied!' : 'Copy timestamp'}
                    >
                      {copiedText === selectedLogEntry.timestamp ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Tier</span>
                    <Badge variant="outline" className={`text-${LOG_TIER_CONFIG[selectedLogEntry.tier]?.color}-600 border-${LOG_TIER_CONFIG[selectedLogEntry.tier]?.color}-200`}>
                      {LOG_TIER_CONFIG[selectedLogEntry.tier]?.label || selectedLogEntry.tier}
                    </Badge>
                  </div>
                </div>

                {selectedLogEntry.instanceId && (
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-gray-600">Instance ID</span>
                    <div className="flex items-center space-x-2">
                      <code className="text-sm bg-white px-2 py-1 rounded border flex-1 break-all overflow-hidden">
                        {selectedLogEntry.instanceId}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 w-6 p-0 flex-shrink-0 ${copiedText === selectedLogEntry.instanceId ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                        onClick={() => copyToClipboard(selectedLogEntry.instanceId)}
                        title={copiedText === selectedLogEntry.instanceId ? 'Copied!' : 'Copy instance ID'}
                      >
                        {copiedText === selectedLogEntry.instanceId ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <span className="text-sm font-medium text-gray-600">Event</span>
                  <code className="text-sm bg-white px-2 py-1 rounded border break-all overflow-hidden">
                    {selectedLogEntry.event || selectedLogEntry.action || 'N/A'}
                  </code>
                </div>
              </div>

              {/* Context Section */}
              {(selectedLogEntry.userId || selectedLogEntry.projectId || selectedLogEntry.buildId) && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Context</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {selectedLogEntry.userId && (
                      <div className="space-y-2 p-3 border rounded-lg">
                        <span className="text-sm font-medium text-gray-600">User ID</span>
                        <div className="flex items-center space-x-2">
                          <code className="text-xs bg-gray-50 px-2 py-1 rounded border flex-1 break-all overflow-hidden">
                            {selectedLogEntry.userId}
                          </code>
                          <div className="flex space-x-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-6 w-6 p-0 ${copiedText === selectedLogEntry.userId ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                              onClick={() => copyToClipboard(selectedLogEntry.userId)}
                              title="Copy user ID"
                            >
                              {copiedText === selectedLogEntry.userId ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                filterByUser(selectedLogEntry.userId)
                                setIsDetailModalOpen(false)
                              }}
                              title="Filter by this user"
                            >
                              <Filter className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedLogEntry.projectId && (
                      <div className="space-y-2 p-3 border rounded-lg">
                        <span className="text-sm font-medium text-gray-600">Project ID</span>
                        <div className="flex items-center space-x-2">
                          <code className="text-xs bg-gray-50 px-2 py-1 rounded border flex-1 break-all overflow-hidden">
                            {selectedLogEntry.projectId}
                          </code>
                          <div className="flex space-x-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-6 w-6 p-0 ${copiedText === selectedLogEntry.projectId ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                              onClick={() => copyToClipboard(selectedLogEntry.projectId)}
                              title="Copy project ID"
                            >
                              {copiedText === selectedLogEntry.projectId ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                filterByProject(selectedLogEntry.projectId)
                                setIsDetailModalOpen(false)
                              }}
                              title="Filter by this project"
                            >
                              <Filter className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedLogEntry.buildId && (
                      <div className="space-y-2 p-3 border rounded-lg">
                        <span className="text-sm font-medium text-gray-600">Build ID</span>
                        <div className="flex items-center space-x-2">
                          <code className="text-xs bg-gray-50 px-2 py-1 rounded border flex-1 break-all overflow-hidden">
                            {selectedLogEntry.buildId}
                          </code>
                          <div className="flex space-x-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-6 w-6 p-0 ${copiedText === selectedLogEntry.buildId ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                              onClick={() => copyToClipboard(selectedLogEntry.buildId)}
                              title="Copy build ID"
                            >
                              {copiedText === selectedLogEntry.buildId ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                filterByBuild(selectedLogEntry.buildId)
                                setIsDetailModalOpen(false)
                              }}
                              title="View all build logs"
                            >
                              <Hammer className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Message Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Message</h3>
                  <div className="flex space-x-2">
                    {/* JSON Format Button - Show when message contains potential JSON */}
                    {(() => {
                      const messageContent = selectedLogEntry.message || selectedLogEntry.metadata?.message || ''
                      const hasMetadata = selectedLogEntry.metadata && Object.keys(selectedLogEntry.metadata).length > 0
                      const mightBeJson = messageContent && (messageContent.trim().startsWith('{') || messageContent.trim().startsWith('['))

                      return messageContent && mightBeJson && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowJsonFormatted(!showJsonFormatted)}
                          className="text-xs"
                          title={showJsonFormatted ? 'Show raw message' : 'Format as JSON'}
                        >
                          {showJsonFormatted ? (
                            <>
                              <FileText className="h-3 w-3 mr-1" />
                              Raw
                            </>
                          ) : (
                            <>
                              <Code2 className="h-3 w-3 mr-1" />
                              Format
                            </>
                          )}
                        </Button>
                      )
                    })()}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(selectedLogEntry.message || selectedLogEntry.metadata?.message || '')}
                      className={copiedText === (selectedLogEntry.message || selectedLogEntry.metadata?.message || '') ? 'bg-green-100 text-green-600 border-green-200' : ''}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {copiedText === (selectedLogEntry.message || selectedLogEntry.metadata?.message || '') ? 'Copied!' : 'Copy Message'}
                    </Button>
                  </div>
                </div>
                <div className="p-4 bg-gray-900 text-white border rounded-lg overflow-x-auto break-words">
                  {(() => {
                    const messageContent = selectedLogEntry.message || selectedLogEntry.metadata?.message || 'No message content'
                    const hasMetadata = selectedLogEntry.metadata && Object.keys(selectedLogEntry.metadata).length > 0

                    // Show formatted JSON if user toggled to formatted view
                    if (showJsonFormatted) {
                      try {
                        // Parse and re-stringify to ensure consistent formatting
                        const parsed = JSON.parse(messageContent.trim())
                        const formatted = JSON.stringify(parsed, null, 2)
                        return (
                          <div className="text-sm font-mono whitespace-pre-wrap">
                            <LogMessageHighlighter
                              message={formatted}
                              className="text-sm font-mono"
                              variant="balanced"
                            />
                          </div>
                        )
                      } catch (error) {
                        // Fallback to original if can't parse - but show a message about formatting failure
                        return (
                          <div className="text-sm font-mono break-all">
                            <div className="text-yellow-400 mb-2 text-xs">⚠️ Could not parse as JSON - showing original:</div>
                            <LogMessageHighlighter
                              message={messageContent}
                              className="text-sm font-mono break-all"
                              variant="balanced"
                            />
                          </div>
                        )
                      }
                    } else {
                      // Show raw/minified JSON
                      try {
                        // Parse and re-stringify as single line to show "raw" version
                        const parsed = JSON.parse(messageContent.trim())
                        const minified = JSON.stringify(parsed)
                        return (
                          <div className="text-sm font-mono break-all">
                            <LogMessageHighlighter
                              message={minified}
                              className="text-sm font-mono"
                              variant="balanced"
                            />
                          </div>
                        )
                      } catch (error) {
                        // Not valid JSON, show original
                        return (
                          <LogMessageHighlighter
                            message={messageContent}
                            className="text-sm font-mono"
                            variant="balanced"
                          />
                        )
                      }
                    }
                  })()}
                </div>
              </div>

              {/* Metadata Section */}
              {selectedLogEntry.metadata && Object.keys(selectedLogEntry.metadata).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Metadata</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(JSON.stringify(selectedLogEntry.metadata, null, 2))}
                      className={copiedText === JSON.stringify(selectedLogEntry.metadata, null, 2) ? 'bg-green-100 text-green-600 border-green-200' : ''}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {copiedText === JSON.stringify(selectedLogEntry.metadata, null, 2) ? 'Copied!' : 'Copy Metadata'}
                    </Button>
                  </div>
                  <div className="p-4 bg-gray-900 rounded-lg overflow-x-auto break-words">
                    <MetadataRenderer metadata={selectedLogEntry.metadata} />
                  </div>
                </div>
              )}

              {/* Actions Section */}
              <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => copyFullLogEntry(selectedLogEntry)}
                  className={copiedText === JSON.stringify(selectedLogEntry, null, 2) ? 'bg-green-100 text-green-600 border-green-200' : ''}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {copiedText === JSON.stringify(selectedLogEntry, null, 2) ? 'Copied!' : 'Copy Full Entry'}
                </Button>
                <Button variant="default" onClick={() => setIsDetailModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
