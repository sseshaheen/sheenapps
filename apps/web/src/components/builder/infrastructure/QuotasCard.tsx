'use client'

import { useLocale } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import type { QuotaStatus } from '@/types/inhouse-api'
import { getQuotaPercentage } from '@/types/inhouse-api'

interface QuotasCardProps {
  status: QuotaStatus
  translations: {
    title: string
    requests: string
    bandwidth: string
    resetsAt: string
    unlimited: string
  }
}

export function QuotasCard({ status, translations }: QuotasCardProps) {
  const locale = useLocale()
  const requestsPercentage = getQuotaPercentage(status.requestsUsedToday, status.requestsLimit)
  const bandwidthPercentage = getQuotaPercentage(status.bandwidthUsedMb, status.bandwidthQuotaMb)

  const isUnlimitedRequests = status.requestsLimit === -1
  const isUnlimitedBandwidth = status.bandwidthQuotaMb === -1

  // EXPERT FIX ROUND 4: Locale-aware number and date formatting for i18n correctness
  const numberFormatter = new Intl.NumberFormat(locale)
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Icon name="bar-chart" className="w-4 h-4" />
          {translations.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Requests Quota */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{translations.requests}:</span>
              {isUnlimitedRequests ? (
                <span className="text-xs font-medium text-primary">{translations.unlimited}</span>
              ) : (
                <span className="text-xs">
                  {numberFormatter.format(status.requestsUsedToday)} / {numberFormatter.format(status.requestsLimit)}
                </span>
              )}
            </div>
            {!isUnlimitedRequests && (
              <div className="space-y-1">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      requestsPercentage > 90
                        ? 'bg-destructive'
                        : requestsPercentage > 70
                        ? 'bg-warning'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(requestsPercentage, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-end">
                  {requestsPercentage}% used
                </div>
              </div>
            )}
          </div>

          {/* Bandwidth Quota */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{translations.bandwidth}:</span>
              {isUnlimitedBandwidth ? (
                <span className="text-xs font-medium text-primary">{translations.unlimited}</span>
              ) : (
                <span className="text-xs">
                  {status.bandwidthUsedMb.toFixed(1)} MB / {status.bandwidthQuotaMb} MB
                </span>
              )}
            </div>
            {!isUnlimitedBandwidth && (
              <div className="space-y-1">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      bandwidthPercentage > 90
                        ? 'bg-destructive'
                        : bandwidthPercentage > 70
                        ? 'bg-warning'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(bandwidthPercentage, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-end">
                  {bandwidthPercentage}% used
                </div>
              </div>
            )}
          </div>

          {/* Resets At */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="clock" className="w-3 h-3" />
              <span>
                {translations.resetsAt}: {dateFormatter.format(new Date(status.resetsAt))}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
