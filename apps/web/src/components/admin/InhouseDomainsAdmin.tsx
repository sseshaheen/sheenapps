'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  RefreshCw,
  Globe,
  Mail,
  Server,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  Shield,
  Eye,
  Key,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { ProjectPicker } from '@/components/admin/shared/ProjectPicker'
import { CopyButton } from '@/components/admin/shared/CopyButton'
import { DnsStatusIndicator } from '@/components/admin/DnsStatusIndicator'
import { InhouseDomainWizard } from '@/components/admin/InhouseDomainWizard'

// =============================================================================
// TYPES
// =============================================================================

interface EmailDomain {
  id: string
  project_id: string
  project_name?: string
  domain: string
  is_subdomain: boolean
  authority_level: string
  status: string
  dns_status: Record<string, { verified: boolean; actual?: string; error?: string }>
  verification_token: string
  ownership_verified: boolean
  ownership_verified_at?: string
  last_checked_at?: string
  last_error?: string
  mailbox_mode?: string
  created_at: string
}

interface RegisteredDomain {
  id: string
  project_id: string
  project_name?: string
  domain: string
  tld: string
  status: string
  expires_at: string
  auto_renew: boolean
  whois_privacy: boolean
  locked: boolean
  nameservers?: string[]
  opensrs_order_id?: string
  opensrs_domain_id?: string
  contacts?: Record<string, any>
  created_at: string
  // Dispute tracking (from Enhancement 2)
  dispute_status?: 'none' | 'open' | 'won' | 'lost' | 'withdrawn' | null
  dispute_opened_at?: string | null
  dispute_resolved_at?: string | null
  dispute_reason?: string | null
}

interface DomainEvent {
  id: string
  event_type: string
  details?: Record<string, any>
  created_at: string
}

interface MailboxRow {
  id: string
  project_id: string
  domain_id: string
  domain_name?: string
  mailbox_mode?: string
  local_part: string
  email_address: string
  provisioning_status: string
  provisioning_error?: string
  display_name?: string
  quota_mb: number
  quota_used_mb: number
  created_at: string
}

interface SearchResult {
  domain: string
  available: boolean
  price?: { registration?: string; renewal?: string }
}

interface DomainTransfer {
  id: string
  project_id: string
  domain: string
  tld: string
  status: string
  status_message?: string
  source_registrar?: string
  price_cents: number
  currency: string
  opensrs_order_id?: string
  initiated_at?: string
  completed_at?: string
  created_at: string
}

interface DnsReadinessCheck {
  record_type: string
  status: string
  expected?: string
  actual?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

const AVAILABLE_TLDS = ['.com', '.net', '.org', '.io', '.co', '.app', '.dev', '.ai']

// =============================================================================
// COMPONENT
// =============================================================================

export function InhouseDomainsAdmin() {
  const searchParams = useSearchParams()
  const initialProjectId = searchParams.get('projectId') || ''

  const [projectId, setProjectId] = useState(initialProjectId)
  const [activeTab, setActiveTab] = useState('email-domains')
  const [wizardOpen, setWizardOpen] = useState(false)

  // Email domains state
  const [emailDomains, setEmailDomains] = useState<EmailDomain[]>([])
  const [emailDomainsLoading, setEmailDomainsLoading] = useState(false)
  const [emailDomainStatus, setEmailDomainStatus] = useState('all')

  // Registered domains state
  const [registeredDomains, setRegisteredDomains] = useState<RegisteredDomain[]>([])
  const [registeredDomainsLoading, setRegisteredDomainsLoading] = useState(false)
  const [registeredDomainStatus, setRegisteredDomainStatus] = useState('all')

  // Mailboxes state
  const [mailboxes, setMailboxes] = useState<MailboxRow[]>([])
  const [mailboxesLoading, setMailboxesLoading] = useState(false)
  const [mailboxStatus, setMailboxStatus] = useState('all')

  // Transfers state
  const [transfers, setTransfers] = useState<DomainTransfer[]>([])
  const [transfersLoading, setTransfersLoading] = useState(false)
  const [transferStatus, setTransferStatus] = useState('all')

  // Detail dialogs - Email domain
  const [selectedDomain, setSelectedDomain] = useState<EmailDomain | null>(null)
  const [domainDetailOpen, setDomainDetailOpen] = useState(false)
  const [domainDetailData, setDomainDetailData] = useState<{ domain: EmailDomain; dnsInstructions: any } | null>(null)

  // Detail dialogs - Registered domain
  const [selectedRegisteredDomain, setSelectedRegisteredDomain] = useState<RegisteredDomain | null>(null)
  const [registeredDomainDetailOpen, setRegisteredDomainDetailOpen] = useState(false)
  const [registeredDomainFullData, setRegisteredDomainFullData] = useState<any>(null)
  const [domainEvents, setDomainEvents] = useState<DomainEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [settingsUpdating, setSettingsUpdating] = useState<string | null>(null)
  const [authCodeLoading, setAuthCodeLoading] = useState(false)

  // Detail dialogs - Mailbox
  const [selectedMailbox, setSelectedMailbox] = useState<MailboxRow | null>(null)
  const [mailboxDetailOpen, setMailboxDetailOpen] = useState(false)
  const [clientConfig, setClientConfig] = useState<any>(null)
  const [mailboxDnsReadiness, setMailboxDnsReadiness] = useState<DnsReadinessCheck[] | null>(null)
  const [mailboxActionLoading, setMailboxActionLoading] = useState<string | null>(null)

  // Domain search state
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTlds, setSelectedTlds] = useState<string[]>(['.com', '.net', '.org'])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [pricingData, setPricingData] = useState<Record<string, any> | null>(null)

  // Password reset dialog state
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
  const [resetPasswordMailboxId, setResetPasswordMailboxId] = useState('')
  const [resetPasswordValue, setResetPasswordValue] = useState('')

  // Create mailbox state
  const [createMailboxOpen, setCreateMailboxOpen] = useState(false)
  const [createMailboxDomainId, setCreateMailboxDomainId] = useState('')
  const [createMailboxLocalPart, setCreateMailboxLocalPart] = useState('')
  const [createMailboxPassword, setCreateMailboxPassword] = useState('')
  const [createMailboxDisplayName, setCreateMailboxDisplayName] = useState('')
  const [createMailboxQuota, setCreateMailboxQuota] = useState('')
  const [creatingMailbox, setCreatingMailbox] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const emailAbortRef = useRef<AbortController | null>(null)
  const regAbortRef = useRef<AbortController | null>(null)
  const mbAbortRef = useRef<AbortController | null>(null)
  const transferAbortRef = useRef<AbortController | null>(null)

  // ------- FETCH FUNCTIONS -------

  const fetchEmailDomains = useCallback(async () => {
    if (!projectId) return
    emailAbortRef.current?.abort()
    const controller = new AbortController()
    emailAbortRef.current = controller

    setEmailDomainsLoading(true)
    try {
      const params = new URLSearchParams({ projectId, limit: '50', offset: '0' })
      if (emailDomainStatus !== 'all') params.set('status', emailDomainStatus)

      const response = await fetch(`/api/admin/inhouse/email-domains?${params}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Failed to fetch email domains')
      const data = await response.json()
      setEmailDomains(data.data?.domains || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Failed to load email domains')
      }
    } finally {
      setEmailDomainsLoading(false)
    }
  }, [projectId, emailDomainStatus])

  const fetchRegisteredDomains = useCallback(async () => {
    if (!projectId) return
    regAbortRef.current?.abort()
    const controller = new AbortController()
    regAbortRef.current = controller

    setRegisteredDomainsLoading(true)
    try {
      const params = new URLSearchParams({ projectId, limit: '50', offset: '0' })
      if (registeredDomainStatus !== 'all') params.set('status', registeredDomainStatus)

      const response = await fetch(`/api/admin/inhouse/registered-domains?${params}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Failed to fetch registered domains')
      const data = await response.json()
      setRegisteredDomains(data.data?.domains || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Failed to load registered domains')
      }
    } finally {
      setRegisteredDomainsLoading(false)
    }
  }, [projectId, registeredDomainStatus])

  const fetchMailboxes = useCallback(async () => {
    if (!projectId) return
    mbAbortRef.current?.abort()
    const controller = new AbortController()
    mbAbortRef.current = controller

    setMailboxesLoading(true)
    try {
      const params = new URLSearchParams({ projectId, limit: '50', offset: '0' })
      if (mailboxStatus !== 'all') params.set('status', mailboxStatus)

      const response = await fetch(`/api/admin/inhouse/mailboxes?${params}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Failed to fetch mailboxes')
      const data = await response.json()
      setMailboxes(data.data?.mailboxes || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Failed to load mailboxes')
      }
    } finally {
      setMailboxesLoading(false)
    }
  }, [projectId, mailboxStatus])

  const fetchTransfers = useCallback(async () => {
    if (!projectId) return
    transferAbortRef.current?.abort()
    const controller = new AbortController()
    transferAbortRef.current = controller

    setTransfersLoading(true)
    try {
      const params = new URLSearchParams({ projectId, limit: '50', offset: '0' })
      if (transferStatus !== 'all') params.set('status', transferStatus)

      const response = await fetch(`/api/admin/inhouse/transfers?${params}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Failed to fetch transfers')
      const data = await response.json()
      setTransfers(data.data?.transfers || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Failed to load transfers')
      }
    } finally {
      setTransfersLoading(false)
    }
  }, [projectId, transferStatus])

  useEffect(() => {
    if (!projectId) return
    fetchEmailDomains()
    fetchRegisteredDomains()
    fetchMailboxes()
    fetchTransfers()
    return () => {
      emailAbortRef.current?.abort()
      regAbortRef.current?.abort()
      mbAbortRef.current?.abort()
      transferAbortRef.current?.abort()
    }
  }, [fetchEmailDomains, fetchRegisteredDomains, fetchMailboxes, fetchTransfers, projectId])

  const handleRefresh = () => {
    fetchEmailDomains()
    fetchRegisteredDomains()
    fetchMailboxes()
    fetchTransfers()
  }

  // ------- EMAIL DOMAIN DETAIL -------

  const handleViewDomain = async (domain: EmailDomain) => {
    setSelectedDomain(domain)
    setDomainDetailOpen(true)
    try {
      const params = new URLSearchParams({ projectId })
      const response = await fetch(`/api/admin/inhouse/email-domains/${domain.id}/status?${params}`)
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      setDomainDetailData(data.data || null)
    } catch {
      toast.error('Failed to load domain details')
    }
  }

  const handleVerifyDomain = async (domainId: string) => {
    try {
      const response = await fetch(`/api/admin/inhouse/email-domains/${domainId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      toast.success(data.data?.readyForSending ? 'Domain verified and ready!' : 'Verification check complete')
      fetchEmailDomains()
      if (selectedDomain?.id === domainId) handleViewDomain(selectedDomain)
    } catch {
      toast.error('Failed to verify domain')
    }
  }

  // ------- REGISTERED DOMAIN DETAIL -------

  const handleViewRegisteredDomain = async (domain: RegisteredDomain) => {
    setSelectedRegisteredDomain(domain)
    setRegisteredDomainDetailOpen(true)
    setRegisteredDomainFullData(null)
    setDomainEvents([])

    // Fetch full domain data + events in parallel
    const params = new URLSearchParams({ projectId })

    try {
      const response = await fetch(`/api/admin/inhouse/registered-domains/${domain.id}?${params}`)
      if (response.ok) {
        const data = await response.json()
        setRegisteredDomainFullData(data.data || null)
      }
    } catch {
      // non-critical, we still have the list data
    }

    setEventsLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/registered-domains/${domain.id}/events?${params}`)
      if (response.ok) {
        const data = await response.json()
        setDomainEvents(data.data?.events || [])
      }
    } catch {
      // non-critical
    } finally {
      setEventsLoading(false)
    }
  }

  // Maps UI setting keys to worker body keys (camelCase) and local state keys (snake_case)
  const SETTING_MAP: Record<string, { bodyKey: string; stateKey: keyof RegisteredDomain }> = {
    auto_renew: { bodyKey: 'autoRenew', stateKey: 'auto_renew' },
    whois_privacy: { bodyKey: 'whoisPrivacy', stateKey: 'whois_privacy' },
    locked: { bodyKey: 'locked', stateKey: 'locked' },
  }

  const handleUpdateRegisteredDomainSetting = async (domainId: string, setting: string, value: boolean) => {
    const mapped = SETTING_MAP[setting]
    if (!mapped) {
      toast.error(`Unknown setting: ${setting}`)
      return
    }
    setSettingsUpdating(setting)
    try {
      const response = await fetch(`/api/admin/inhouse/registered-domains/${domainId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, [mapped.bodyKey]: value }),
      })
      if (!response.ok) throw new Error('Failed')
      toast.success(`${setting.replace(/_/g, ' ')} updated`)

      // Update local state
      if (selectedRegisteredDomain?.id === domainId) {
        setSelectedRegisteredDomain(prev => prev ? { ...prev, [mapped.stateKey]: value } : null)
      }
      fetchRegisteredDomains()
    } catch {
      toast.error(`Failed to update ${setting.replace(/_/g, ' ')}`)
    } finally {
      setSettingsUpdating(null)
    }
  }

  const handleRenewDomain = async (domainId: string) => {
    const period = window.prompt('Renewal period in years (1, 2, or 3):')
    if (!period || !['1', '2', '3'].includes(period)) {
      if (period !== null) toast.error('Invalid period. Must be 1, 2, or 3.')
      return
    }
    const reason = window.prompt('Reason for renewal:')
    if (!reason) return

    try {
      const response = await fetch(`/api/admin/inhouse/registered-domains/${domainId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, period: parseInt(period), reason }),
      })
      if (!response.ok) throw new Error('Failed')
      toast.success('Domain renewal initiated')
      fetchRegisteredDomains()
    } catch {
      toast.error('Failed to renew domain')
    }
  }

  const handleGetAuthCode = async (domainId: string) => {
    setAuthCodeLoading(true)
    try {
      const params = new URLSearchParams({ projectId })
      const response = await fetch(`/api/admin/inhouse/registered-domains/${domainId}/auth-code?${params}`)
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      const authCode = data.data?.authCode || data.data?.auth_code
      if (authCode) {
        await navigator.clipboard.writeText(authCode)
        toast.success('Auth code copied to clipboard')
      } else {
        toast.error('No auth code returned')
      }
    } catch {
      toast.error('Failed to get auth code')
    } finally {
      setAuthCodeLoading(false)
    }
  }

  // ------- MAILBOX DETAIL -------

  const handleViewMailbox = async (mailbox: MailboxRow) => {
    setSelectedMailbox(mailbox)
    setMailboxDetailOpen(true)
    setClientConfig(null)
    setMailboxDnsReadiness(null)

    // Fetch client config + DNS readiness in parallel
    const params = new URLSearchParams({ projectId })

    try {
      const response = await fetch(`/api/admin/inhouse/mailboxes/${mailbox.id}/client-config?${params}`)
      if (response.ok) {
        const data = await response.json()
        setClientConfig(data.data || null)
      }
    } catch {
      // non-critical
    }

    try {
      const response = await fetch(`/api/admin/inhouse/email-domains/${mailbox.domain_id}/mailbox-dns-readiness?${params}`)
      if (response.ok) {
        const data = await response.json()
        setMailboxDnsReadiness(data.data?.checks || data.data || null)
      }
    } catch {
      // non-critical
    }
  }

  const handleSuspendMailbox = async (mailboxId: string, suspend: boolean) => {
    const reason = window.prompt(`Reason for ${suspend ? 'suspending' : 'unsuspending'} (required):`)
    if (!reason) return
    setMailboxActionLoading(suspend ? 'suspend' : 'unsuspend')
    try {
      const action = suspend ? 'suspend' : 'unsuspend'
      const response = await fetch(`/api/admin/inhouse/mailboxes/${mailboxId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, reason }),
      })
      if (!response.ok) throw new Error('Failed')
      toast.success(suspend ? 'Mailbox suspended' : 'Mailbox unsuspended')
      fetchMailboxes()
      if (selectedMailbox?.id === mailboxId) {
        setMailboxDetailOpen(false)
      }
    } catch {
      toast.error(`Failed to ${suspend ? 'suspend' : 'unsuspend'} mailbox`)
    } finally {
      setMailboxActionLoading(null)
    }
  }

  const openResetPasswordDialog = (mailboxId: string) => {
    setResetPasswordMailboxId(mailboxId)
    setResetPasswordValue('')
    setResetPasswordOpen(true)
  }

  const handleResetMailboxPassword = async () => {
    if (resetPasswordValue.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setMailboxActionLoading('reset-password')
    try {
      const response = await fetch(`/api/admin/inhouse/mailboxes/${resetPasswordMailboxId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, newPassword: resetPasswordValue }),
      })
      if (!response.ok) throw new Error('Failed')
      toast.success('Password reset successfully')
      setResetPasswordOpen(false)
    } catch {
      toast.error('Failed to reset password')
    } finally {
      setMailboxActionLoading(null)
    }
  }

  const handleOpenWebmail = async (mailboxId: string) => {
    setMailboxActionLoading('webmail')
    try {
      const response = await fetch(`/api/admin/inhouse/mailboxes/${mailboxId}/webmail-sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      const url = data.data?.url || data.data?.ssoUrl
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        toast.error('No webmail URL returned')
      }
    } catch {
      toast.error('Failed to get webmail SSO URL')
    } finally {
      setMailboxActionLoading(null)
    }
  }

  const handleDeleteMailbox = async (mailboxId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this mailbox? This action cannot be undone.')
    if (!confirmed) return
    setMailboxActionLoading('delete')
    try {
      const response = await fetch(`/api/admin/inhouse/mailboxes/${mailboxId}?projectId=${projectId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed')
      toast.success('Mailbox deleted')
      setMailboxDetailOpen(false)
      fetchMailboxes()
    } catch {
      toast.error('Failed to delete mailbox')
    } finally {
      setMailboxActionLoading(null)
    }
  }

  // ------- ENABLE MAILBOXES -------

  const [enableMailboxesDomainId, setEnableMailboxesDomainId] = useState('')
  const [enableMailboxesConfirmOpen, setEnableMailboxesConfirmOpen] = useState(false)
  const [enablingMailboxes, setEnablingMailboxes] = useState(false)

  const promptEnableMailboxes = (domainId: string) => {
    setEnableMailboxesDomainId(domainId)
    setEnableMailboxesConfirmOpen(true)
  }

  const handleEnableMailboxes = async () => {
    setEnablingMailboxes(true)
    try {
      const response = await fetch(`/api/admin/inhouse/email-domains/${enableMailboxesDomainId}/mailboxes/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) throw new Error('Failed')
      toast.success('Mailboxes enabled for domain')
      setEnableMailboxesConfirmOpen(false)
      fetchEmailDomains()
    } catch {
      toast.error('Failed to enable mailboxes')
    } finally {
      setEnablingMailboxes(false)
    }
  }

  // ------- DOMAIN SEARCH -------

  const handleDomainSearch = async () => {
    if (!searchQuery.trim() || selectedTlds.length === 0) {
      toast.error('Enter a search query and select at least one TLD')
      return
    }
    setSearching(true)
    setSearchResults([])

    try {
      const response = await fetch('/api/admin/inhouse/registered-domains/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, query: searchQuery.trim(), tlds: selectedTlds }),
      })
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      setSearchResults(data.data?.results || [])
    } catch {
      toast.error('Domain search failed')
    } finally {
      setSearching(false)
    }
  }

  const fetchPricing = useCallback(async () => {
    if (!projectId) return
    try {
      const response = await fetch(`/api/admin/inhouse/domain-pricing?projectId=${projectId}`)
      if (response.ok) {
        const data = await response.json()
        setPricingData(data.data || null)
      }
    } catch {
      // non-critical
    }
  }, [projectId])

  useEffect(() => {
    if (searchExpanded && !pricingData) {
      fetchPricing()
    }
  }, [searchExpanded, pricingData, fetchPricing])

  // ------- CREATE MAILBOX -------

  const handleCreateMailbox = async () => {
    if (!createMailboxDomainId || !createMailboxLocalPart || !createMailboxPassword) {
      toast.error('Domain, local part, and password are required')
      return
    }
    if (createMailboxPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setCreatingMailbox(true)
    try {
      const body: Record<string, any> = {
        projectId,
        domainId: createMailboxDomainId,
        localPart: createMailboxLocalPart.trim(),
        password: createMailboxPassword,
      }
      if (createMailboxDisplayName.trim()) body.displayName = createMailboxDisplayName.trim()
      if (createMailboxQuota && parseInt(createMailboxQuota) > 0) body.quotaMb = parseInt(createMailboxQuota)

      const response = await fetch('/api/admin/inhouse/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error || 'Failed')
      }
      toast.success('Mailbox created')
      setCreateMailboxOpen(false)
      setCreateMailboxDomainId('')
      setCreateMailboxLocalPart('')
      setCreateMailboxPassword('')
      setCreateMailboxDisplayName('')
      setCreateMailboxQuota('')
      fetchMailboxes()
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create mailbox')
    } finally {
      setCreatingMailbox(false)
    }
  }

  // ------- HEALTH SUMMARY -------

  const healthSummary = (() => {
    const issues: { label: string; tab: string; filter?: string }[] = []
    const failingDomains = emailDomains.filter(d => d.status === 'error')
    if (failingDomains.length > 0) {
      issues.push({ label: `${failingDomains.length} domain${failingDomains.length > 1 ? 's' : ''} in error`, tab: 'email-domains', filter: 'error' })
    }
    const pendingDomains = emailDomains.filter(d => d.status === 'pending')
    if (pendingDomains.length > 0) {
      issues.push({ label: `${pendingDomains.length} pending`, tab: 'email-domains', filter: 'pending' })
    }
    const verifyingDomains = emailDomains.filter(d => d.status === 'verifying')
    if (verifyingDomains.length > 0) {
      issues.push({ label: `${verifyingDomains.length} verifying`, tab: 'email-domains', filter: 'verifying' })
    }
    const expiringDomains = registeredDomains.filter(d => {
      if (!d.expires_at) return false
      const daysUntilExpiry = (new Date(d.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      return daysUntilExpiry < 30 && daysUntilExpiry > 0
    })
    if (expiringDomains.length > 0) {
      issues.push({ label: `${expiringDomains.length} domain${expiringDomains.length > 1 ? 's' : ''} expiring soon`, tab: 'registered-domains' })
    }
    // Domains with active disputes or at_risk status
    const disputedDomains = registeredDomains.filter(d =>
      d.dispute_status === 'open' || d.status === 'at_risk'
    )
    if (disputedDomains.length > 0) {
      issues.push({ label: `${disputedDomains.length} domain${disputedDomains.length > 1 ? 's' : ''} with disputes`, tab: 'registered-domains' })
    }
    // Active transfers (not completed/failed/cancelled)
    const activeTransfers = transfers.filter(t =>
      !['completed', 'failed', 'cancelled'].includes(t.status)
    )
    if (activeTransfers.length > 0) {
      issues.push({ label: `${activeTransfers.length} transfer${activeTransfers.length > 1 ? 's' : ''} in progress`, tab: 'transfers' })
    }
    const errorMailboxes = mailboxes.filter(m => m.provisioning_status === 'error')
    if (errorMailboxes.length > 0) {
      issues.push({ label: `${errorMailboxes.length} mailbox${errorMailboxes.length > 1 ? 'es' : ''} in error`, tab: 'mailboxes', filter: 'error' })
    }
    return issues
  })()

  // ------- HEALTH BADGE CLICK HANDLER (Task 5) -------

  const handleHealthBadgeClick = (issue: { tab: string; filter?: string }) => {
    setActiveTab(issue.tab)
    if (issue.filter) {
      if (issue.tab === 'email-domains') {
        setEmailDomainStatus(issue.filter)
      } else if (issue.tab === 'mailboxes') {
        setMailboxStatus(issue.filter)
      } else if (issue.tab === 'transfers') {
        setTransferStatus(issue.filter)
      } else if (issue.tab === 'registered-domains') {
        setRegisteredDomainStatus(issue.filter)
      }
    }
  }

  // ------- HELPER: VERIFIED EMAIL DOMAINS (for Create Mailbox domain select) -------

  const verifiedEmailDomains = emailDomains.filter(d => d.status === 'verified')

  // ------- HELPER: DOMAINS WITH RESEND MODE (for Enable Mailboxes button) -------

  const resendModeDomains = emailDomains.filter(d => d.mailbox_mode === 'resend')

  // ------- EXPIRY COLOR -------

  function expiryColor(expiresAt: string): string {
    const days = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    if (days < 0) return 'text-red-700'
    if (days < 7) return 'text-red-500'
    if (days < 30) return 'text-yellow-600'
    return 'text-green-600'
  }

  // ------- HELPER: EMAIL PREVIEW FOR CREATE MAILBOX -------

  const createMailboxEmailPreview = (() => {
    if (!createMailboxDomainId || !createMailboxLocalPart) return ''
    const domain = verifiedEmailDomains.find(d => d.id === createMailboxDomainId)
    if (!domain) return ''
    return `${createMailboxLocalPart.trim()}@${domain.domain}`
  })()

  // ------- RENDER -------

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Domain Management
          </CardTitle>
          <CardDescription>Select a project to manage its domains and mailboxes</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <ProjectPicker value={projectId} onChange={setProjectId} />
          <Button variant="outline" onClick={handleRefresh} disabled={!projectId}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Health Summary */}
      {projectId && healthSummary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {healthSummary.map((issue, i) => (
            <Badge
              key={i}
              variant="outline"
              className="cursor-pointer hover:bg-accent"
              onClick={() => handleHealthBadgeClick(issue)}
            >
              {issue.label}
            </Badge>
          ))}
        </div>
      )}

      {!projectId && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Select a project to view domains and mailboxes
          </CardContent>
        </Card>
      )}

      {projectId && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="email-domains">
              <Mail className="h-4 w-4 mr-1" />
              Email Domains ({emailDomains.length})
            </TabsTrigger>
            <TabsTrigger value="registered-domains">
              <Globe className="h-4 w-4 mr-1" />
              Registered ({registeredDomains.length})
            </TabsTrigger>
            <TabsTrigger value="mailboxes">
              <Server className="h-4 w-4 mr-1" />
              Mailboxes ({mailboxes.length})
            </TabsTrigger>
            <TabsTrigger value="transfers">
              <RefreshCw className="h-4 w-4 mr-1" />
              Transfers ({transfers.length})
            </TabsTrigger>
          </TabsList>

          {/* ============= EMAIL DOMAINS TAB ============= */}
          <TabsContent value="email-domains">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Email Domains</CardTitle>
                    <CardDescription>Custom domain verification status</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {resendModeDomains.length > 0 && (
                      <Select onValueChange={(domainId) => promptEnableMailboxes(domainId)}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Enable Mailboxes..." />
                        </SelectTrigger>
                        <SelectContent>
                          {resendModeDomains.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button onClick={() => setWizardOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Connect Domain
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Select value={emailDomainStatus} onValueChange={setEmailDomainStatus}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="verifying">Verifying</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {emailDomainsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : emailDomains.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">No email domains found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domain</TableHead>
                        <TableHead>Authority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>DNS</TableHead>
                        <TableHead>Last Checked</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailDomains.map((domain) => (
                        <TableRow key={domain.id}>
                          <TableCell>
                            <div className="font-medium">{domain.domain}</div>
                            {domain.is_subdomain && (
                              <span className="text-xs text-muted-foreground">subdomain</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{domain.authority_level}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={domain.status === 'verified' ? 'default' : domain.status === 'error' ? 'destructive' : 'outline'}
                            >
                              {domain.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DnsStatusIndicator dnsStatus={domain.dns_status || {}} compact />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {domain.last_checked_at
                              ? formatDistanceToNow(new Date(domain.last_checked_at), { addSuffix: true })
                              : 'Never'}
                          </TableCell>
                          <TableCell className="space-x-2">
                            <Button size="sm" variant="outline" onClick={() => handleViewDomain(domain)}>
                              Details
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleVerifyDomain(domain.id)}>
                              Verify
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============= REGISTERED DOMAINS TAB ============= */}
          <TabsContent value="registered-domains">
            {/* Domain Search Card */}
            <Card className="mb-4">
              <CardHeader
                className="cursor-pointer"
                onClick={() => setSearchExpanded(!searchExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    <CardTitle className="text-base">Domain Search</CardTitle>
                  </div>
                  {searchExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardHeader>
              {searchExpanded && (
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter domain name (e.g., mybusiness)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleDomainSearch() }}
                      className="flex-1"
                    />
                    <Button onClick={handleDomainSearch} disabled={searching}>
                      {searching ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
                      Search
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {AVAILABLE_TLDS.map((tld) => (
                      <div key={tld} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`tld-${tld}`}
                          checked={selectedTlds.includes(tld)}
                          onCheckedChange={(checked) => {
                            setSelectedTlds(prev =>
                              checked ? [...prev, tld] : prev.filter(t => t !== tld)
                            )
                          }}
                        />
                        <Label htmlFor={`tld-${tld}`} className="text-sm cursor-pointer">{tld}</Label>
                      </div>
                    ))}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="border rounded-md divide-y">
                      {searchResults.map((result, i) => (
                        <div key={i} className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{result.domain}</span>
                            <Badge variant={result.available ? 'default' : 'outline'}>
                              {result.available ? 'Available' : 'Taken'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            {result.available && result.price && (
                              <span className="text-sm text-muted-foreground">
                                {result.price.registration || '—'}
                                {result.price.renewal && ` / ${result.price.renewal} renewal`}
                              </span>
                            )}
                            {result.available && pricingData && !result.price && (
                              <span className="text-sm text-muted-foreground">
                                {pricingData[result.domain.split('.').pop() || '']?.registration || '—'}
                              </span>
                            )}
                            {result.available && (
                              <Button size="sm" variant="outline" disabled>
                                Register (Coming Soon)
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Registered Domains Table */}
            <Card>
              <CardHeader>
                <CardTitle>Registered Domains</CardTitle>
                <CardDescription>Domains purchased through SheenApps</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Select value={registeredDomainStatus} onValueChange={setRegisteredDomainStatus}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="grace">Grace</SelectItem>
                      <SelectItem value="redemption">Redemption</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {registeredDomainsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : registeredDomains.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">No registered domains found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domain</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Dispute</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Auto-Renew</TableHead>
                        <TableHead>Privacy</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registeredDomains.map((domain) => (
                        <TableRow
                          key={domain.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleViewRegisteredDomain(domain)}
                        >
                          <TableCell className="font-medium">{domain.domain}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Badge variant={domain.status === 'active' ? 'default' : domain.status === 'at_risk' ? 'secondary' : 'destructive'}>
                                {domain.status}
                              </Badge>
                              {domain.status === 'at_risk' && (
                                <span title="Domain has active billing dispute" className="text-yellow-600">⚠</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {domain.dispute_status && domain.dispute_status !== 'none' ? (
                              <Badge
                                variant={
                                  domain.dispute_status === 'open' ? 'destructive' :
                                  domain.dispute_status === 'won' ? 'default' :
                                  domain.dispute_status === 'lost' ? 'secondary' : 'outline'
                                }
                              >
                                {domain.dispute_status}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {domain.expires_at ? (
                              <span className={expiryColor(domain.expires_at)}>
                                {format(new Date(domain.expires_at), 'PP')}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell>{domain.auto_renew ? 'Yes' : 'No'}</TableCell>
                          <TableCell>{domain.whois_privacy ? 'On' : 'Off'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(domain.created_at), 'PP')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============= MAILBOXES TAB ============= */}
          <TabsContent value="mailboxes">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Mailboxes</CardTitle>
                    <CardDescription>Real email mailboxes provisioned via OpenSRS</CardDescription>
                  </div>
                  <Button onClick={() => setCreateMailboxOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create Mailbox
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Select value={mailboxStatus} onValueChange={setMailboxStatus}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="provisioning">Provisioning</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {mailboxesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : mailboxes.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">No mailboxes found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email Address</TableHead>
                        <TableHead>Domain</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Quota</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mailboxes.map((mailbox) => (
                        <TableRow key={mailbox.id}>
                          <TableCell className="font-medium">{mailbox.email_address}</TableCell>
                          <TableCell>{mailbox.domain_name}</TableCell>
                          <TableCell>
                            <Badge
                              variant={mailbox.provisioning_status === 'active' ? 'default' : mailbox.provisioning_status === 'error' ? 'destructive' : 'outline'}
                            >
                              {mailbox.provisioning_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {mailbox.quota_used_mb}/{mailbox.quota_mb} MB
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(mailbox.created_at), 'PP')}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => handleViewMailbox(mailbox)}>
                              Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============= TRANSFERS TAB ============= */}
          <TabsContent value="transfers">
            <Card>
              <CardHeader>
                <CardTitle>Domain Transfers</CardTitle>
                <CardDescription>Track domain transfer-in progress</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Select value={transferStatus} onValueChange={setTransferStatus}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending_payment">Pending Payment</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="initiated">Initiated</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {transfersLoading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : transfers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No transfers found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domain</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Initiated</TableHead>
                        <TableHead>Completed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map((transfer) => (
                        <TableRow key={transfer.id}>
                          <TableCell className="font-medium">{transfer.domain}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                transfer.status === 'completed' ? 'default' :
                                transfer.status === 'failed' || transfer.status === 'cancelled' ? 'destructive' :
                                'secondary'
                              }
                            >
                              {transfer.status.replace(/_/g, ' ')}
                            </Badge>
                            {transfer.status_message && (
                              <span className="ml-2 text-xs text-muted-foreground" title={transfer.status_message}>
                                ⓘ
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {transfer.source_registrar || '—'}
                          </TableCell>
                          <TableCell>
                            ${(transfer.price_cents / 100).toFixed(2)} {transfer.currency}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {transfer.initiated_at ? format(new Date(transfer.initiated_at), 'PP') : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {transfer.completed_at ? format(new Date(transfer.completed_at), 'PP') : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ============= EMAIL DOMAIN DETAIL DIALOG ============= */}
      <Dialog open={domainDetailOpen} onOpenChange={setDomainDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Domain Details</DialogTitle>
            <DialogDescription>{selectedDomain?.domain}</DialogDescription>
          </DialogHeader>
          {selectedDomain && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><strong>Status:</strong> {selectedDomain.status}</div>
                <div><strong>Authority:</strong> {selectedDomain.authority_level}</div>
                <div><strong>Ownership:</strong> {selectedDomain.ownership_verified ? 'Verified' : 'Pending'}</div>
                <div><strong>Last Checked:</strong> {selectedDomain.last_checked_at ? formatDistanceToNow(new Date(selectedDomain.last_checked_at), { addSuffix: true }) : 'Never'}</div>
              </div>

              {selectedDomain.last_error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {selectedDomain.last_error}
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium mb-2">DNS Status</h4>
                <DnsStatusIndicator dnsStatus={selectedDomain.dns_status || {}} />
              </div>

              {domainDetailData?.dnsInstructions && (
                <div>
                  <h4 className="text-sm font-medium mb-2">DNS Instructions</h4>
                  <div className="space-y-2">
                    {(domainDetailData.dnsInstructions.records || []).map((record: any, i: number) => (
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
              )}

              <div className="flex gap-2">
                <Button onClick={() => handleVerifyDomain(selectedDomain.id)}>
                  Verify Now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============= REGISTERED DOMAIN DETAIL DIALOG ============= */}
      <Dialog open={registeredDomainDetailOpen} onOpenChange={setRegisteredDomainDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registered Domain Details</DialogTitle>
            <DialogDescription>{selectedRegisteredDomain?.domain}</DialogDescription>
          </DialogHeader>
          {selectedRegisteredDomain && (
            <div className="space-y-6">
              {/* Domain Info Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><strong>Status:</strong>{' '}
                  <Badge variant={selectedRegisteredDomain.status === 'active' ? 'default' : 'destructive'}>
                    {selectedRegisteredDomain.status}
                  </Badge>
                </div>
                <div><strong>TLD:</strong> .{selectedRegisteredDomain.tld}</div>
                <div><strong>Expires:</strong>{' '}
                  {selectedRegisteredDomain.expires_at ? (
                    <span className={expiryColor(selectedRegisteredDomain.expires_at)}>
                      {format(new Date(selectedRegisteredDomain.expires_at), 'PPp')}
                    </span>
                  ) : '—'}
                </div>
                <div><strong>Created:</strong> {format(new Date(selectedRegisteredDomain.created_at), 'PPp')}</div>
                {(registeredDomainFullData?.opensrs_order_id || selectedRegisteredDomain.opensrs_order_id) && (
                  <div className="flex items-center gap-1">
                    <strong>Order ID:</strong>
                    <span className="font-mono text-xs">{registeredDomainFullData?.opensrs_order_id || selectedRegisteredDomain.opensrs_order_id}</span>
                    <CopyButton value={registeredDomainFullData?.opensrs_order_id || selectedRegisteredDomain.opensrs_order_id || ''} size="icon" showToast={false} />
                  </div>
                )}
                {(registeredDomainFullData?.opensrs_domain_id || selectedRegisteredDomain.opensrs_domain_id) && (
                  <div className="flex items-center gap-1">
                    <strong>Domain ID:</strong>
                    <span className="font-mono text-xs">{registeredDomainFullData?.opensrs_domain_id || selectedRegisteredDomain.opensrs_domain_id}</span>
                    <CopyButton value={registeredDomainFullData?.opensrs_domain_id || selectedRegisteredDomain.opensrs_domain_id || ''} size="icon" showToast={false} />
                  </div>
                )}
              </div>

              {/* Dispute Info */}
              {selectedRegisteredDomain.dispute_status && selectedRegisteredDomain.dispute_status !== 'none' && (
                <div className="p-4 border rounded-lg bg-red-50 dark:bg-red-950 space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2 text-red-700 dark:text-red-300">
                    ⚠ Billing Dispute
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <strong>Status:</strong>{' '}
                      <Badge
                        variant={
                          selectedRegisteredDomain.dispute_status === 'open' ? 'destructive' :
                          selectedRegisteredDomain.dispute_status === 'won' ? 'default' :
                          selectedRegisteredDomain.dispute_status === 'lost' ? 'secondary' : 'outline'
                        }
                      >
                        {selectedRegisteredDomain.dispute_status}
                      </Badge>
                    </div>
                    {selectedRegisteredDomain.dispute_opened_at && (
                      <div>
                        <strong>Opened:</strong>{' '}
                        {format(new Date(selectedRegisteredDomain.dispute_opened_at), 'PPp')}
                      </div>
                    )}
                    {selectedRegisteredDomain.dispute_resolved_at && (
                      <div>
                        <strong>Resolved:</strong>{' '}
                        {format(new Date(selectedRegisteredDomain.dispute_resolved_at), 'PPp')}
                      </div>
                    )}
                    {selectedRegisteredDomain.dispute_reason && (
                      <div className="col-span-2">
                        <strong>Reason:</strong> {selectedRegisteredDomain.dispute_reason}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nameservers */}
              {(selectedRegisteredDomain.nameservers ?? registeredDomainFullData?.nameservers ?? []).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Nameservers</h4>
                  <div className="space-y-1">
                    {(selectedRegisteredDomain.nameservers ?? registeredDomainFullData?.nameservers ?? []).map((ns: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm font-mono">
                        <span>{ns}</span>
                        <CopyButton value={ns} size="icon" showToast={false} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contacts */}
              {registeredDomainFullData?.contacts && Object.keys(registeredDomainFullData.contacts).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Contacts</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {['owner', 'admin', 'billing', 'tech'].map((type) => {
                      const contact = registeredDomainFullData.contacts[type]
                      if (!contact) return null
                      return (
                        <div key={type} className="border rounded-md p-2 text-xs">
                          <div className="font-medium capitalize mb-1">{type}</div>
                          {contact.first_name && <div>{contact.first_name} {contact.last_name}</div>}
                          {contact.org_name && <div>{contact.org_name}</div>}
                          {contact.email && <div>{contact.email}</div>}
                          {contact.phone && <div>{contact.phone}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Settings Toggles */}
              <div>
                <h4 className="text-sm font-medium mb-2">Settings</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <RefreshCw className="h-4 w-4" />
                      Auto-Renew
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={settingsUpdating === 'auto_renew'}
                      onClick={() => handleUpdateRegisteredDomainSetting(selectedRegisteredDomain.id, 'auto_renew', !selectedRegisteredDomain.auto_renew)}
                    >
                      {settingsUpdating === 'auto_renew' ? <RefreshCw className="h-3 w-3 animate-spin" /> : selectedRegisteredDomain.auto_renew ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Eye className="h-4 w-4" />
                      WHOIS Privacy
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={settingsUpdating === 'whois_privacy'}
                      onClick={() => handleUpdateRegisteredDomainSetting(selectedRegisteredDomain.id, 'whois_privacy', !selectedRegisteredDomain.whois_privacy)}
                    >
                      {settingsUpdating === 'whois_privacy' ? <RefreshCw className="h-3 w-3 animate-spin" /> : selectedRegisteredDomain.whois_privacy ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      {selectedRegisteredDomain.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                      Domain Lock
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={settingsUpdating === 'locked'}
                      onClick={() => handleUpdateRegisteredDomainSetting(selectedRegisteredDomain.id, 'locked', !selectedRegisteredDomain.locked)}
                    >
                      {settingsUpdating === 'locked' ? <RefreshCw className="h-3 w-3 animate-spin" /> : selectedRegisteredDomain.locked ? 'Unlock' : 'Lock'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Event History */}
              <div>
                <h4 className="text-sm font-medium mb-2">Event History</h4>
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : domainEvents.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-2">No events recorded</div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                    {domainEvents.map((event) => (
                      <div key={event.id} className="p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">{event.event_type}</Badge>
                          <span className="text-muted-foreground">
                            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        {event.details && Object.keys(event.details).length > 0 && (
                          <div className="mt-1 text-muted-foreground font-mono">
                            {JSON.stringify(event.details)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() => handleRenewDomain(selectedRegisteredDomain.id)}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Renew
                </Button>
                <Button
                  variant="outline"
                  disabled={authCodeLoading}
                  onClick={() => handleGetAuthCode(selectedRegisteredDomain.id)}
                >
                  {authCodeLoading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Key className="h-4 w-4 mr-1" />}
                  Get Auth Code
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============= MAILBOX DETAIL DIALOG ============= */}
      <Dialog open={mailboxDetailOpen} onOpenChange={setMailboxDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mailbox Details</DialogTitle>
            <DialogDescription>{selectedMailbox?.email_address}</DialogDescription>
          </DialogHeader>
          {selectedMailbox && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><strong>Status:</strong> <Badge variant="outline">{selectedMailbox.provisioning_status}</Badge></div>
                <div><strong>Domain:</strong> {selectedMailbox.domain_name}</div>
                <div><strong>Quota:</strong> {selectedMailbox.quota_used_mb}/{selectedMailbox.quota_mb} MB</div>
                <div><strong>Mode:</strong> {selectedMailbox.mailbox_mode || '—'}</div>
              </div>

              {selectedMailbox.provisioning_error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {selectedMailbox.provisioning_error}
                </div>
              )}

              {/* DNS Readiness */}
              {mailboxDnsReadiness && Array.isArray(mailboxDnsReadiness) && mailboxDnsReadiness.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">DNS Readiness</h4>
                  <div className="space-y-2">
                    {mailboxDnsReadiness.map((check, i) => (
                      <div key={i} className="rounded-md border p-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={check.status === 'ready' || check.status === 'ok' ? 'text-green-600' : 'text-yellow-600'}>
                            {check.status === 'ready' || check.status === 'ok' ? '●' : '○'}
                          </span>
                          <span className="font-medium">{check.record_type}</span>
                          <span className="text-muted-foreground">{check.status}</span>
                        </div>
                        {(check.expected || check.actual) && (
                          <div className="mt-1 font-mono text-muted-foreground space-y-0.5 pl-4">
                            {check.expected && <div className="truncate">expected: {check.expected}</div>}
                            {check.actual && <div className="truncate">actual: {check.actual}</div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {clientConfig && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Client Configuration</h4>
                  <div className="rounded-md border p-3 text-xs font-mono space-y-1">
                    <div>IMAP: {clientConfig.imap?.host}:{clientConfig.imap?.port} ({clientConfig.imap?.security})</div>
                    <div>SMTP: {clientConfig.smtp?.host}:{clientConfig.smtp?.port} ({clientConfig.smtp?.security})</div>
                    <div>POP:  {clientConfig.pop?.host}:{clientConfig.pop?.port} ({clientConfig.pop?.security})</div>
                    {clientConfig.webmailUrl && <div>Webmail: {clientConfig.webmailUrl}</div>}
                  </div>
                  <CopyButton
                    value={`IMAP: ${clientConfig.imap?.host}:${clientConfig.imap?.port} (${clientConfig.imap?.security})\nSMTP: ${clientConfig.smtp?.host}:${clientConfig.smtp?.port} (${clientConfig.smtp?.security})\nPOP: ${clientConfig.pop?.host}:${clientConfig.pop?.port} (${clientConfig.pop?.security})`}
                    className="mt-2"
                  />
                </div>
              )}

              {/* Mailbox Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mailboxActionLoading !== null}
                  onClick={() => handleSuspendMailbox(selectedMailbox.id, selectedMailbox.provisioning_status !== 'suspended')}
                >
                  {mailboxActionLoading === 'suspend' || mailboxActionLoading === 'unsuspend'
                    ? <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    : <Shield className="h-3 w-3 mr-1" />}
                  {selectedMailbox.provisioning_status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mailboxActionLoading !== null}
                  onClick={() => openResetPasswordDialog(selectedMailbox.id)}
                >
                  {mailboxActionLoading === 'reset-password'
                    ? <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    : <Key className="h-3 w-3 mr-1" />}
                  Reset Password
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mailboxActionLoading !== null}
                  onClick={() => handleOpenWebmail(selectedMailbox.id)}
                >
                  {mailboxActionLoading === 'webmail'
                    ? <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    : <ExternalLink className="h-3 w-3 mr-1" />}
                  Open Webmail
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={mailboxActionLoading !== null}
                  onClick={() => handleDeleteMailbox(selectedMailbox.id)}
                >
                  {mailboxActionLoading === 'delete'
                    ? <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    : <Trash2 className="h-3 w-3 mr-1" />}
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============= CREATE MAILBOX DIALOG ============= */}
      <Dialog open={createMailboxOpen} onOpenChange={setCreateMailboxOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Mailbox</DialogTitle>
            <DialogDescription>Create a new email mailbox on a verified domain</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="mailbox-domain">Domain</Label>
              <Select value={createMailboxDomainId} onValueChange={setCreateMailboxDomainId}>
                <SelectTrigger id="mailbox-domain" className="mt-1">
                  <SelectValue placeholder="Select domain" />
                </SelectTrigger>
                <SelectContent>
                  {verifiedEmailDomains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="mailbox-local">Local part</Label>
              <Input
                id="mailbox-local"
                placeholder="e.g., support, hello, info"
                value={createMailboxLocalPart}
                onChange={(e) => setCreateMailboxLocalPart(e.target.value)}
                className="mt-1"
              />
              {createMailboxEmailPreview && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Email: <span className="font-medium">{createMailboxEmailPreview}</span>
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="mailbox-password">Password</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="mailbox-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 8 characters"
                  value={createMailboxPassword}
                  onChange={(e) => setCreateMailboxPassword(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPassword(v => !v)}
                  className="w-16"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
                    let password = ''
                    const arr = new Uint32Array(16)
                    crypto.getRandomValues(arr)
                    arr.forEach(n => (password += chars[n % chars.length]))
                    setCreateMailboxPassword(password)
                    setShowPassword(true) // Auto-show generated password
                  }}
                >
                  Generate
                </Button>
              </div>
              {createMailboxPassword && createMailboxPassword.length < 8 && (
                <p className="mt-1 text-xs text-destructive">Password must be at least 8 characters</p>
              )}
            </div>

            <div>
              <Label htmlFor="mailbox-display-name">Display Name (optional)</Label>
              <Input
                id="mailbox-display-name"
                placeholder="e.g., Support Team"
                value={createMailboxDisplayName}
                onChange={(e) => setCreateMailboxDisplayName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="mailbox-quota">Quota MB (optional)</Label>
              <Input
                id="mailbox-quota"
                type="number"
                placeholder="Default quota"
                value={createMailboxQuota}
                onChange={(e) => setCreateMailboxQuota(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateMailboxOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateMailbox} disabled={creatingMailbox || !createMailboxDomainId || !createMailboxLocalPart || !createMailboxPassword}>
                {creatingMailbox ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Create Mailbox
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============= ENABLE MAILBOXES CONFIRMATION DIALOG ============= */}
      <Dialog open={enableMailboxesConfirmOpen} onOpenChange={setEnableMailboxesConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enable Mailboxes</DialogTitle>
            <DialogDescription>
              This will switch the domain from Resend to hosted mailbox mode. This creates MX, SPF, DKIM, and DMARC records for mailbox hosting.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm">
            <strong>Domain:</strong>{' '}
            {resendModeDomains.find(d => d.id === enableMailboxesDomainId)?.domain || enableMailboxesDomainId}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEnableMailboxesConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleEnableMailboxes} disabled={enablingMailboxes}>
              {enablingMailboxes ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null}
              Enable Mailboxes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============= PASSWORD RESET DIALOG ============= */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Mailbox Password</DialogTitle>
            <DialogDescription>Enter a new password for this mailbox</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reset-password-input">New Password</Label>
              <Input
                id="reset-password-input"
                type="password"
                placeholder="Min 8 characters"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                className="mt-1"
                onKeyDown={(e) => { if (e.key === 'Enter' && resetPasswordValue.length >= 8) handleResetMailboxPassword() }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
              <Button
                onClick={handleResetMailboxPassword}
                disabled={mailboxActionLoading === 'reset-password' || resetPasswordValue.length < 8}
              >
                {mailboxActionLoading === 'reset-password' ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null}
                Reset Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============= DOMAIN WIZARD ============= */}
      <InhouseDomainWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        projectId={projectId}
        onComplete={() => {
          setWizardOpen(false)
          fetchEmailDomains()
        }}
      />
    </div>
  )
}
