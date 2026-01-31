'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { useEmailOverview } from '@/hooks/use-email-overview'
import { useEmailDomains } from '@/hooks/use-email-domains'
import { useRouter } from '@/i18n/routing'

interface EmailHostingCardTranslations {
  title: string
  mailboxes: string
  sentThisMonth: string
  domains: string
  noMailboxes: string
  manage: string
  verified: string
  pending: string
}

interface EmailHostingCardProps {
  projectId: string
  translations: EmailHostingCardTranslations
}

export function EmailHostingCard({ projectId, translations }: EmailHostingCardProps) {
  const router = useRouter()
  const { data: overview } = useEmailOverview(projectId)
  const { data: domainsData } = useEmailDomains(projectId)

  const mailboxCount = overview?.mailboxes.total ?? 0
  const sentCount = overview?.outbound.sentThisMonth ?? 0
  const domains = domainsData?.domains ?? []
  const hostedDomains = domains.filter(d => d.mailboxMode === 'hosted' || d.mailboxMode === 'hosted_pending_mx')

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Icon name="mail" className="w-4 h-4" />
          {translations.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">{translations.mailboxes}</div>
            <div className="text-lg font-semibold">{mailboxCount}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">{translations.sentThisMonth}</div>
            <div className="text-lg font-semibold">{sentCount}</div>
          </div>
        </div>

        {/* Hosted domains with mailboxes */}
        {hostedDomains.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">{translations.domains}</div>
            {hostedDomains.map((domain) => (
              <div key={domain.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <Icon name="mail" className="w-3.5 h-3.5 text-blue-500" />
                  <span className="font-medium text-xs">{domain.domain}</span>
                </div>
                <Badge
                  variant={domain.mailboxMode === 'hosted' ? 'default' : 'outline'}
                  className="text-[10px]"
                >
                  {domain.mailboxMode === 'hosted' ? translations.verified : translations.pending}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* No mailboxes yet */}
        {mailboxCount === 0 && hostedDomains.length === 0 && (
          <div className="text-xs text-muted-foreground py-1">
            {translations.noMailboxes}
          </div>
        )}

        {/* Manage button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8"
          onClick={() => router.push(`/project/${projectId}/email`)}
        >
          <Icon name="settings" className="w-3.5 h-3.5 mr-1.5" />
          {translations.manage}
        </Button>
      </CardContent>
    </Card>
  )
}
