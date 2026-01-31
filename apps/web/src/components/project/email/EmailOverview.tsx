'use client'

import { useTranslations } from 'next-intl'
import { Mail, Globe, Inbox, Send, Copy, Check, ArrowRight, Settings, Plus } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useEmailOverview } from '@/hooks/use-email-overview'
import { safeCopy } from '@/utils/clipboard'

interface EmailOverviewProps {
  projectId: string
  onNavigate: (tab: string) => void
}

function handleCardKeyDown(e: KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    action()
  }
}

export function EmailOverview({ projectId, onNavigate }: EmailOverviewProps) {
  const t = useTranslations('project-email')
  const [copied, setCopied] = useState(false)

  const { data: overview } = useEmailOverview(projectId)

  const inboxAddress = overview?.inbox.address
  const unreadCount = overview?.inbox.unread ?? 0
  const totalCount = overview?.inbox.total ?? 0
  const domainCount = overview?.domains.total ?? 0
  const verifiedDomains = overview?.domains.verified ?? 0
  const mailboxCount = overview?.mailboxes.total ?? 0
  const sentCount = overview?.outbound.sentThisMonth ?? 0

  async function handleCopyAddress() {
    if (!inboxAddress) return
    const ok = await safeCopy(inboxAddress)
    if (!ok) return toast.error(t('common.copyFailed'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Inbox Address Banner */}
      {inboxAddress && (
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{t('inbox.address')}</p>
            <p className="text-base font-mono text-foreground truncate">{inboxAddress}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyAddress}
            className="flex-shrink-0"
          >
            {copied ? (
              <><Check className="h-4 w-4 me-1.5" />{t('common.copied')}</>
            ) : (
              <><Copy className="h-4 w-4 me-1.5" />{t('common.copy')}</>
            )}
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Inbox Card */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          tabIndex={0}
          role="button"
          onClick={() => onNavigate('inbox')}
          onKeyDown={(e) => handleCardKeyDown(e, () => onNavigate('inbox'))}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('overview.inboxCard')}
            </CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{totalCount}</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {t('overview.unreadMessages', { count: unreadCount })}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('overview.totalMessages', { count: totalCount })}
            </p>
          </CardContent>
        </Card>

        {/* Domains Card */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          tabIndex={0}
          role="button"
          onClick={() => onNavigate('domains')}
          onKeyDown={(e) => handleCardKeyDown(e, () => onNavigate('domains'))}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('overview.domainsCard')}
            </CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{domainCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('overview.connectedDomains', { count: verifiedDomains })}
            </p>
          </CardContent>
        </Card>

        {/* Mailboxes Card */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          tabIndex={0}
          role="button"
          onClick={() => onNavigate('mailboxes')}
          onKeyDown={(e) => handleCardKeyDown(e, () => onNavigate('mailboxes'))}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('overview.mailboxesCard')}
            </CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mailboxCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('overview.activeMailboxes', { count: mailboxCount })}
            </p>
          </CardContent>
        </Card>

        {/* Outbound Card */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          tabIndex={0}
          role="button"
          onClick={() => onNavigate('outbound')}
          onKeyDown={(e) => handleCardKeyDown(e, () => onNavigate('outbound'))}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('overview.outboundCard')}
            </CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sentCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('overview.sentThisMonth', { count: sentCount })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('common.actions')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate('domains')}>
            <Globe className="h-4 w-4 me-1.5" />
            {t('overview.setupDomain')}
            <ArrowRight className="h-3 w-3 ms-1.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('settings')}>
            <Settings className="h-4 w-4 me-1.5" />
            {t('overview.configureAutoReply')}
            <ArrowRight className="h-3 w-3 ms-1.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('settings')}>
            <Plus className="h-4 w-4 me-1.5" />
            {t('overview.createAlias')}
            <ArrowRight className="h-3 w-3 ms-1.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
