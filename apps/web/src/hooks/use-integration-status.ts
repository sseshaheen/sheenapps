/**
 * Integration Status Management Hooks
 *
 * React hooks for managing integration status, actions, and real-time updates.
 * Uses React Query for caching and optimistic updates.
 * Follows backend API patterns established in September 2025.
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  IntegrationStatusResponse,
  IntegrationActionRequest,
  IntegrationActionResponse,
  IntegrationStatusEvent,
  IntegrationErrorResponse,
  IntegrationKey,
  IntegrationStatusState,
  IntegrationSSEState,
  IntegrationActionState
} from '@/types/integrationStatus'
import { logger } from '@/utils/logger'

// API client functions
const fetchIntegrationStatus = async (
  projectId: string,
  userId: string
): Promise<IntegrationStatusResponse> => {
  const params = new URLSearchParams({
    projectId,
    userId,
    _t: Date.now().toString() // Cache busting
  })

  const response = await fetch(`/api/integrations/status?${params}`, {
    headers: {
      'Cache-Control': 'no-cache'
    }
  })

  if (!response.ok) {
    const error: IntegrationErrorResponse = await response.json()
    throw new Error(error.message || 'Failed to fetch integration status')
  }

  return response.json()
}

const executeIntegrationAction = async (
  projectId: string,
  userId: string,
  request: IntegrationActionRequest
): Promise<IntegrationActionResponse> => {
  const idempotencyKey = uuidv4()

  const response = await fetch(`/api/integrations/actions/${projectId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      ...request,
      userId
    })
  })

  if (!response.ok) {
    const error: IntegrationErrorResponse = await response.json()
    throw new Error(error.message || 'Action execution failed')
  }

  return response.json()
}

// Main integration status hook with React Query
export function useIntegrationStatus(projectId: string, userId: string) {
  return useQuery({
    queryKey: ['integrations', 'status', projectId],
    queryFn: () => fetchIntegrationStatus(projectId, userId),
    staleTime: 10 * 1000, // 10s based on backend cache TTL
    refetchInterval: 30 * 1000, // 30s background refresh
    refetchOnWindowFocus: true,
    enabled: !!(projectId && userId),
    retry: (failureCount, error) => {
      // Don't retry auth errors
      if (error.message?.includes('authentication') || error.message?.includes('unauthorized')) {
        return false
      }
      return failureCount < 3
    }
  })
}

// Integration action execution hook with optimistic updates
export function useIntegrationActions(projectId: string, userId: string) {
  const queryClient = useQueryClient()
  const [actionState, setActionState] = useState<IntegrationActionState>({
    isExecuting: false
  })

  const mutation = useMutation({
    mutationFn: (request: IntegrationActionRequest) =>
      executeIntegrationAction(projectId, userId, request),

    onMutate: async (variables) => {
      setActionState({
        isExecuting: true,
        lastAction: {
          provider: variables.provider,
          action: variables.action,
          timestamp: Date.now(),
          success: false
        }
      })

      // Cancel any outgoing queries to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['integrations', 'status', projectId] })

      const previousStatus = queryClient.getQueryData(['integrations', 'status', projectId])

      // Optimistically update status to show action in progress
      queryClient.setQueryData(['integrations', 'status', projectId], (old: any) => {
        if (!old) return old

        return {
          ...old,
          items: old.items.map((item: any) => {
            if (item.key === variables.provider) {
              return {
                ...item,
                status: 'warning' as const,
                summary: `${variables.action} in progress...`
              }
            }
            return item
          })
        }
      })

      return { previousStatus }
    },

    onSuccess: (data, variables) => {
      setActionState(prev => ({
        ...prev,
        isExecuting: false,
        lastAction: {
          provider: variables.provider,
          action: variables.action,
          timestamp: Date.now(),
          success: true
        }
      }))

      logger.info('Integration action completed successfully', {
        provider: variables.provider,
        action: variables.action,
        operationId: data.operationId
      })
    },

    onError: (error, variables, context) => {
      setActionState(prev => ({
        ...prev,
        isExecuting: false,
        lastAction: {
          provider: variables.provider,
          action: variables.action,
          timestamp: Date.now(),
          success: false,
          error: error.message
        }
      }))

      // Revert optimistic update
      if (context?.previousStatus) {
        queryClient.setQueryData(['integrations', 'status', projectId], context.previousStatus)
      }

      logger.error('Integration action failed', {
        provider: variables.provider,
        action: variables.action,
        error: error.message
      })
    },

    onSettled: () => {
      // Refetch to get real status regardless of success/failure
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status', projectId] })
    }
  })

  const executeAction = useCallback(
    (provider: IntegrationKey, action: string, payload?: Record<string, any>) => {
      return mutation.mutate({ provider, action, payload })
    },
    [mutation]
  )

  return {
    executeAction,
    actionState,
    isExecuting: actionState.isExecuting,
    lastAction: actionState.lastAction
  }
}

// SSE hook for real-time integration updates
export function useIntegrationStatusSSE(projectId: string, userId: string, enabled: boolean = true) {
  const [state, setState] = useState<IntegrationSSEState>({
    events: [],
    connectionState: 'disconnected',
    reconnectAttempts: 0
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const queryClient = useQueryClient()

  const connect = useCallback(() => {
    if (!enabled || !projectId || !userId) return

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setState(prev => ({ ...prev, connectionState: 'connecting' }))

    const params = new URLSearchParams({
      projectId,
      userId
    })

    // Add Last-Event-ID if we have one for resumption
    if (state.lastEventId) {
      params.append('lastEventId', state.lastEventId)
    }

    const url = `/api/integrations/events?${params}`
    logger.info('Establishing integration SSE connection', { url, projectId })

    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      logger.info('Integration SSE connection opened', { projectId })
      setState(prev => ({
        ...prev,
        connectionState: 'connected',
        reconnectAttempts: 0
      }))
    }

    eventSource.onmessage = (event) => {
      try {
        const eventData: IntegrationStatusEvent = JSON.parse(event.data)

        setState(prev => ({
          ...prev,
          events: [...prev.events, eventData],
          lastEventId: event.lastEventId || eventData.id || prev.lastEventId
        }))

        // Update React Query cache based on event type
        if (eventData.type === 'status:update' && eventData.items) {
          queryClient.setQueryData(['integrations', 'status', projectId], (old: any) => {
            if (!old) return old
            return {
              ...old,
              items: eventData.items,
              renderHash: `${Date.now()}` // Force UI update
            }
          })
        }

        logger.debug('integration', 'SSE event received', {
          type: eventData.type,
          provider: eventData.provider,
          projectId: eventData.projectId
        })

      } catch (parseError) {
        logger.error('Failed to parse integration SSE event', {
          data: event.data.slice(0, 200),
          error: parseError
        })
      }
    }

    eventSource.onerror = () => {
      logger.error('Integration SSE connection error', { projectId })

      setState(prev => ({
        ...prev,
        connectionState: 'disconnected'
      }))

      eventSource.close()

      // Auto-reconnect with exponential backoff
      const attempt = state.reconnectAttempts + 1
      if (attempt <= 5) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 60000) // 1s → 2s → 4s → 8s → 16s → 60s max

        setState(prev => ({ ...prev, reconnectAttempts: attempt }))

        logger.info('Scheduling integration SSE reconnect', {
          attempt,
          delay,
          projectId
        })

        reconnectTimeoutRef.current = setTimeout(connect, delay)
      }
    }
  }, [enabled, projectId, userId, state.lastEventId, state.reconnectAttempts, queryClient])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setState(prev => ({
      ...prev,
      connectionState: 'disconnected'
    }))

    logger.info('Integration SSE connection manually disconnected', { projectId })
  }, [projectId])

  const clearEvents = useCallback(() => {
    setState(prev => ({
      ...prev,
      events: [],
      lastEventId: undefined
    }))
  }, [])

  // Connect when enabled and parameters are available
  useEffect(() => {
    if (enabled && projectId && userId) {
      connect()
    } else {
      disconnect()
    }

    return disconnect
  }, [enabled, projectId, userId, connect, disconnect])

  // Cleanup on unmount
  useEffect(() => {
    return disconnect
  }, [disconnect])

  return {
    events: state.events,
    connectionState: state.connectionState,
    lastEventId: state.lastEventId,
    reconnectAttempts: state.reconnectAttempts,
    connect,
    disconnect,
    clearEvents
  }
}

// Helper hook to get specific integration status
export function useIntegrationByKey(projectId: string, userId: string, key: IntegrationKey) {
  const { data, ...rest } = useIntegrationStatus(projectId, userId)

  const integration = data?.items.find(item => item.key === key)

  return {
    integration,
    isConnected: integration?.status === 'connected',
    hasWarning: integration?.status === 'warning',
    hasError: integration?.status === 'error',
    isDisconnected: integration?.status === 'disconnected',
    actions: integration?.actions || [],
    canPerformActions: integration?.actions?.some(action => action.can) || false,
    ...rest
  }
}

// Helper hook for workspace header overall status
export function useIntegrationOverallStatus(projectId: string, userId: string) {
  const { data, isLoading, isError } = useIntegrationStatus(projectId, userId)

  return {
    overall: data?.overall || 'disconnected',
    hasAnyError: data?.overall === 'error',
    hasAnyWarning: data?.overall === 'warning',
    allConnected: data?.overall === 'connected',
    isLoading,
    isError
  }
}