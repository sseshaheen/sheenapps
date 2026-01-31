'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import type { HostingStatus, StatusVariant } from '@/types/inhouse-api'
import { getStatusVariant } from '@/types/inhouse-api'
import { useLocale } from 'next-intl'
import { DeploymentHistory } from './DeploymentHistory'
import { emitFunnelEventOnce } from '@/utils/easy-mode-funnel'

interface HostingStatusCardProps {
  projectId: string
  status: HostingStatus
  /** Called when rollback to a build is triggered */
  onRollback?: (buildId: string) => Promise<void>
  /** Called when "View all" is clicked in deployment history */
  onViewAllHistory?: () => void
  translations: {
    title: string
    url: string
    subdomain: string
    lastDeploy: string
    currentBuild: string
    noDeploymentsYet: string
    status: {
      live: string
      deploying: string
      none: string
      error: string
    }
    actions: {
      openSite: string
    }
    history?: {
      title: string
      viewAll: string
      live: string
      ago: string
      failed: string
      deployed: string
      deploying: string
      uploading: string
      rollbackTo: string
      rollbackConfirm: string
      rollbackDescription: string
      cancel: string
      confirmRollback: string
      rollingBack: string
      rollbackSuccess: string
      rollbackError: string
      empty: string
      loadMore: string
    }
  }
}

export function HostingStatusCard({
  projectId,
  status,
  onRollback,
  onViewAllHistory,
  translations
}: HostingStatusCardProps) {
  const locale = useLocale()
  const [historyOpen, setHistoryOpen] = useState(false)
  const statusVariant = getStatusVariant(status.status)
  const statusText = translations.status[status.status] || status.status

  const badgeVariantMap: Partial<Record<StatusVariant | 'live' | 'deploying' | 'none', 'default' | 'destructive' | 'outline' | 'secondary'>> = {
    live: 'default',
    deploying: 'outline',
    none: 'secondary',
    error: 'destructive',
  }
  const badgeVariant = badgeVariantMap[statusVariant] ?? 'default'

  // EXPERT FIX ROUND 4: Locale-aware date formatting for i18n correctness
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const handleOpenSite = () => {
    if (status.url) {
      window.open(status.url, '_blank', 'noopener,noreferrer')
      emitFunnelEventOnce(projectId, 'first_site_open', { url: status.url, source: 'hosting_card' })
    }
  }

  // Check if we have history translations
  const hasHistoryTranslations = !!translations.history

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Icon name="globe" className="w-4 h-4" />
            {translations.title}
          </CardTitle>
          <Badge variant={badgeVariant}>
            {status.status === 'deploying' && (
              <Icon name="loader-2" className="w-3 h-3 me-1 animate-spin" />
            )}
            {statusText}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* URL */}
          {status.url ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{translations.url}:</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-2 py-1 rounded overflow-x-auto">
                  {status.url}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenSite}
                  className="flex-shrink-0"
                >
                  <Icon name="external-link" className="w-3 h-3 me-1" />
                  {translations.actions.openSite}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {translations.subdomain}: <span className="font-mono text-xs">{status.subdomain}.sheenapps.com</span>
            </div>
          )}

          {/* Last Deploy */}
          {status.lastDeployedAt && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{translations.lastDeploy}:</span>
              <span className="text-xs">
                {dateFormatter.format(new Date(status.lastDeployedAt))}
              </span>
            </div>
          )}

          {/* Current Build */}
          {status.currentBuildId && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{translations.currentBuild}:</span>
              <span className="font-mono text-xs">{status.currentBuildId.slice(0, 8)}</span>
            </div>
          )}

          {/* Error Message */}
          {status.errorMessage && (
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
              {status.errorMessage}
            </div>
          )}

          {/* Not Deployed Message */}
          {status.status === 'none' && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded-md">
              {translations.noDeploymentsYet}
            </div>
          )}

          {/* Deployment History - Expandable */}
          {hasHistoryTranslations && status.status !== 'none' && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryOpen(!historyOpen)}
                className="w-full justify-between p-0 h-auto py-2"
              >
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Icon name="clock" className="w-4 h-4" />
                  {translations.history!.title}
                </span>
                <Icon
                  name="chevron-down"
                  className={`w-4 h-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
                />
              </Button>
              {historyOpen && (
                <div className="pt-2">
                  <DeploymentHistory
                    projectId={projectId}
                    limit={5}
                    onViewAll={onViewAllHistory}
                    onRollback={onRollback}
                    translations={translations.history!}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
