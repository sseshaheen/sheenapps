'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow } from 'date-fns'
import {
  Send, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useEmailHistory, type SentEmail } from '@/hooks/use-email-history'

interface EmailOutboundHistoryProps {
  projectId: string
}

const PAGE_SIZE = 50

export function EmailOutboundHistory({ projectId }: EmailOutboundHistoryProps) {
  const t = useTranslations('project-email')
  const [offset, setOffset] = useState(0)

  const { data, isLoading } = useEmailHistory(projectId, {
    limit: PAGE_SIZE,
    offset,
  })

  const emails = data?.emails ?? []
  const total = data?.total ?? 0
  const hasNext = offset + PAGE_SIZE < total
  const hasPrev = offset > 0

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
  }

  if (emails.length === 0 && offset === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Send className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p>{t('outbound.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Desktop table */}
      <div className="hidden sm:block border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-start px-4 py-2 font-medium text-muted-foreground">{t('common.to')}</th>
              <th className="text-start px-4 py-2 font-medium text-muted-foreground">{t('common.subject')}</th>
              <th className="text-start px-4 py-2 font-medium text-muted-foreground">{t('common.status')}</th>
              <th className="text-start px-4 py-2 font-medium text-muted-foreground">{t('common.date')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {emails.map((email) => (
              <tr key={email.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 text-foreground">{email.to}</td>
                <td className="px-4 py-3 text-foreground truncate max-w-[300px]">{email.subject}</td>
                <td className="px-4 py-3"><StatusBadge status={email.status} /></td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(email.sentAt), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {emails.map((email) => (
          <div key={email.id} className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground truncate">{email.to}</span>
              <StatusBadge status={email.status} />
            </div>
            <p className="text-sm text-muted-foreground truncate">{email.subject}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(email.sentAt), { addSuffix: true })}
            </p>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setOffset(offset - PAGE_SIZE)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setOffset(offset + PAGE_SIZE)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('project-email')

  switch (status) {
    case 'delivered':
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="h-3 w-3 me-1" />
          {t('outbound.delivered')}
        </Badge>
      )
    case 'bounced':
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 me-1" />
          {t('outbound.bounced')}
        </Badge>
      )
    case 'pending':
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 me-1" />
          {t('outbound.pending')}
        </Badge>
      )
    case 'failed':
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 me-1" />
          {t('outbound.failed')}
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}
