/**
 * Log Event Item Component
 *
 * Individual log entry display with syntax highlighting for search
 * Part of virtualized log viewer
 */

'use client'

interface LogEvent {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  tier: 'system' | 'application' | 'build' | 'deploy'
  message: string
  metadata?: Record<string, any>
}

interface LogEventItemProps {
  log: LogEvent
  index: number
  searchQuery?: string
}

const LOG_LEVEL_COLORS = {
  debug: 'text-gray-500',
  info: 'text-blue-500',
  warn: 'text-yellow-500',
  error: 'text-red-500'
}

const LOG_LEVEL_BACKGROUNDS = {
  debug: 'bg-gray-500/10',
  info: 'bg-blue-500/10',
  warn: 'bg-yellow-500/10',
  error: 'bg-red-500/10'
}

const LOG_TIER_COLORS = {
  system: 'text-purple-500',
  application: 'text-green-500',
  build: 'text-orange-500',
  deploy: 'text-cyan-500'
}

export function LogEventItem({ log, index, searchQuery }: LogEventItemProps) {
  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    } catch {
      return timestamp
    }
  }

  const highlightSearchQuery = (text: string, query?: string) => {
    if (!query) return text

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  return (
    <div className={`p-3 border-b border-border/50 hover:bg-muted/30 transition-colors ${LOG_LEVEL_BACKGROUNDS[log.level]}`}>
      <div className="flex items-start gap-3">
        {/* Timestamp */}
        <div className="flex-shrink-0 text-xs text-muted-foreground font-mono">
          {formatTime(log.timestamp)}
        </div>

        {/* Level badge */}
        <div className={`flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded ${LOG_LEVEL_COLORS[log.level]} bg-current/10`}>
          {log.level.toUpperCase()}
        </div>

        {/* Tier badge */}
        <div className={`flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded border ${LOG_TIER_COLORS[log.tier]} border-current/20`}>
          {log.tier}
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-foreground font-mono break-words">
            {highlightSearchQuery(log.message, searchQuery)}
          </div>

          {/* Metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              <details className="group">
                <summary className="cursor-pointer hover:text-foreground">
                  <span className="group-open:hidden">Show metadata</span>
                  <span className="hidden group-open:inline">Hide metadata</span>
                </summary>
                <pre className="mt-1 p-2 bg-muted/50 rounded text-xs overflow-x-auto">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>

        {/* Log ID */}
        <div className="flex-shrink-0 text-xs text-muted-foreground font-mono">
          #{log.id.slice(-6)}
        </div>
      </div>
    </div>
  )
}