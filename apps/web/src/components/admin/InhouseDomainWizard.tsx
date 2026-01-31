'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, CheckCircle2, ArrowLeft, ArrowRight, Copy, Globe, Server, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { CopyButton } from '@/components/admin/shared/CopyButton'
import { DnsStatusIndicator } from '@/components/admin/DnsStatusIndicator'

// =============================================================================
// TYPES
// =============================================================================

interface InhouseDomainWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onComplete: () => void
}

type WizardStep =
  | 'has-domain'
  | 'connection-method'
  | 'nameserver-switch'
  | 'subdomain-delegation'
  | 'manual-dns'
  | 'complete'

interface DnsRecord {
  type: string
  host: string
  value: string
  verified?: boolean
}

interface CreatedDomain {
  id: string
  domain: string
  authority_level: string
  status: string
  dns_status: Record<string, { verified: boolean; actual?: string; error?: string }>
}

// =============================================================================
// POLLING INTERVALS
// =============================================================================

const POLL_INTERVALS = [10_000, 20_000, 30_000] // 10s → 20s → 30s

// =============================================================================
// COMPONENT
// =============================================================================

export function InhouseDomainWizard({ open, onOpenChange, projectId, onComplete }: InhouseDomainWizardProps) {
  const [step, setStep] = useState<WizardStep>('has-domain')
  const [domainInput, setDomainInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdDomain, setCreatedDomain] = useState<CreatedDomain | null>(null)
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([])
  const [nameservers, setNameservers] = useState<string[]>([])
  const [nsRecords, setNsRecords] = useState<DnsRecord[]>([])
  const [existingRecords, setExistingRecords] = useState<any[]>([])
  const [checking, setChecking] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null)
  const [provisioning, setProvisioning] = useState(false)
  const [allVerified, setAllVerified] = useState(false)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [debugOpen, setDebugOpen] = useState(false)

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollIndexRef = useRef(0)
  const allVerifiedRef = useRef(false)
  const createdDomainRef = useRef<CreatedDomain | null>(null)

  // Keep refs in sync with state
  useEffect(() => { allVerifiedRef.current = allVerified }, [allVerified])
  useEffect(() => { createdDomainRef.current = createdDomain }, [createdDomain])

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep('has-domain')
      setDomainInput('')
      setCreating(false)
      setCreatedDomain(null)
      setDnsRecords([])
      setNameservers([])
      setNsRecords([])
      setExistingRecords([])
      setChecking(false)
      setLastCheckedAt(null)
      setProvisioning(false)
      setAllVerified(false)
      setDebugInfo(null)
      setDebugOpen(false)
      pollIndexRef.current = 0
      allVerifiedRef.current = false
      createdDomainRef.current = null
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [open])

  // ------- FETCH DOMAIN STATUS -------

  const fetchDomainStatus = useCallback(async (domainId: string, _authorityLevel?: string) => {
    try {
      const params = new URLSearchParams({ projectId })
      const response = await fetch(`/api/admin/inhouse/email-domains/${domainId}/status?${params}`)
      if (!response.ok) return

      const data = await response.json()
      const statusData = data.data
      setDebugInfo(statusData)

      if (statusData?.domain) {
        setCreatedDomain(statusData.domain)
        // Check if all DNS records are verified
        const dnsStatus = statusData.domain.dns_status || {}
        const checks = Object.values(dnsStatus) as Array<{ verified: boolean }>
        const verified = checks.length > 0 && checks.every(c => c.verified)
        setAllVerified(verified)
      }

      if (statusData?.dnsInstructions?.records) {
        setDnsRecords(statusData.dnsInstructions.records)
      }

      if (statusData?.dnsInstructions?.nameservers) {
        setNameservers(statusData.dnsInstructions.nameservers)
      }

      if (statusData?.dnsInstructions?.nsRecords) {
        setNsRecords(statusData.dnsInstructions.nsRecords)
      }

      if (statusData?.dnsInstructions?.existingRecords) {
        setExistingRecords(statusData.dnsInstructions.existingRecords)
      }
    } catch {
      // non-critical
    }
  }, [projectId])

  // ------- CREATE DOMAIN -------

  const createDomain = useCallback(async (authorityLevel: 'manual' | 'subdomain' | 'nameservers'): Promise<CreatedDomain | null> => {
    const domain = domainInput.trim().toLowerCase().replace(/^https?:\/\//, '')
    if (!domain) {
      toast.error('Please enter a domain name')
      return null
    }

    setCreating(true)
    try {
      const response = await fetch('/api/admin/inhouse/email-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, domain, authorityLevel }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add domain')
      }
      const data = await response.json()
      const created = data.data?.domain || data.data
      setCreatedDomain(created)

      // Fetch DNS instructions / status
      await fetchDomainStatus(created.id, authorityLevel)
      return created
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create domain')
      return null
    } finally {
      setCreating(false)
    }
  }, [domainInput, projectId, fetchDomainStatus])

  // ------- VERIFY DOMAIN -------

  const verifyDomain = useCallback(async () => {
    if (!createdDomain) return
    setChecking(true)
    try {
      const response = await fetch(`/api/admin/inhouse/email-domains/${createdDomain.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) throw new Error('Verification failed')

      const data = await response.json()
      setLastCheckedAt(new Date())
      pollIndexRef.current = 0 // Reset polling backoff on manual check

      if (data.data?.readyForSending) {
        setAllVerified(true)
        toast.success('Domain verified and ready for sending!')
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      } else {
        toast.info('Verification check complete. Some records still pending.')
      }

      // Refresh status
      await fetchDomainStatus(createdDomain.id)
    } catch {
      toast.error('Failed to verify domain')
    } finally {
      setChecking(false)
    }
  }, [createdDomain, projectId, fetchDomainStatus])

  // ------- POLLING -------

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)

    const poll = () => {
      if (!createdDomainRef.current || allVerifiedRef.current) return
      const intervalIndex = Math.min(pollIndexRef.current, POLL_INTERVALS.length - 1)
      const interval = POLL_INTERVALS[intervalIndex]
      pollIndexRef.current++

      pollTimerRef.current = setTimeout(async () => {
        // Skip polling when tab is hidden
        if (document.visibilityState === 'hidden') {
          poll()
          return
        }
        // Passive poll (cheap /status read), not /verify (triggers DNS checks)
        await fetchDomainStatus(createdDomainRef.current!.id)
        if (!allVerifiedRef.current) poll()
      }, interval)
    }
    poll()
  }, [fetchDomainStatus])

  useEffect(() => {
    if (createdDomain && !allVerified && (step === 'nameserver-switch' || step === 'subdomain-delegation' || step === 'manual-dns')) {
      startPolling()
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [createdDomain, allVerified, step, startPolling])

  // ------- PROVISION EMAIL RECORDS -------

  const provisionEmailRecords = useCallback(async (method: 'subdomain' | 'nameservers') => {
    if (!createdDomain) return
    setProvisioning(true)
    try {
      const response = await fetch(`/api/admin/inhouse/email-domains/${createdDomain.id}/provision-email-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, method }),
      })
      if (!response.ok) throw new Error('Failed to provision email records')
      toast.success('Email DNS records provisioned')
      setStep('complete')
    } catch {
      toast.error('Failed to provision email records')
    } finally {
      setProvisioning(false)
    }
  }, [createdDomain, projectId])

  // ------- NAMESERVER SWITCH ACTIONS -------

  const handleNameserverStep = async () => {
    const created = await createDomain('nameservers')
    if (created) setStep('nameserver-switch')
  }

  const handleSubdomainStep = async () => {
    const created = await createDomain('subdomain')
    if (created) setStep('subdomain-delegation')
  }

  const handleManualStep = async () => {
    const created = await createDomain('manual')
    if (created) setStep('manual-dns')
  }

  // ------- COPY ALL RECORDS -------

  const copyAllRecords = async () => {
    const text = dnsRecords
      .map(r => `${r.type}\t${r.host}\t${r.value}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('All records copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  // ------- RENDER -------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect Domain</DialogTitle>
          <DialogDescription>Set up a custom email domain for this project</DialogDescription>
        </DialogHeader>

        {/* ============= STEP: HAS DOMAIN? ============= */}
        {step === 'has-domain' && (
          <div className="space-y-4">
            <p className="text-sm">Does this project already have a domain?</p>
            <div className="flex gap-3">
              <Button
                onClick={() => setStep('connection-method')}
                className="flex-1"
              >
                Yes, I have a domain
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                No — use Registered Domains tab to purchase one
              </Button>
            </div>
          </div>
        )}

        {/* ============= STEP: CONNECTION METHOD ============= */}
        {step === 'connection-method' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Domain name</label>
              <Input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="example.com"
                className="mt-1"
              />
            </div>

            <p className="text-sm text-muted-foreground">How should we connect this domain?</p>

            <div className="grid gap-3">
              <button
                className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-accent transition-colors disabled:opacity-50"
                onClick={handleNameserverStep}
                disabled={creating || !domainInput.trim()}
              >
                <Globe className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                <div>
                  <div className="font-medium text-sm">Switch nameservers (recommended)</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Point your domain's nameservers to Cloudflare. Full DNS control, auto-provisions all email records.
                  </div>
                </div>
              </button>

              <button
                className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-accent transition-colors disabled:opacity-50"
                onClick={handleSubdomainStep}
                disabled={creating || !domainInput.trim()}
              >
                <Server className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                <div>
                  <div className="font-medium text-sm">Use a subdomain (safest)</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Delegate mail.yourdomain.com via NS records. No changes to your main domain's DNS.
                  </div>
                </div>
              </button>

              <button
                className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-accent transition-colors disabled:opacity-50"
                onClick={handleManualStep}
                disabled={creating || !domainInput.trim()}
              >
                <FileText className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                <div>
                  <div className="font-medium text-sm">Add records manually</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Add individual DNS records at your registrar. More work, but no nameserver changes needed.
                  </div>
                </div>
              </button>
            </div>

            {creating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Creating domain...
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={() => setStep('has-domain')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
        )}

        {/* ============= STEP: NAMESERVER SWITCH ============= */}
        {step === 'nameserver-switch' && createdDomain && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Switch nameservers for {createdDomain.domain}</h3>
              <Badge variant="outline">{createdDomain.status}</Badge>
            </div>

            {nameservers.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Update your domain's nameservers at your registrar to:
                </p>
                <div className="space-y-2">
                  {nameservers.map((ns, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-sm font-mono">
                      <span className="flex-1">{ns}</span>
                      <CopyButton value={ns} size="icon" showToast={false} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {existingRecords.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Existing DNS records (we&apos;ll attempt to import these)</p>
                <div className="rounded-md border p-3 text-xs font-mono max-h-[150px] overflow-y-auto space-y-1">
                  {existingRecords.map((r: any, i: number) => (
                    <div key={i}>{r.type} {r.name} → {r.content}</div>
                  ))}
                </div>
              </div>
            )}

            <DnsStatusSection
              createdDomain={createdDomain}
              checking={checking}
              lastCheckedAt={lastCheckedAt}
              allVerified={allVerified}
              onVerify={verifyDomain}
            />

            {allVerified && (
              <div className="space-y-2">
                <p className="text-sm text-green-600 font-medium">Nameservers verified. Ready to provision email records.</p>
                <Button onClick={() => provisionEmailRecords('nameservers')} disabled={provisioning}>
                  {provisioning ? (
                    <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Provisioning...</>
                  ) : (
                    'Provision Email Records'
                  )}
                </Button>
              </div>
            )}

            <DebugSection debugInfo={debugInfo} debugOpen={debugOpen} onToggle={() => setDebugOpen(!debugOpen)} />

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setStep('connection-method'); setCreatedDomain(null) }}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        )}

        {/* ============= STEP: SUBDOMAIN DELEGATION ============= */}
        {step === 'subdomain-delegation' && createdDomain && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Subdomain delegation for {createdDomain.domain}</h3>
              <Badge variant="outline">{createdDomain.status}</Badge>
            </div>

            {nsRecords.length > 0 ? (
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Add these NS records at your registrar for mail.{createdDomain.domain}:
                </p>
                <div className="space-y-2">
                  {nsRecords.map((record, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-xs font-mono">
                      <Badge variant="outline" className="shrink-0">{record.type}</Badge>
                      <span className="truncate">{record.host}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="truncate flex-1">{record.value}</span>
                      <CopyButton value={record.value} size="icon" showToast={false} />
                    </div>
                  ))}
                </div>
              </div>
            ) : dnsRecords.length > 0 ? (
              <DnsRecordsList records={dnsRecords} />
            ) : null}

            <DnsStatusSection
              createdDomain={createdDomain}
              checking={checking}
              lastCheckedAt={lastCheckedAt}
              allVerified={allVerified}
              onVerify={verifyDomain}
            />

            {allVerified && (
              <div className="space-y-2">
                <p className="text-sm text-green-600 font-medium">Subdomain delegation verified. Ready to provision email records.</p>
                <Button onClick={() => provisionEmailRecords('subdomain')} disabled={provisioning}>
                  {provisioning ? (
                    <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Provisioning...</>
                  ) : (
                    'Provision Email Records'
                  )}
                </Button>
              </div>
            )}

            <DebugSection debugInfo={debugInfo} debugOpen={debugOpen} onToggle={() => setDebugOpen(!debugOpen)} />

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setStep('connection-method'); setCreatedDomain(null) }}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        )}

        {/* ============= STEP: MANUAL DNS ============= */}
        {step === 'manual-dns' && createdDomain && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Manual DNS setup for {createdDomain.domain}</h3>
              <Badge variant="outline">{createdDomain.status}</Badge>
            </div>

            <p className="text-sm text-muted-foreground">
              Add the following DNS records at your domain registrar:
            </p>

            <DnsRecordsList records={dnsRecords} />

            {dnsRecords.length > 0 && (
              <Button variant="outline" size="sm" onClick={copyAllRecords}>
                <Copy className="h-4 w-4 mr-1" />
                Copy all records
              </Button>
            )}

            <DnsStatusSection
              createdDomain={createdDomain}
              checking={checking}
              lastCheckedAt={lastCheckedAt}
              allVerified={allVerified}
              onVerify={verifyDomain}
            />

            {allVerified && (
              <div className="space-y-2">
                <p className="text-sm text-green-600 font-medium">All DNS records verified!</p>
                <Button onClick={() => setStep('complete')}>
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Continue
                </Button>
              </div>
            )}

            <DebugSection debugInfo={debugInfo} debugOpen={debugOpen} onToggle={() => setDebugOpen(!debugOpen)} />

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setStep('connection-method'); setCreatedDomain(null) }}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        )}

        {/* ============= STEP: COMPLETE ============= */}
        {step === 'complete' && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <h3 className="text-lg font-medium">Domain Connected</h3>
              {createdDomain && (
                <p className="text-sm text-muted-foreground mt-1">
                  {createdDomain.domain} is now set up for email
                </p>
              )}
            </div>
            <Button onClick={onComplete}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function DnsRecordsList({ records }: { records: DnsRecord[] }) {
  return (
    <div className="space-y-2">
      {records.map((record, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-xs font-mono">
          <Badge variant="outline" className="shrink-0">{record.type}</Badge>
          <span className="truncate">{record.host}</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="truncate flex-1">{record.value}</span>
          <CopyButton value={record.value} size="icon" showToast={false} />
          {record.verified !== undefined && (
            <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${record.verified ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function DnsStatusSection({
  createdDomain,
  checking,
  lastCheckedAt,
  allVerified,
  onVerify,
}: {
  createdDomain: CreatedDomain
  checking: boolean
  lastCheckedAt: Date | null
  allVerified: boolean
  onVerify: () => void
}) {
  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-sm font-medium mb-1">DNS Status</h4>
        <DnsStatusIndicator dnsStatus={createdDomain.dns_status || {}} />
      </div>

      {!allVerified && (
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={onVerify} disabled={checking}>
            {checking ? (
              <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> Checking...</>
            ) : (
              <><RefreshCw className="h-3.5 w-3.5 mr-1" /> Check Now</>
            )}
          </Button>
          {lastCheckedAt && (
            <span className="text-xs text-muted-foreground">
              Last checked: {formatDistanceToNow(lastCheckedAt, { addSuffix: true })}
            </span>
          )}
        </div>
      )}

      {!allVerified && (
        <p className="text-xs text-muted-foreground">
          Most changes appear within minutes. Full propagation can take up to 48 hours.
        </p>
      )}
    </div>
  )
}

function DebugSection({
  debugInfo,
  debugOpen,
  onToggle,
}: {
  debugInfo: any
  debugOpen: boolean
  onToggle: () => void
}) {
  if (!debugInfo) return null

  return (
    <div>
      <button
        onClick={onToggle}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        {debugOpen ? 'Hide' : 'Show'} debug info
      </button>
      {debugOpen && (
        <pre className="mt-2 rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      )}
    </div>
  )
}
