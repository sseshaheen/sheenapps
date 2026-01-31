'use client'

import { useState, useEffect, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Globe, Plus, Trash2, RefreshCw, CheckCircle, AlertCircle,
  Clock, Shield, ChevronLeft, ChevronRight, Mail, ExternalLink,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  useEmailDomains, useDeleteEmailDomain, useVerifyEmailDomain,
  type EmailDomain,
} from '@/hooks/use-email-domains'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useRegisteredDomains, type RegisteredDomain } from '@/hooks/use-registered-domains'
import { DnsStatusDots } from './DnsStatusDots'
import { DomainSetupWizard } from './DomainSetupWizard'
import { DomainRegistration } from './DomainRegistration'
import { MailboxManager } from './MailboxManager'

function handleRowKeyDown(e: KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    action()
  }
}

type DomainsSubTab = 'custom' | 'registered' | 'mailboxes'

interface EmailDomainsProps {
  projectId: string
  initialSubTab?: DomainsSubTab
  onSubTabChange?: (tab: DomainsSubTab) => void
}

export function EmailDomains({ projectId, initialSubTab = 'custom', onSubTabChange }: EmailDomainsProps) {
  const t = useTranslations('project-email')
  const [subTab, setSubTab] = useState<DomainsSubTab>(initialSubTab)

  // Lift domain data to parent so CustomDomainsView and MailboxManager share one hook
  const { data: domainsData, isLoading: domainsLoading } = useEmailDomains(projectId)
  const domains = domainsData?.domains ?? []

  // Sync when parent changes the initial subtab (e.g. overview card click)
  useEffect(() => {
    setSubTab(initialSubTab)
  }, [initialSubTab])

  return (
    <Tabs value={subTab} onValueChange={(v) => {
      const next = v as DomainsSubTab
      setSubTab(next)
      onSubTabChange?.(next)
    }}>
      <div className="overflow-x-auto">
        <TabsList className="w-max min-w-full">
          <TabsTrigger value="custom" className="whitespace-nowrap">
            <Globe className="h-4 w-4 me-1.5" />
            {t('domains.title')}
          </TabsTrigger>
          <TabsTrigger value="registered" className="whitespace-nowrap">
            <Shield className="h-4 w-4 me-1.5" />
            {t('registeredDomains.title')}
          </TabsTrigger>
          <TabsTrigger value="mailboxes" className="whitespace-nowrap">
            <Mail className="h-4 w-4 me-1.5" />
            {t('mailboxes.title')}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="custom" className="mt-4">
        <CustomDomainsView projectId={projectId} domains={domains} domainsLoading={domainsLoading} />
      </TabsContent>
      <TabsContent value="registered" className="mt-4">
        <RegisteredDomainsView projectId={projectId} />
      </TabsContent>
      <TabsContent value="mailboxes" className="mt-4">
        <MailboxManager projectId={projectId} domains={domains} domainsLoading={domainsLoading} />
      </TabsContent>
    </Tabs>
  )
}

function CustomDomainsView({ projectId, domains, domainsLoading }: { projectId: string; domains: EmailDomain[]; domainsLoading: boolean }) {
  const t = useTranslations('project-email')
  const [showWizard, setShowWizard] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<EmailDomain | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isLoading = domainsLoading
  const deleteDomain = useDeleteEmailDomain(projectId)
  const verifyDomain = useVerifyEmailDomain(projectId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {domains.length > 0 && t('domains.title')}
        </h3>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 me-1.5" />
          {t('domains.connectDomain')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : domains.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Globe className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>{t('domains.noDomains')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop table */}
          <div className="hidden sm:block border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-start px-4 py-2 font-medium text-muted-foreground">Domain</th>
                  <th className="text-start px-4 py-2 font-medium text-muted-foreground">{t('common.status')}</th>
                  <th className="text-start px-4 py-2 font-medium text-muted-foreground">DNS</th>
                  <th className="text-start px-4 py-2 font-medium text-muted-foreground">{t('common.date')}</th>
                  <th className="text-end px-4 py-2 font-medium text-muted-foreground">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {domains.map((domain) => (
                  <tr key={domain.id} className="hover:bg-muted/30 cursor-pointer" tabIndex={0} role="button" onClick={() => setSelectedDomain(domain)} onKeyDown={(e) => handleRowKeyDown(e, () => setSelectedDomain(domain))}>
                    <td className="px-4 py-3 font-medium">{domain.domain}</td>
                    <td className="px-4 py-3">
                      <DomainStatusBadge status={domain.status} sendingReady={domain.sendingReady} />
                    </td>
                    <td className="px-4 py-3">
                      {domain.dnsStatus && <DnsStatusDots dnsStatus={domain.dnsStatus} compact />}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDistanceToNow(new Date(domain.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Button
                        variant="ghost" size="sm"
                        onClick={(e) => { e.stopPropagation(); verifyDomain.mutate(domain.id) }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {domains.map((domain) => (
              <Card key={domain.id} className="cursor-pointer" tabIndex={0} role="button" onClick={() => setSelectedDomain(domain)} onKeyDown={(e) => handleRowKeyDown(e, () => setSelectedDomain(domain))}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{domain.domain}</span>
                    <DomainStatusBadge status={domain.status} sendingReady={domain.sendingReady} />
                  </div>
                  {domain.dnsStatus && <DnsStatusDots dnsStatus={domain.dnsStatus} />}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Domain Setup Wizard */}
      {showWizard && (
        <DomainSetupWizard
          projectId={projectId}
          existingDomains={domains}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* Domain Detail Dialog */}
      {selectedDomain && (
        <DomainDetailDialog
          domain={selectedDomain}
          projectId={projectId}
          onClose={() => setSelectedDomain(null)}
          onVerify={() => verifyDomain.mutate(selectedDomain.id)}
          onDelete={() => setShowDeleteConfirm(true)}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('domains.deleteDomain')}
        description={t('domains.deleteConfirm')}
        confirmLabel={t('domains.deleteDomain')}
        cancelLabel={t('common.cancel')}
        variant="destructive"
        onConfirm={() => {
          if (selectedDomain) {
            deleteDomain.mutate(selectedDomain.id)
            setSelectedDomain(null)
          }
        }}
      />
    </div>
  )
}

function DomainStatusBadge({ status, sendingReady }: { status: string; sendingReady: boolean }) {
  const t = useTranslations('project-email')

  if (sendingReady) {
    return <Badge variant="default" className="bg-green-600">{t('domains.sendingReady')}</Badge>
  }

  switch (status) {
    case 'verified':
      return <Badge variant="secondary"><CheckCircle className="h-3 w-3 me-1" />{t('domains.verified')}</Badge>
    case 'pending':
      return <Badge variant="outline"><Clock className="h-3 w-3 me-1" />{t('domains.pending')}</Badge>
    default:
      return <Badge variant="destructive"><AlertCircle className="h-3 w-3 me-1" />{t('domains.error')}</Badge>
  }
}

function DomainDetailDialog({
  domain,
  projectId,
  onClose,
  onVerify,
  onDelete,
}: {
  domain: EmailDomain
  projectId: string
  onClose: () => void
  onVerify: () => void
  onDelete: () => void
}) {
  const t = useTranslations('project-email')

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{domain.domain}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <DomainStatusBadge status={domain.status} sendingReady={domain.sendingReady} />
            <span className="text-sm text-muted-foreground">
              {domain.authorityLevel}
            </span>
          </div>

          {domain.dnsStatus && (
            <div>
              <h4 className="text-sm font-medium mb-2">{t('domains.dnsRecords')}</h4>
              <DnsStatusDots dnsStatus={domain.dnsStatus} />
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={onVerify}>
              <RefreshCw className="h-4 w-4 me-1.5" />
              {t('domains.verifyNow')}
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 me-1.5" />
              {t('domains.deleteDomain')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RegisteredDomainsView({ projectId }: { projectId: string }) {
  const t = useTranslations('project-email')
  const [showRegistration, setShowRegistration] = useState(false)
  const { data, isLoading } = useRegisteredDomains(projectId)

  const domains = data?.domains ?? []

  if (showRegistration) {
    return <DomainRegistration projectId={projectId} onBack={() => setShowRegistration(false)} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {domains.length > 0 && t('registeredDomains.title')}
        </h3>
        <Button size="sm" onClick={() => setShowRegistration(true)}>
          <Plus className="h-4 w-4 me-1.5" />
          {t('registeredDomains.buyDomain')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : domains.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>{t('registeredDomains.noDomains')}</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {domains.map((domain) => (
            <div key={domain.id} className="px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-sm font-medium">{domain.domain}</span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{domain.status}</Badge>
                  {domain.autoRenew && (
                    <Badge variant="secondary" className="text-xs">{t('registeredDomains.autoRenew')}</Badge>
                  )}
                </div>
              </div>
              <div className="text-end flex-shrink-0">
                <ExpiryBadge expiresAt={domain.expiresAt} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const t = useTranslations('project-email')
  const expires = new Date(expiresAt)
  const daysUntil = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary'
  if (daysUntil < 7) variant = 'destructive'
  else if (daysUntil < 30) variant = 'outline'

  return (
    <Badge variant={variant} className="text-xs">
      {t('registeredDomains.expiresAt')} {format(expires, 'MMM d, yyyy')}
    </Badge>
  )
}
