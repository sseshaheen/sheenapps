'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Plus, Trash2, ExternalLink, Key, Mail, Loader2, Copy, Check,
  MoreHorizontal, Pause, Play, RefreshCw, Settings, Power,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useDomainMailboxes, useCreateMailbox, useDeleteMailbox,
  useMailboxAction, useMailboxClientConfig, type Mailbox,
} from '@/hooks/use-mailboxes'
import { useToggleDomainMailboxes, type EmailDomain } from '@/hooks/use-email-domains'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { safeCopy } from '@/utils/clipboard'

interface MailboxManagerProps {
  projectId: string
  domains: EmailDomain[]
  domainsLoading: boolean
}

export function MailboxManager({ projectId, domains, domainsLoading }: MailboxManagerProps) {
  const t = useTranslations('project-email')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [ssoLoadingId, setSsoLoadingId] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword?: string } | null>(null)
  const [deleteMailboxId, setDeleteMailboxId] = useState<string | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [configMailbox, setConfigMailbox] = useState<Mailbox | null>(null)
  const [enableDomainId, setEnableDomainId] = useState<string | null>(null)

  const verifiedDomains = domains.filter(d => d.status === 'verified' || d.sendingReady)

  // Use first verified domain as default for mailbox listing
  const activeDomainId = selectedDomainId ?? verifiedDomains[0]?.id ?? null
  const { data: mailboxData, isLoading: mailboxesLoading } = useDomainMailboxes(
    projectId,
    activeDomainId ?? '',
    !!activeDomainId
  )
  const deleteMailbox = useDeleteMailbox(projectId)
  const mailboxAction = useMailboxAction(projectId)
  const toggleMailboxes = useToggleDomainMailboxes(projectId)

  // Reset selection if domain is no longer verified
  useEffect(() => {
    if (selectedDomainId && !verifiedDomains.some(d => d.id === selectedDomainId)) {
      setSelectedDomainId(null)
    }
  }, [selectedDomainId, verifiedDomains])

  const activeDomain = verifiedDomains.find(d => d.id === activeDomainId)
  const isResendMode = !activeDomain?.mailboxMode || activeDomain.mailboxMode === 'resend'
  const canCreateMailbox = !!activeDomainId && !isResendMode

  async function handleWebmailSso(mailbox: Mailbox) {
    setSsoLoadingId(mailbox.id)
    // Open blank tab synchronously to avoid popup blockers
    const tab = window.open('', '_blank', 'noopener,noreferrer')
    try {
      const result = await mailboxAction.mutateAsync({
        mailboxId: mailbox.id,
        domainId: mailbox.domainId,
        action: 'webmail-sso',
      })
      if (result?.url) {
        if (tab) tab.location.href = result.url
        else window.open(result.url, '_blank', 'noopener,noreferrer')
      } else {
        tab?.close()
        toast.error(t('common.error'))
      }
    } catch (error: any) {
      tab?.close()
      toast.error(error.message || t('common.error'))
    } finally {
      setSsoLoadingId(null)
    }
  }

  async function handleResetPassword(mailbox: Mailbox) {
    try {
      const result = await mailboxAction.mutateAsync({
        mailboxId: mailbox.id,
        domainId: mailbox.domainId,
        action: 'reset-password',
        body: {},
      })
      setResetResult({
        email: mailbox.email,
        tempPassword: result?.tempPassword,
      })
    } catch (error: any) {
      toast.error(error.message || t('common.error'))
    }
  }

  async function handleMailboxAction(mailbox: Mailbox, action: 'suspend' | 'unsuspend' | 'sync-quota') {
    try {
      await mailboxAction.mutateAsync({
        mailboxId: mailbox.id,
        domainId: mailbox.domainId,
        action,
      })
      const successKey: Record<string, string> = {
        suspend: 'mailboxes.suspendSuccess',
        unsuspend: 'mailboxes.unsuspendSuccess',
        'sync-quota': 'mailboxes.syncQuotaSuccess',
      }
      toast.success(t(successKey[action]))
    } catch (error: any) {
      toast.error(error.message || t('common.error'))
    }
  }

  const mailboxes = mailboxData?.mailboxes ?? []
  const isLoading = domainsLoading || mailboxesLoading

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {verifiedDomains.length > 1 && (
          <Select
            value={activeDomainId ?? ''}
            onValueChange={setSelectedDomainId}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('mailboxes.domain')} />
            </SelectTrigger>
            <SelectContent>
              {verifiedDomains.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {activeDomain && (
          <Badge variant="outline" className="text-xs">
            {isResendMode ? t('mailboxes.modeResend') : t('mailboxes.modeHosted')}
          </Badge>
        )}
        <div className="flex-1" />
        {activeDomainId && isResendMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEnableDomainId(activeDomainId)}
          >
            <Power className="h-4 w-4 me-1.5" />
            {t('mailboxes.enableMailboxes')}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          disabled={!canCreateMailbox}
          title={isResendMode ? t('mailboxes.enableFirstHint') : undefined}
        >
          <Plus className="h-4 w-4 me-1.5" />
          {t('mailboxes.create')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : verifiedDomains.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">{t('mailboxes.noVerifiedDomains')}</p>
          <p className="text-sm mt-1">{t('mailboxes.noVerifiedDomainsHint')}</p>
        </div>
      ) : mailboxes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>{t('mailboxes.noMailboxes')}</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {mailboxes.map((mailbox) => (
            <div key={mailbox.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-sm font-medium font-mono">{mailbox.email}</span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{mailbox.status}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => handleWebmailSso(mailbox)}
                  disabled={ssoLoadingId === mailbox.id}
                  title={t('mailboxes.openWebmail')}
                >
                  {ssoLoadingId === mailbox.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => handleResetPassword(mailbox)}
                  title={t('mailboxes.resetPassword')}
                >
                  <Key className="h-3.5 w-3.5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {mailbox.status === 'suspended' ? (
                      <DropdownMenuItem onClick={() => handleMailboxAction(mailbox, 'unsuspend')}>
                        <Play className="h-4 w-4 me-2" />
                        {t('mailboxes.unsuspend')}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handleMailboxAction(mailbox, 'suspend')}>
                        <Pause className="h-4 w-4 me-2" />
                        {t('mailboxes.suspend')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleMailboxAction(mailbox, 'sync-quota')}>
                      <RefreshCw className="h-4 w-4 me-2" />
                      {t('mailboxes.syncQuota')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConfigMailbox(mailbox)}>
                      <Settings className="h-4 w-4 me-2" />
                      {t('mailboxes.imapSettings')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteMailboxId(mailbox.id)}
                    >
                      <Trash2 className="h-4 w-4 me-2" />
                      {t('mailboxes.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reset Password Result Dialog */}
      {resetResult && (
        <Dialog open onOpenChange={() => { setResetResult(null); setPasswordCopied(false) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('mailboxes.resetPassword')}</DialogTitle>
              <DialogDescription>{resetResult.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {resetResult.tempPassword ? (
                <>
                  <p className="text-muted-foreground">{t('mailboxes.tempPassword')}</p>
                  <div className="flex items-start gap-2">
                    <div className="font-mono p-2 rounded bg-muted break-all select-all flex-1">
                      {resetResult.tempPassword}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                      onClick={async () => {
                        const ok = await safeCopy(resetResult.tempPassword!)
                        if (ok) {
                          setPasswordCopied(true)
                          setTimeout(() => setPasswordCopied(false), 2000)
                        } else {
                          toast.error(t('common.copyFailed'))
                        }
                      }}
                    >
                      {passwordCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">{t('mailboxes.passwordResetInitiated')}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Mailbox Dialog */}
      {showCreate && activeDomainId && (
        <CreateMailboxDialog
          projectId={projectId}
          domainId={activeDomainId}
          domainName={verifiedDomains.find(d => d.id === activeDomainId)?.domain ?? ''}
          onClose={() => setShowCreate(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleteMailboxId}
        onOpenChange={(open) => { if (!open) setDeleteMailboxId(null) }}
        title={t('mailboxes.delete')}
        description={t('mailboxes.deleteConfirm')}
        confirmLabel={t('mailboxes.delete')}
        cancelLabel={t('common.cancel')}
        variant="destructive"
        onConfirm={() => {
          const mb = mailboxes.find(m => m.id === deleteMailboxId)
          if (mb) {
            deleteMailbox.mutate({ mailboxId: mb.id, domainId: mb.domainId })
          }
        }}
      />

      {/* Client Config Dialog */}
      {configMailbox && (
        <ClientConfigDialog
          projectId={projectId}
          mailbox={configMailbox}
          onClose={() => setConfigMailbox(null)}
        />
      )}

      {/* Enable Mailboxes Confirm */}
      <ConfirmDialog
        open={!!enableDomainId}
        onOpenChange={(open) => { if (!open) setEnableDomainId(null) }}
        title={t('mailboxes.enableMailboxes')}
        description={t('mailboxes.enableConfirm')}
        confirmLabel={t('mailboxes.enableMailboxes')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (enableDomainId) {
            toggleMailboxes.mutate(
              { domainId: enableDomainId, enable: true },
              {
                onSuccess: () => {
                  toast.success(t('mailboxes.enableSuccess'))
                },
                onError: (error: any) => {
                  toast.error(error.message || t('common.error'))
                },
              }
            )
          }
        }}
      />
    </div>
  )
}

function CreateMailboxDialog({
  projectId,
  domainId,
  domainName,
  onClose,
}: {
  projectId: string
  domainId: string
  domainName: string
  onClose: () => void
}) {
  const t = useTranslations('project-email')
  const [localPart, setLocalPart] = useState('')
  const [password, setPassword] = useState('')

  const createMailbox = useCreateMailbox(projectId, domainId)

  async function handleCreate() {
    if (!localPart || !password) return
    try {
      await createMailbox.mutateAsync({ localPart, password })
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('mailboxes.create')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t('mailboxes.localPart')}</label>
            <div className="flex items-center gap-1 mt-1.5">
              <Input
                placeholder="support"
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">@{domainName}</span>
            </div>
            {localPart && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('mailboxes.preview')}: <span className="font-mono">{localPart}@{domainName}</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">{t('mailboxes.password')}</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!localPart || !password || createMailbox.isPending}
            >
              {createMailbox.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin me-1.5" />
              ) : null}
              {t('mailboxes.create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ClientConfigDialog({
  projectId,
  mailbox,
  onClose,
}: {
  projectId: string
  mailbox: Mailbox
  onClose: () => void
}) {
  const t = useTranslations('project-email')
  const [copied, setCopied] = useState(false)
  const { data: config, isLoading } = useMailboxClientConfig(projectId, mailbox.id, true)

  function formatConfig(): string {
    if (!config) return ''
    const lines: string[] = []
    if (config.imap) {
      lines.push(`IMAP`)
      lines.push(`  Host: ${config.imap.host}`)
      lines.push(`  Port: ${config.imap.port}`)
      lines.push(`  Security: ${config.imap.security}`)
    }
    if (config.smtp) {
      lines.push(`SMTP`)
      lines.push(`  Host: ${config.smtp.host}`)
      lines.push(`  Port: ${config.smtp.port}`)
      lines.push(`  Security: ${config.smtp.security}`)
    }
    if (config.pop) {
      lines.push(`POP3`)
      lines.push(`  Host: ${config.pop.host}`)
      lines.push(`  Port: ${config.pop.port}`)
      lines.push(`  Security: ${config.pop.security}`)
    }
    if (config.webmailUrl) {
      lines.push(`Webmail: ${config.webmailUrl}`)
    }
    return lines.join('\n')
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('mailboxes.imapSettings')}</DialogTitle>
          <DialogDescription>{mailbox.email}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : config ? (
          <div className="space-y-3">
            <pre className="text-xs font-mono bg-muted p-3 rounded-md whitespace-pre-wrap select-all">
              {formatConfig()}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={async () => {
                const ok = await safeCopy(formatConfig())
                if (ok) {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5 me-1.5" /> : <Copy className="h-3.5 w-3.5 me-1.5" />}
              {t('mailboxes.copyAll')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('common.error')}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
