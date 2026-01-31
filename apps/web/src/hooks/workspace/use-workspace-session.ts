/**
 * Workspace Session Hook
 *
 * Session lifecycle management with heartbeat
 * Follows expert patterns from implementation plan
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { logger } from '@/utils/logger'

interface UseWorkspaceSessionReturn {
  sessionId: string | null
  isActive: boolean
  startSession: () => Promise<void>
  endSession: () => Promise<void>
  error: string | null
  isLoading: boolean
}

export function useWorkspaceSession(
  projectId: string,
  advisorId: string
): UseWorkspaceSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Start heartbeat (15 second intervals as per backend spec)
  const startHeartbeat = useCallback((sessionId: string) => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
    }

    heartbeatIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/workspace/session/ping', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          body: JSON.stringify({
            session_id: sessionId,
            advisor_id: advisorId
          })
        })

        if (!response.ok) {
          throw new Error(`Heartbeat failed: ${response.statusText}`)
        }

        const data = await response.json()
        if (!data.session_active) {
          logger.warn('Session no longer active', { sessionId }, 'workspace-session')
          setIsActive(false)
          setSessionId(null)
          stopHeartbeat()
        }
      } catch (error) {
        logger.error('Heartbeat error', {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'workspace-session')
      }
    }, 15000) // 15 seconds
  }, [advisorId])

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
  }, [])

  // Start session
  const startSession = useCallback(async () => {
    if (isLoading || isActive) return

    setIsLoading(true)
    setError(null)

    try {
      logger.info('Starting session', { projectId, advisorId }, 'workspace-session')

      const response = await fetch('/api/workspace/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          project_id: projectId,
          advisor_id: advisorId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setSessionId(data.session_id)
      setIsActive(true)
      startHeartbeat(data.session_id)

      logger.info('Session started', {
        sessionId: data.session_id,
        projectId,
        advisorId
      }, 'workspace-session')

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start session'
      setError(message)
      logger.error('Failed to start session', {
        projectId,
        advisorId,
        error: message
      }, 'workspace-session')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, advisorId, isLoading, isActive, startHeartbeat])

  // End session
  const endSession = useCallback(async () => {
    if (isLoading || !isActive || !sessionId) return

    setIsLoading(true)
    setError(null)

    try {
      logger.info('Ending session', { sessionId, projectId, advisorId }, 'workspace-session')

      stopHeartbeat()

      const response = await fetch('/api/workspace/session/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          session_id: sessionId,
          advisor_id: advisorId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setSessionId(null)
      setIsActive(false)

      logger.info('Session ended', {
        sessionId,
        durationSeconds: data.session_duration_seconds
      }, 'workspace-session')

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to end session'
      setError(message)
      logger.error('Failed to end session', {
        sessionId,
        error: message
      }, 'workspace-session')
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, advisorId, isLoading, isActive, stopHeartbeat])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopHeartbeat()
    }
  }, [stopHeartbeat])

  return {
    sessionId,
    isActive,
    startSession,
    endSession,
    error,
    isLoading
  }
}