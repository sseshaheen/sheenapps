'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import type { HostingStatus } from '@/types/inhouse-api'
import { emitFunnelEventOnce } from '@/utils/easy-mode-funnel'

interface EasyModeSiteBadgeProps {
  projectId: string
  hosting: HostingStatus
  translations: {
    siteIsLive: string
    publishingChanges: string
    notPublishedYet: string
    publishFailed: string
    openSite: string
    retry: string
  }
  onRetry?: () => void
}

/**
 * Persistent badge for Easy Mode projects showing site status.
 * Replaces the Deploy button — Easy Mode auto-deploys, no manual deploy needed.
 *
 * States:
 * - live: "Your site is live" + clickable subdomain link
 * - deploying: "Publishing changes..." with spinner
 * - none: "Not published yet" (waiting for first build)
 * - error: "Publishing failed" with retry
 */
export function EasyModeSiteBadge({ projectId, hosting, translations, onRetry }: EasyModeSiteBadgeProps) {
  const siteUrl = hosting.url || (hosting.subdomain ? `https://${hosting.subdomain}.sheenapps.com` : null)

  if (hosting.status === 'live' && siteUrl) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400 shrink-0">
                {translations.siteIsLive}
              </span>
              <code className="text-xs text-muted-foreground truncate">
                {hosting.subdomain}.sheenapps.com
              </code>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                window.open(siteUrl, '_blank', 'noopener,noreferrer')
                emitFunnelEventOnce(projectId, 'first_site_open', { url: siteUrl, source: 'site_badge' })
              }}
            >
              <Icon name="external-link" className="w-3 h-3 me-1" />
              {translations.openSite}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (hosting.status === 'deploying') {
    return (
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-2">
            <Icon name="loader-2" className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {translations.publishingChanges}
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (hosting.status === 'error') {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="alert-circle" className="w-4 h-4 text-destructive shrink-0" />
              <span className="text-sm font-medium text-destructive">
                {translations.publishFailed}
              </span>
              {hosting.errorMessage && (
                <span className="text-xs text-muted-foreground truncate">
                  {hosting.errorMessage}
                </span>
              )}
            </div>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
                <Icon name="refresh-cw" className="w-3 h-3 me-1" />
                {translations.retry}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // status === 'none' — not published yet
  return (
    <Card className="border-muted">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Icon name="globe" className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">
            {translations.notPublishedYet}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
