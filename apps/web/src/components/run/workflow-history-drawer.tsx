'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import Icon, { type IconName } from '@/components/ui/icon'
import { LoadingSpinner } from '@/components/ui/loading'
import { formatDistanceToNow } from 'date-fns'

interface WorkflowOutcome {
  model: string
  windowHours: number
  conversions: number
  revenueCents: number
  currency: string
  confidence: 'high' | 'medium' | 'low'
  matchedBy: string
}

interface WorkflowResult {
  totalRecipients: number
  successful: number
  failed: number
}

interface WorkflowRun {
  id: string
  actionId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  requestedAt: string
  completedAt?: string
  result?: WorkflowResult
  outcome?: WorkflowOutcome
}

const ACTION_LABELS: Record<string, { icon: IconName; label: string }> = {
  recover_abandoned: { icon: 'credit-card', label: 'Recover Abandoned' },
  send_promo: { icon: 'tag', label: 'Send Promo' },
  post_update: { icon: 'mail', label: 'Post Update' },
  onboard_users: { icon: 'users', label: 'Onboard Users' },
  follow_up_orders: { icon: 'package', label: 'Follow Up Orders' },
}

const STATUS_CONFIG: Record<string, { icon: IconName; color: string; label: string }> = {
  queued: { icon: 'clock', color: 'text-muted-foreground', label: 'Queued' },
  running: { icon: 'loader-2', color: 'text-blue-500', label: 'Running' },
  succeeded: { icon: 'check-circle', color: 'text-emerald-500', label: 'Succeeded' },
  failed: { icon: 'x-circle', color: 'text-red-500', label: 'Failed' },
}

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'High confidence',
  medium: 'Estimated',
  low: 'Low confidence',
}

interface WorkflowHistoryDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  translations: {
    title: string
    empty: string
    recipients: string
    sent: string
    failed: string
    conversions: string
    revenue: string
    confidence: string
    loadMore: string
    runAgain: string
  }
}

export function WorkflowHistoryDrawer({
  open,
  onOpenChange,
  projectId,
  translations: t,
}: WorkflowHistoryDrawerProps) {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const fetchRuns = useCallback(async (nextCursor?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: '20',
        _t: Date.now().toString(),
      })
      if (nextCursor) params.set('cursor', nextCursor)

      const res = await fetch(
        `/api/projects/${projectId}/run/workflow-runs?${params}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }
      )
      if (!res.ok) return
      const json = await res.json()
      if (!json.ok || !json.data?.runs) return

      if (nextCursor) {
        setRuns(prev => [...prev, ...json.data.runs])
      } else {
        setRuns(json.data.runs)
      }
      setCursor(json.data.nextCursor ?? null)
      setHasMore(!!json.data.nextCursor)
    } catch {
      // Silent failure
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (open) {
      fetchRuns()
    } else {
      // Reset on close
      setRuns([])
      setCursor(null)
      setHasMore(false)
    }
  }, [open, fetchRuns])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Icon name="activity" className="w-5 h-5" />
            {t.title}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {loading && runs.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          )}

          {!loading && runs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {t.empty}
            </div>
          )}

          {runs.map((run) => {
            const actionConfig = ACTION_LABELS[run.actionId] ?? {
              icon: 'zap' as IconName,
              label: run.actionId,
            }
            const statusConfig = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.queued

            return (
              <div
                key={run.id}
                className="rounded-lg border p-4 space-y-3"
              >
                {/* Header: action + status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name={actionConfig.icon} className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{actionConfig.label}</span>
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${statusConfig.color}`}>
                    <Icon
                      name={statusConfig.icon}
                      className={`w-3.5 h-3.5 ${run.status === 'running' ? 'animate-spin' : ''}`}
                    />
                    <span>{statusConfig.label}</span>
                  </div>
                </div>

                {/* Time */}
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(run.requestedAt), { addSuffix: true })}
                </div>

                {/* Result: recipients */}
                {run.result && (
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">
                      {t.sent}: <span className="font-medium text-foreground">{run.result.successful}</span>
                    </span>
                    {run.result.failed > 0 && (
                      <span className="text-red-500">
                        {t.failed}: {run.result.failed}
                      </span>
                    )}
                  </div>
                )}

                {/* Outcome: conversions + revenue */}
                {run.outcome && run.outcome.conversions > 0 && (
                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                      <Icon name="trending-up" className="w-4 h-4" />
                      <span>{t.revenue}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">{t.conversions}: </span>
                        <span className="font-medium">{run.outcome.conversions}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{run.outcome.currency}: </span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {(run.outcome.revenueCents / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {t.confidence}: {CONFIDENCE_LABELS[run.outcome.confidence] ?? run.outcome.confidence}
                      {' · '}
                      {run.outcome.matchedBy}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cursor && fetchRuns(cursor)}
                disabled={loading}
                className="min-h-[44px] sm:min-h-[32px]"
              >
                {loading && <LoadingSpinner size="sm" className="mr-2" />}
                {t.loadMore}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
