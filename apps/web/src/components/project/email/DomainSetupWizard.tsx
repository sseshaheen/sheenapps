'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Globe, ArrowRight, ArrowLeft, Copy, Check, RefreshCw, CheckCircle, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  useAddEmailDomain, useVerifyEmailDomain, useEmailDomainStatus,
  useDeleteEmailDomain, useSetCloudflareToken, useChangeAuthorityLevel,
  type EmailDomain,
} from '@/hooks/use-email-domains'
import { safeCopy } from '@/utils/clipboard'

interface DomainSetupWizardProps {
  projectId: string
  existingDomains: EmailDomain[]
  onClose: () => void
}

type Approach = 'nameservers' | 'subdomain' | 'manual' | 'cloudflare'
type Step = 'have-domain' | 'choose-approach' | 'setup' | 'complete'

function normalizeDomain(input: string) {
  return input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.+$/, '')
}

function isValidDomain(domain: string) {
  if (domain.length < 3 || domain.length > 253) return false
  if (!domain.includes('.')) return false
  if (!/^[a-z0-9.-]+$/.test(domain)) return false
  const labels = domain.split('.')
  if (labels.some(l => l.length === 0 || l.length > 63)) return false
  if (labels.some(l => l.startsWith('-') || l.endsWith('-'))) return false
  return true
}

export function DomainSetupWizard({ projectId, existingDomains, onClose }: DomainSetupWizardProps) {
  const t = useTranslations('project-email')
  const [step, setStep] = useState<Step>('have-domain')
  const [domainName, setDomainName] = useState('')
  const [approach, setApproach] = useState<Approach | null>(null)
  const [domainId, setDomainId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const [cfToken, setCfToken] = useState('')

  const addDomain = useAddEmailDomain(projectId)
  const deleteDomain = useDeleteEmailDomain(projectId)
  const verifyDomain = useVerifyEmailDomain(projectId)
  const setCfTokenMutation = useSetCloudflareToken(projectId)
  const changeAuthority = useChangeAuthorityLevel(projectId)

  // Check if domain already exists (resume flow)
  useEffect(() => {
    if (domainName) {
      const existing = existingDomains.find(d => d.domain === domainName)
      if (existing) {
        setDomainId(existing.id)
      }
    }
  }, [domainName, existingDomains])

  const { data: domainStatus } = useEmailDomainStatus(
    projectId,
    domainId ?? '',
    !!domainId && (step === 'setup' || step === 'complete')
  )

  const isVerified = domainStatus?.overall?.status === 'verified' ||
    domainStatus?.overall?.readyForSending === true

  async function handleCreateDomain(selectedApproach: Approach) {
    if (!isValidDomain(domainName)) return

    setApproach(selectedApproach)

    const authorityMap: Record<Approach, string> = {
      nameservers: 'nameservers',
      subdomain: 'subdomain',
      manual: 'manual',
      cloudflare: 'cf_token',
    }

    const desiredAuthority = authorityMap[selectedApproach]
    const existing = existingDomains.find(d => d.domain === domainName)

    try {
      if (existing && existing.authorityLevel !== desiredAuthority) {
        await changeAuthority.mutateAsync({
          domainId: existing.id,
          newAuthorityLevel: desiredAuthority,
        })
        setDomainId(existing.id)
        toast.success(t('wizard.switchApproach'))
      } else if (existing) {
        setDomainId(existing.id)
      } else {
        const result = await addDomain.mutateAsync({
          domain: domainName,
          authorityLevel: desiredAuthority,
        })
        const newId = result?.domain?.id
        if (!newId) throw new Error('Failed to create domain')
        setDomainId(newId)
      }

      setStep('setup')
    } catch (e: any) {
      toast.error(e?.message || t('common.error'))
      setApproach(null)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('wizard.title')}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Do you have a domain? */}
        {step === 'have-domain' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('wizard.haveDomain')}</p>
            <div className="grid grid-cols-1 gap-3">
              <Card
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setStep('choose-approach')}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{t('wizard.yesDomain')}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 ms-auto text-muted-foreground" />
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={onClose}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{t('wizard.noDomain')}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 ms-auto text-muted-foreground" />
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 2: Choose approach */}
        {step === 'choose-approach' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('wizard.enterDomain')}</label>
              <Input
                placeholder="example.com"
                value={domainName}
                onChange={(e) => setDomainName(normalizeDomain(e.target.value))}
                className="mt-1.5"
              />
              {domainName && !isValidDomain(domainName) && (
                <p className="text-xs text-destructive mt-1">{t('wizard.invalidDomain')}</p>
              )}
            </div>

            {domainName && isValidDomain(domainName) && (
              <>
                <p className="text-sm text-muted-foreground">{t('wizard.howConnect')}</p>
                <div className="space-y-3">
                  <ApproachCard
                    title={t('wizard.nameservers')}
                    description={t('wizard.nameserversDesc')}
                    recommended
                    onClick={() => handleCreateDomain('nameservers')}
                    loading={addDomain.isPending || changeAuthority.isPending}
                  />
                  <ApproachCard
                    title={t('wizard.subdomain')}
                    description={t('wizard.subdomainDesc')}
                    onClick={() => handleCreateDomain('subdomain')}
                    loading={addDomain.isPending || changeAuthority.isPending}
                  />
                  <ApproachCard
                    title={t('wizard.cloudflareToken')}
                    description={t('wizard.cloudflareTokenDesc')}
                    onClick={() => handleCreateDomain('cloudflare')}
                    loading={addDomain.isPending || changeAuthority.isPending}
                  />
                  <ApproachCard
                    title={t('wizard.manual')}
                    description={t('wizard.manualDesc')}
                    onClick={() => handleCreateDomain('manual')}
                    loading={addDomain.isPending || changeAuthority.isPending}
                  />
                </div>
              </>
            )}

            <Button variant="ghost" size="sm" onClick={() => setStep('have-domain')}>
              <ArrowLeft className="h-4 w-4 me-1.5" />
              {t('common.back')}
            </Button>
          </div>
        )}

        {/* Step 3: Setup instructions */}
        {step === 'setup' && domainId && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {approach === 'nameservers' && t('wizard.switchNameservers')}
              {approach === 'subdomain' && t('wizard.addNsRecords')}
              {approach === 'manual' && t('wizard.addDnsRecords')}
              {approach === 'cloudflare' && t('wizard.enterCfToken')}
            </p>

            {/* Cloudflare token input */}
            {approach === 'cloudflare' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('wizard.cloudflareToken')}</label>
                <Input
                  value={cfToken}
                  onChange={(e) => setCfToken(e.target.value)}
                  placeholder="CF API Token"
                  type="password"
                />
                <p className="text-xs text-muted-foreground">{t('wizard.cloudflareTokenHint')}</p>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await setCfTokenMutation.mutateAsync({ domainId, token: cfToken.trim() })
                      setCfToken('')
                      toast.success(t('wizard.cfTokenConnected'))
                    } catch (error: any) {
                      toast.error(error.message || t('common.error'))
                    }
                  }}
                  disabled={!cfToken.trim() || setCfTokenMutation.isPending}
                >
                  {setCfTokenMutation.isPending && <Loader2 className="h-4 w-4 animate-spin me-1.5" />}
                  {t('wizard.connect')}
                </Button>
              </div>
            )}

            {/* DNS records display */}
            {domainStatus && typeof domainStatus === 'object' && (
              <DnsRecordsPanel
                records={domainStatus?.dnsInstructions?.records ?? []}
                onCopy={async (text) => {
                  const ok = await safeCopy(text)
                  if (!ok) return toast.error(t('common.copyFailed'))
                  setCopied(text)
                  setTimeout(() => setCopied(null), 2000)
                }}
                copiedKey={copied}
              />
            )}

            <p className="text-xs text-muted-foreground">{t('wizard.propagationNote')}</p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => verifyDomain.mutate(domainId)}
                disabled={verifyDomain.isPending}
              >
                <RefreshCw className={`h-4 w-4 me-1.5 ${verifyDomain.isPending ? 'animate-spin' : ''}`} />
                {verifyDomain.isPending ? t('wizard.checking') : t('wizard.checkNow')}
              </Button>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => { setStep('choose-approach'); setApproach(null) }}
              >
                <ArrowLeft className="h-4 w-4 me-1.5" />
                {t('common.back')}
              </Button>
              <div className="flex-1" />
              <Button size="sm" variant={isVerified ? 'default' : 'outline'} onClick={() => setStep('complete')}>
                {isVerified ? t('wizard.done') : t('wizard.verifyLater')}
                <ArrowRight className="h-4 w-4 ms-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="text-center space-y-4 py-4">
            {isVerified ? (
              <>
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <div>
                  <p className="text-base font-medium">{t('wizard.complete')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('wizard.completeDesc')}</p>
                </div>
              </>
            ) : (
              <>
                <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
                <div>
                  <p className="text-base font-medium">{t('wizard.pendingTitle')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('wizard.pendingDesc')}</p>
                </div>
                <Button
                  variant="outline" size="sm"
                  onClick={() => { if (domainId) verifyDomain.mutate(domainId) }}
                  disabled={verifyDomain.isPending}
                >
                  <RefreshCw className={`h-4 w-4 me-1.5 ${verifyDomain.isPending ? 'animate-spin' : ''}`} />
                  {verifyDomain.isPending ? t('wizard.checking') : t('wizard.checkNow')}
                </Button>
              </>
            )}
            <Button onClick={onClose}>{t('wizard.done')}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface DnsRecord {
  type: string
  name: string
  value: string
  priority?: number
  status?: string
  description?: string
}

function DnsRecordsPanel({
  records,
  onCopy,
  copiedKey,
}: {
  records: DnsRecord[]
  onCopy: (text: string) => void
  copiedKey: string | null
}) {
  const t = useTranslations('project-email')

  if (!records.length) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t('domains.dnsRecords')}
      </p>
      {records.map((r, idx) => (
        <div key={idx} className="border border-border rounded-md p-3 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">{r.type}</Badge>
              <span className="text-sm font-medium">{r.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {r.status && (
                <span className={`text-xs ${
                  r.status === 'verified' ? 'text-green-600' :
                  r.status === 'error' ? 'text-destructive' :
                  'text-muted-foreground'
                }`}>
                  {r.status}
                </span>
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                onClick={() => onCopy(r.value)}
                title={t('common.copy')}
              >
                {copiedKey === r.value ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
          <div className="font-mono text-xs break-all text-foreground bg-muted rounded px-2 py-1">
            {r.value}
          </div>
          {typeof r.priority === 'number' && (
            <div className="text-xs text-muted-foreground">Priority: {r.priority}</div>
          )}
          {r.description && (
            <div className="text-xs text-muted-foreground">{r.description}</div>
          )}
        </div>
      ))}
    </div>
  )
}

function ApproachCard({
  title,
  description,
  recommended,
  onClick,
  loading,
}: {
  title: string
  description: string
  recommended?: boolean
  onClick: () => void
  loading?: boolean
}) {
  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={loading ? undefined : onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium">
              {title}
              {recommended && (
                <span className="ms-2 text-xs text-primary font-normal">(Recommended)</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        </div>
      </CardContent>
    </Card>
  )
}
