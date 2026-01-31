/**
 * Session Manager Component
 *
 * Session lifecycle management with start/end controls
 * Part of shared workspace session management
 */

'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/icon'

interface SessionManagerProps {
  sessionId?: string | null
  isActive: boolean
  onStart: () => Promise<void> | void
  onEnd: () => Promise<void> | void
  error?: string | null
  translations: {
    start: string
    end: string
    active: string
    inactive: string
  }
}

export function SessionManager({
  sessionId,
  isActive,
  onStart,
  onEnd,
  error,
  translations
}: SessionManagerProps) {
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    setLoading(true)
    try {
      await onStart()
    } finally {
      setLoading(false)
    }
  }

  const handleEnd = async () => {
    setLoading(true)
    try {
      await onEnd()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Session status indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            isActive ? 'bg-green-500' : 'bg-gray-400'
          }`}
        />
        <span className="text-sm text-muted-foreground">
          {isActive ? translations.active : translations.inactive}
        </span>
      </div>

      {/* Session controls */}
      {isActive ? (
        <button
          onClick={handleEnd}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Icon name="stop-circle" className="w-4 h-4"  />
          {loading ? 'Ending...' : translations.end}
        </button>
      ) : (
        <button
          onClick={handleStart}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Icon name="play" className="w-4 h-4"  />
          {loading ? 'Starting...' : translations.start}
        </button>
      )}

      {/* Session ID display */}
      {sessionId && (
        <div className="text-xs text-muted-foreground font-mono">
          Session: {sessionId.slice(-8)}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="text-xs text-red-500 max-w-xs truncate" title={error}>
          Error: {error}
        </div>
      )}
    </div>
  )
}