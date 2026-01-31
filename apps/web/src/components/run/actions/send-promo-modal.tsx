"use client"

/**
 * Send Promo Modal - Run Hub Phase 4
 *
 * Allows users to send promotional emails to their customers.
 * Integrates with workflow-runs API for preview and execution.
 */

import { useState, useEffect, useCallback } from 'react'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Icon from '@/components/ui/icon'
import { toast } from 'sonner'
import { useWorkflowPreview } from '@/lib/run/use-workflow-preview'
import { createWorkflowRun } from '@/lib/run/use-workflow-run'
import { useAuthStore } from '@/store'

interface SendPromoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

type PromoType = 'discount_percent' | 'discount_amount' | 'free_shipping' | 'custom'
type Segmentation = 'recent_30d' | 'recent_7d' | 'all'

// Helper to generate UUID with fallback
const mkKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function SendPromoModal({ open, onOpenChange, projectId }: SendPromoModalProps) {
  const t = useTranslations('run')
  const { user } = useAuthStore()
  const [step, setStep] = useState<'configure' | 'preview' | 'confirm'>('configure')
  const [sending, setSending] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)

  // Generate new idempotency key when modal opens (prevents reuse across sessions)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (open) setIdempotencyKey(mkKey())
  }, [open])

  // Promo configuration
  const [promoType, setPromoType] = useState<PromoType>('discount_percent')
  const [discountValue, setDiscountValue] = useState('10')
  const [segmentation, setSegmentation] = useState<Segmentation>('recent_30d')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  // Use centralized preview hook with auto-abort on unmount
  const { loading: loadingPreview, data: preview, error: previewError } = useWorkflowPreview({
    projectId,
    actionId: 'send_promo',
    params: { segmentation },
    enabled: open,
  })

  const handleSend = async () => {
    setSending(true)

    try {
      const result = await createWorkflowRun({
        projectId,
        actionId: 'send_promo',
        idempotencyKey, // Reuse same key for this modal session
        params: {
          promoType,
          discountValue: promoType === 'discount_percent' || promoType === 'discount_amount' ? discountValue : undefined,
          segmentation,
          subject: subject || getDefaultSubject(),
          message,
        },
        recipientCountEstimate: preview?.count,
      })

      // Handle deduplicated response
      if (result.deduplicated) {
        toast.info(t('workflows.alreadyRunning') || 'This promo is already being sent')
        onOpenChange(false)
        resetForm()
        return
      }

      // Success
      toast.success(t('workflows.started') || 'Promo campaign started', {
        description: t('workflows.promoStartedDesc', { count: preview?.count ?? 0 }) ||
          `Sending to ${preview?.count ?? 0} customers`,
      })

      onOpenChange(false)
      resetForm()
    } catch (error) {
      toast.error((error as Error)?.message || t('actions.sendPromoFailed') || 'Failed to send promo')
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
        actionId: 'send_promo',
        idempotencyKey: mkKey(), // Use new key for test
        params: {
          promoType,
          discountValue: promoType === 'discount_percent' || promoType === 'discount_amount' ? discountValue : undefined,
          segmentation,
          subject: subject || getDefaultSubject(),
          message,
        },
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
    setStep('configure')
    setPromoType('discount_percent')
    setDiscountValue('10')
    setSegmentation('recent_30d')
    setSubject('')
    setMessage('')
  }

  const getDefaultSubject = useCallback(() => {
    switch (promoType) {
      case 'discount_percent':
        return t('actions.promo.defaultSubjectPercent', { value: discountValue }) || `${discountValue}% off just for you!`
      case 'discount_amount':
        return t('actions.promo.defaultSubjectAmount', { value: discountValue }) || `$${discountValue} off your next order!`
      case 'free_shipping':
        return t('actions.promo.defaultSubjectShipping') || 'Free shipping on your next order!'
      default:
        return ''
    }
  }, [promoType, discountValue, t])

  // Set default subject when entering preview step
  useEffect(() => {
    if (step === 'preview' && !subject.trim()) {
      setSubject(getDefaultSubject())
    }
  }, [step, getDefaultSubject])

  const canProceed = () => {
    if (step === 'configure') {
      return Boolean(
        promoType && (promoType === 'free_shipping' || promoType === 'custom' || discountValue)
      )
    }
    if (step === 'preview') {
      return Boolean(subject.trim() && message.trim()) && !previewError && (preview?.count ?? 0) > 0
    }
    return true
  }

  // Only block after configure step (allow users to adjust settings if blocked)
  const isBlockedForStep = step !== 'configure' && Boolean(preview?.blocked || previewError)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm()
      onOpenChange(isOpen)
    }}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="mail" className="w-5 h-5" />
            {t('actions.sendPromo')}
          </DialogTitle>
          <DialogDescription>
            {t('actions.sendPromoDesc')}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-2">
          {(['configure', 'preview', 'confirm'] as const).map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : i < ['configure', 'preview', 'confirm'].indexOf(step)
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </div>
              {i < 2 && <div className="w-8 h-px bg-muted mx-1" />}
            </div>
          ))}
        </div>

        <div className="py-4">
          {step === 'configure' && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>{t('actions.promo.type') || 'Promo Type'}</Label>
                <Select value={promoType} onValueChange={(v) => setPromoType(v as PromoType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discount_percent">
                      {t('actions.promo.percentOff') || 'Percentage off'}
                    </SelectItem>
                    <SelectItem value="discount_amount">
                      {t('actions.promo.amountOff') || 'Fixed amount off'}
                    </SelectItem>
                    <SelectItem value="free_shipping">
                      {t('actions.promo.freeShipping') || 'Free shipping'}
                    </SelectItem>
                    <SelectItem value="custom">
                      {t('actions.promo.custom') || 'Custom message'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(promoType === 'discount_percent' || promoType === 'discount_amount') && (
                <div className="grid gap-2">
                  <Label>
                    {promoType === 'discount_percent'
                      ? (t('actions.promo.percentValue') || 'Discount percentage')
                      : (t('actions.promo.amountValue') || 'Discount amount')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      className="w-24"
                      min="1"
                      max={promoType === 'discount_percent' ? '100' : undefined}
                    />
                    <span className="text-sm text-muted-foreground">
                      {promoType === 'discount_percent' ? '%' : 'USD'}
                    </span>
                  </div>
                </div>
              )}

              {/* Audience selection */}
              <div className="grid gap-2">
                <Label>{t('actions.promo.audience') || 'Target Audience'}</Label>
                <Select value={segmentation} onValueChange={(v) => setSegmentation(v as Segmentation)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent_30d">
                      {t('actions.promo.audience30d') || 'Active customers (30 days)'}
                    </SelectItem>
                    <SelectItem value="recent_7d">
                      {t('actions.promo.audience7d') || 'Recent customers (7 days)'}
                    </SelectItem>
                    <SelectItem value="all">
                      {t('actions.promo.audienceAll') || 'All customers (1 year)'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Recipient count from preview */}
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('actions.promo.recipients') || 'Recipients'}
                  </span>
                  {loadingPreview ? (
                    <Icon name="loader-2" className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : previewError ? (
                    <span className="text-sm text-destructive">{previewError}</span>
                  ) : (
                    <span className="text-sm font-medium">
                      {preview?.count ?? 0} {t('actions.promo.customers') || 'customers'}
                    </span>
                  )}
                </div>
                {preview?.criteria && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {preview.criteria}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="subject">{t('actions.promo.subject') || 'Subject line'}</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={getDefaultSubject()}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="promo-message">{t('actions.promo.message') || 'Email message'}</Label>
                <Textarea
                  id="promo-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('actions.promo.messagePlaceholder') || 'Write your promotional message...'}
                  className="min-h-[120px]"
                />
              </div>

              {/* No recipients warning */}
              {!loadingPreview && !previewError && (preview?.count ?? 0) === 0 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-900">
                  <div className="flex items-start gap-2">
                    <Icon name="alert-triangle" className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                      {t('actions.promo.noRecipients') || 'No recipients match your audience selection.'}
                    </div>
                  </div>
                </div>
              )}

              {/* Sample recipients */}
              {preview?.sample && preview.sample.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-medium mb-2">
                    {t('actions.promo.sampleRecipients') || 'Sample recipients'}
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
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium">{t('actions.promo.summary') || 'Summary'}</h4>

                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('actions.promo.type') || 'Type'}</span>
                    <span>
                      {promoType === 'discount_percent' ? `${discountValue}% off` :
                       promoType === 'discount_amount' ? `$${discountValue} off` :
                       promoType === 'free_shipping' ? 'Free shipping' : 'Custom'}
                    </span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">{t('actions.promo.recipients') || 'Recipients'}</span>
                    <span className="text-end">
                      {preview?.count ?? 0} {t('actions.promo.customers') || 'customers'}
                      {/* P1.4: Show sample names for trust */}
                      {preview?.sample && preview.sample.length > 0 && preview.sample[0]?.name && (
                        <span className="block text-xs text-muted-foreground">
                          {t('actions.modal.includingSample', {
                            names: preview.sample.slice(0, 2).map(s => s.name).filter(Boolean).join(t('actions.modal.nameSeparator') || ', ')
                          }) || `including ${preview.sample.slice(0, 2).map(s => s.name).filter(Boolean).join(', ')}`}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('actions.promo.subject') || 'Subject'}</span>
                    <span className="truncate max-w-[200px]">{subject || getDefaultSubject()}</span>
                  </div>
                </div>

                {/* Exclusions */}
                {preview?.exclusions && preview.exclusions.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground mb-1">
                      {t('actions.promo.excluded') || 'Excluded:'}
                    </div>
                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                      {preview.exclusions.map((ex, i) => (
                        <li key={i}>{ex}</li>
                      ))}
                    </ul>
                  </div>
                )}
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
                      disabled={sendingTest || sending || isBlockedForStep}
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

              {/* Warnings */}
              {preview?.warnings && preview.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-900">
                  <div className="flex items-start gap-2">
                    <Icon name="alert-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                      {preview.warnings.join('. ')}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-900">
                <div className="flex items-start gap-2">
                  <Icon name="alert-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    {t('actions.promo.confirmWarning', { count: preview?.count ?? 0 }) ||
                      `You're about to send this promo to ${preview?.count ?? 0} customers. This action cannot be undone.`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step !== 'configure' && (
            <Button
              variant="outline"
              onClick={() => setStep(step === 'confirm' ? 'preview' : 'configure')}
            >
              <Icon name="chevron-left" className="w-4 h-4 mr-1" />
              {t('actions.modal.back') || 'Back'}
            </Button>
          )}

          {step === 'configure' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.modal.cancel') || 'Cancel'}
            </Button>
          )}

          {step !== 'confirm' && (
            <Button
              onClick={() => setStep(step === 'configure' ? 'preview' : 'confirm')}
              disabled={!canProceed() || isBlockedForStep}
            >
              {t('actions.modal.next') || 'Next'}
              <Icon name="chevron-right" className="w-4 h-4 ml-1" />
            </Button>
          )}

          {step === 'confirm' && (
            <Button onClick={handleSend} disabled={sending || isBlockedForStep}>
              {sending ? (
                <>
                  <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                  {t('actions.modal.sending') || 'Sending...'}
                </>
              ) : (
                <>
                  <Icon name="send" className="w-4 h-4 mr-2" />
                  {t('actions.promo.sendNow') || 'Send Promo'}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
