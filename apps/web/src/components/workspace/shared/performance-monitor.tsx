/**
 * Performance Monitor Component
 *
 * Displays workspace performance metrics and status
 * Part of Phase 2 enhanced monitoring features
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { Icon } from '@/components/ui/icon'

interface PerformanceMetrics {
  sessionDuration: number
  logCount: number
  reconnectAttempts: number
  lastError?: string
  memoryUsage?: number
  renderTime?: number
}

interface PerformanceMonitorProps {
  sessionId?: string | null
  isConnected: boolean
  metrics: PerformanceMetrics
  className?: string
}

export function PerformanceMonitor({
  sessionId,
  isConnected,
  metrics,
  className = ''
}: PerformanceMonitorProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [renderStats, setRenderStats] = useState({
    frameRate: 0,
    avgRenderTime: 0
  })

  const frameCountRef = useRef(0)
  const lastFrameTimeRef = useRef(performance.now())

  // Monitor render performance
  useEffect(() => {
    const updateRenderStats = () => {
      frameCountRef.current++
      const now = performance.now()
      const deltaTime = now - lastFrameTimeRef.current

      if (deltaTime >= 1000) { // Update every second
        const fps = Math.round((frameCountRef.current * 1000) / deltaTime)
        const avgRenderTime = deltaTime / frameCountRef.current

        setRenderStats({
          frameRate: fps,
          avgRenderTime: Math.round(avgRenderTime * 100) / 100
        })

        frameCountRef.current = 0
        lastFrameTimeRef.current = now
      }

      requestAnimationFrame(updateRenderStats)
    }

    const rafId = requestAnimationFrame(updateRenderStats)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Format duration
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  // Format memory usage
  const formatMemory = (bytes?: number) => {
    if (!bytes) return 'N/A'
    const mb = bytes / (1024 * 1024)
    return `${Math.round(mb)}MB`
  }

  // Determine status color
  const getStatusColor = () => {
    if (!isConnected || metrics.lastError) return 'text-red-500'
    if (metrics.reconnectAttempts > 0) return 'text-yellow-500'
    return 'text-green-500'
  }

  const statusColor = getStatusColor()

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      {/* Status indicator */}
      <div className="flex items-center gap-1">
        <Icon name="zap" className={`w-3 h-3 ${statusColor}`} />
        <span className="text-muted-foreground">
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* Session duration */}
      {metrics.sessionDuration > 0 && (
        <div className="text-muted-foreground">
          {formatDuration(metrics.sessionDuration)}
        </div>
      )}

      {/* Log count */}
      <div className="text-muted-foreground">
        {metrics.logCount.toLocaleString()} logs
      </div>

      {/* Warning indicators */}
      {(metrics.reconnectAttempts > 0 || metrics.lastError) && (
        <div className="flex items-center gap-1">
          <Icon name="alert-triangle" className="w-3 h-3 text-yellow-500" />
          <span className="text-yellow-600">
            {metrics.reconnectAttempts > 0 && `${metrics.reconnectAttempts} retries`}
          </span>
        </div>
      )}

      {/* Session ID (copyable) */}
      {sessionId && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(sessionId)
            // Could show a toast here
          }}
          className="text-muted-foreground hover:text-foreground transition-colors font-mono"
          title="Click to copy session ID"
        >
          #{sessionId.slice(-8)}
        </button>
      )}

      {/* Performance details toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Show performance details"
      >
        ⚡
      </button>

      {/* Performance details popover */}
      {showDetails && (
        <div className="absolute bottom-full right-0 mb-2 p-3 bg-background border border-border rounded-md shadow-lg z-50 min-w-48">
          <div className="space-y-2 text-xs">
            <div className="font-medium text-foreground">Performance</div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Frame Rate:</span>
              <span className="text-foreground">{renderStats.frameRate} FPS</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Render:</span>
              <span className="text-foreground">{renderStats.avgRenderTime}ms</span>
            </div>

            {metrics.memoryUsage && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Memory:</span>
                <span className="text-foreground">{formatMemory(metrics.memoryUsage)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-muted-foreground">Log Buffer:</span>
              <span className="text-foreground">{metrics.logCount}/4000</span>
            </div>

            {metrics.reconnectAttempts > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reconnects:</span>
                <span className="text-yellow-600">{metrics.reconnectAttempts}</span>
              </div>
            )}

            {metrics.lastError && (
              <div className="pt-2 border-t border-border">
                <div className="text-muted-foreground">Last Error:</div>
                <div className="text-red-500 text-xs mt-1 break-words">
                  {metrics.lastError}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}