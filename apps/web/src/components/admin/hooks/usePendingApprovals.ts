'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface PendingApproval {
  id: string
  action: string
  amount?: number
  expires_at: string
  age_hours: number
  requested_by: string
}

/**
 * Hook for polling pending approvals
 * Used by both desktop and mobile admin navigation
 */
export function usePendingApprovals(pollMs = 30_000) {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current = controller

    const fetchApprovals = async () => {
      try {
        const res = await fetch('/api/admin/approvals/pending', {
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json()
          setPendingApprovals(data.pending_approvals || [])
          setLastUpdatedAt(new Date())
          setError(null)
        } else {
          setError('Failed to refresh')
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          console.error('Failed to fetch pending approvals:', err)
          setError('Unable to refresh')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchApprovals()
    const id = window.setInterval(fetchApprovals, pollMs)

    return () => {
      controller.abort()
      window.clearInterval(id)
    }
  }, [pollMs])

  const urgentApprovals = useMemo(
    () => pendingApprovals.filter((a) => a.age_hours > 6),
    [pendingApprovals]
  )

  const refundCount = useMemo(
    () => pendingApprovals.filter((a) => a.action.includes('refund')).length,
    [pendingApprovals]
  )

  return {
    pendingApprovals,
    urgentApprovals,
    refundCount,
    totalNotifications: pendingApprovals.length,
    loading,
    lastUpdatedAt,
    error,
  }
}
