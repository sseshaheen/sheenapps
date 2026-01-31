"use client"

/**
 * Recover Abandoned Checkout Modal - Run Hub Phase 4
 *
 * Allows users to send recovery emails to customers who abandoned their checkout.
 * Uses workflow-runs API with preview and execution flow.
 */

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { toast } from 'sonner'
import { useWorkflowPreview } from '@/lib/run/use-workflow-preview'
import { createWorkflowRun } from '@/lib/run/use-workflow-run'
import { useAuthStore } from '@/store'

interface RecoverAbandonedModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

// Helper to generate UUID with fallback
const mkKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function RecoverAbandonedModal({ open, onOpenChange, projectId }: RecoverAbandonedModalProps) {
  const t = useTranslations('run')
  const { user } = useAuthStore()
  const [step, setStep] = useState<'preview' | 'confirm'>('preview')
  const [sending, setSending] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)

  // Generate new idempotency key when modal opens (prevents reuse across sessions)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (open) setIdempotencyKey(mkKey())
  }, [open])

  // Use centralized preview hook with auto-abort on unmount
  const { loading: loadingPreview, data: preview, error: previewError } = useWorkflowPreview({
    projectId,
    actionId: 'recover_abandoned',
    params: {},
    enabled: open,
  })

  const handleSubmit = async () => {
    if (!preview || preview.count === 0) return

    setSending(true)
    try {
      const result = await createWorkflowRun({
        projectId,
        actionId: 'recover_abandoned',
        idempotencyKey, // Reuse same key for this modal session
        params: {},
        recipientCountEstimate: preview.count,
      })

      if (result.deduplicated) {
        toast.info(t('workflows.alreadyRunning') || 'Recovery is already running')
        onOpenChange(false)
        resetForm()
        return
      }

      toast.success(t('workflows.recoveryStarted') || 'Recovery started', {
        description: t('workflows.recoveryStartedDesc', { count: preview.count }) ||
          `Sending recovery emails to ${preview.count} abandoned checkouts`,
      })

      onOpenChange(false)
      resetForm()
    } catch (error) {
      toast.error((error as Error)?.message || t('actions.recoverAbandonedFailed') || 'Failed to start recovery')
    } finally {
      setSending(false)
    }
  }

  const handleSendTest = async () => {
    if (!user?.email) {
      toast.error(t('actions.modal.noEmailError') || 'Could not find your email')
      return
    }

    setSendingTest(true)

    try {
      await createWorkflowRun({
        projectId,
        actionId: 'recover_abandoned',
        idempotencyKey: mkKey(), // Use new key for test
        params: {},
        testMode: true,
        testRecipientEmail: user.email,
      })

      toast.success(t('actions.modal.testSent') || 'Test email sent', {
        description: t('actions.modal.testSentDesc', { email: user.email }) || `Check your inbox at ${user.email}`,
      })
    } catch (error) {
      toast.error((error as Error)?.message || t('actions.modal.testFailed') || 'Failed to send test email')
    } finally {
      setSendingTest(false)
    }
  }

  const resetForm = () => {
    setStep('preview')
  }

  const canProceed = !previewError && (preview?.count ?? 0) > 0
  const isBlocked = Boolean(preview?.blocked || previewError)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm()
      onOpenChange(isOpen)
    }}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="mail" className="w-5 h-5" />
            {t('actions.recoverAbandoned')}
          </DialogTitle>
          <DialogDescription>
            {t('actions.recoverAbandonedDesc')}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-2">
          {(['preview', 'confirm'] as const).map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : i < ['preview', 'confirm'].indexOf(step)
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </div>
              {i < 1 && <div className="w-8 h-px bg-muted mx-1" />}
            </div>
          ))}
        </div>

        <div className="py-4">
          {step === 'preview' && (
            <div className="space-y-4">
              {loadingPreview ? (
                <div className="flex items-center justify-center py-8">
                  <Icon name="loader-2" className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : previewError ? (
                <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/20">
                  <div className="flex items-start gap-2">
                    <Icon name="alert-circle" className="w-5 h-5 text-destructive mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">
                        {t('actions.modal.cannotProceed') || 'Cannot proceed'}
                      </p>
                      <p className="text-sm text-destructive/80 mt-1">{previewError}</p>
                    </div>
                  </div>
                </div>
              ) : preview ? (
                <>
                  {/* Abandoned checkout count */}
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('actions.recover.abandonedCheckouts') || 'Abandoned checkouts'}
                      </span>
                      <span className="text-2xl font-semibold">{preview.count}</span>
                    </div>
                    {preview.criteria && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {preview.criteria}
                      </p>
                    )}
                  </div>

                  {/* Sample recipients */}
                  {preview.sample && preview.sample.length > 0 && (
                    <div className="rounded-lg border p-3">
                      <div className="text-sm font-medium mb-2">
                        {t('actions.recover.sampleRecipients') || 'Sample recipients'}
                      </div>
                      <div className="space-y-1">
                        {preview.sample.slice(0, 3).map((r, i) => (
                          <div key={i} className="text-xs text-muted-foreground">
                            {r.name ? `${r.name} (${r.email})` : r.email}
                          </div>
                        ))}
                        {preview.sample.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{preview.sample.length - 3} more...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Exclusions */}
                  {preview.exclusions && preview.exclusions.length > 0 && (
                    <div className="rounded-lg border p-3">
                      <div className="text-sm font-medium mb-2">
                        {t('actions.recover.excluded') || 'Excluded'}
                      </div>
                      <ul className="text-xs text-muted-foreground list-disc list-inside">
                        {preview.exclusions.map((ex, i) => (
                          <li key={i}>{ex}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Warnings */}
                  {preview.warnings && preview.warnings.length > 0 && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-900">
                      <div className="flex items-start gap-2">
                        <Icon name="alert-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                        <div className="text-sm text-amber-800 dark:text-amber-200">
                          {preview.warnings.join('. ')}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {step === 'confirm' && preview && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium">{t('actions.recover.summary') || 'Summary'}</h4>

                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">
                      {t('actions.recover.abandonedCheckouts') || 'Abandoned checkouts'}
                    </span>
                    <span className="text-end">
                      {preview.count}
                      {/* P1.4: Show sample names for trust */}
                      {preview.sample && preview.sample.length > 0 && preview.sample[0]?.name && (
                        <span className="block text-xs text-muted-foreground">
                          {t('actions.modal.includingSample', {
                            names: preview.sample.slice(0, 2).map(s => s.name).filter(Boolean).join(t('actions.modal.nameSeparator') || ', ')
                          }) || `including ${preview.sample.slice(0, 2).map(s => s.name).filter(Boolean).join(', ')}`}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('actions.recover.emailType') || 'Email type'}
                    </span>
                    <span>{t('actions.recover.recoveryEmail') || 'Recovery reminder'}</span>
                  </div>
                </div>
              </div>

              {/* Send Test to Myself - P1.3 Trust Fix */}
              {user?.email && (
                <div className="rounded-lg border border-dashed p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t('actions.modal.testFirst') || 'Test first?'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t('actions.modal.sendTestDesc', { email: user.email }) || `Send a preview to ${user.email}`}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSendTest}
                      disabled={sendingTest || sending || isBlocked}
                      className="flex-shrink-0"
                    >
                      {sendingTest ? (
                        <Icon name="loader-2" className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Icon name="mail" className="w-4 h-4 me-1" />
                          {t('actions.modal.sendTest') || 'Send test'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 border border-blue-200 dark:border-blue-900">
                <div className="flex items-start gap-2">
                  <Icon name="info" className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    {t('actions.recover.confirmInfo', { count: preview.count }) ||
                      `Recovery emails will be sent to ${preview.count} customers who abandoned their checkout.`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step !== 'preview' && (
            <Button
              variant="outline"
              onClick={() => setStep('preview')}
            >
              <Icon name="chevron-left" className="w-4 h-4 mr-1" />
              {t('actions.modal.back') || 'Back'}
            </Button>
          )}

          {step === 'preview' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.modal.cancel') || 'Cancel'}
            </Button>
          )}

          {step === 'preview' && (
            <Button
              onClick={() => setStep('confirm')}
              disabled={!canProceed || isBlocked || loadingPreview}
            >
              {t('actions.modal.next') || 'Next'}
              <Icon name="chevron-right" className="w-4 h-4 ml-1" />
            </Button>
          )}

          {step === 'confirm' && (
            <Button onClick={handleSubmit} disabled={sending || isBlocked}>
              {sending ? (
                <>
                  <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                  {t('actions.modal.sending') || 'Sending...'}
                </>
              ) : (
                <>
                  <Icon name="send" className="w-4 h-4 mr-2" />
                  {t('actions.modal.sendRecovery') || 'Send Recovery Emails'}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
