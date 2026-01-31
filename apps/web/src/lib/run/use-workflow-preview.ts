/**
 * useWorkflowPreview - Shared preview logic for workflow modals
 *
 * Eliminates duplication across SendPromoModal, PostUpdateModal, RecoverAbandonedModal.
 * Handles abort on unmount to prevent state updates after modal closes.
 */

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type PreviewData = {
  count: number
  sample: Array<{ email: string; name?: string }>
  criteria: string
  exclusions: string[]
  warnings: string[]
  blocked?: { reason: string }
}

export interface UseWorkflowPreviewOptions {
  projectId: string
  actionId: string
  params?: Record<string, unknown>
  enabled: boolean
}

/**
 * Fetches workflow preview with automatic abort on unmount.
 *
 * @example
 * const { loading, data, error, refetch } = useWorkflowPreview({
 *   projectId,
 *   actionId: 'send_promo',
 *   params: { segmentation: 'recent_30d' },
 *   enabled: open
 * })
 */
export function useWorkflowPreview(opts: UseWorkflowPreviewOptions) {
  const { projectId, actionId, params, enabled } = opts
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const reqIdRef = useRef(0) // Request counter to prevent race conditions

  // Stable params key to avoid refetches on object key reordering
  const paramsKey = useMemo(() => {
    try {
      return JSON.stringify(params ?? {})
    } catch {
      return ''
    }
  }, [params])

  const fetchPreview = useCallback(async () => {
    // Increment request ID before starting
    const reqId = ++reqIdRef.current

    // Abort any pending request
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/run/workflow-runs/preview`, {
        method: 'POST',
        credentials: 'include', // Explicit cookie auth
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({ actionId, params }),
      })

      const json = await res.json().catch(() => null)

      // Only update state if this is still the latest request
      if (reqId !== reqIdRef.current) return

      if (!res.ok || !json?.ok) {
        setError(json?.error?.message || 'Failed to load preview')
        setData(null)
        return
      }

      setData(json.data)
      if (json.data?.blocked?.reason) {
        setError(json.data.blocked.reason)
      }
    } catch (e: unknown) {
      // Only update state if this is still the latest request
      if (reqId !== reqIdRef.current) return
      if ((e as Error)?.name !== 'AbortError') {
        setError('Failed to load preview')
      }
    } finally {
      // Only update loading if this is still the latest request
      if (reqId === reqIdRef.current) {
        setLoading(false)
      }
    }
  }, [projectId, actionId, paramsKey])

  useEffect(() => {
    if (!enabled) return
    fetchPreview()
    return () => abortRef.current?.abort()
  }, [enabled, fetchPreview])

  return { loading, data, error, refetch: fetchPreview }
}
