"use client"

/**
 * Post Update Modal - Run Hub Phase 4
 *
 * Allows users to post updates/announcements to their audience via email.
 * Integrates with workflow-runs API for preview and execution.
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

interface PostUpdateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

type Segmentation = 'recent_30d' | 'recent_7d' | 'all'

// Helper to generate UUID with fallback
const mkKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function PostUpdateModal({ open, onOpenChange, projectId }: PostUpdateModalProps) {
  const t = useTranslations('run')
  const [step, setStep] = useState<'compose' | 'preview' | 'confirm'>('compose')
  const [sending, setSending] = useState(false)

  // Generate new idempotency key when modal opens (prevents reuse across sessions)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (open) setIdempotencyKey(mkKey())
  }, [open])

  // Update content
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [segmentation, setSegmentation] = useState<Segmentation>('recent_30d')

  // Use centralized preview hook with auto-abort on unmount
  // TODO: Change actionId to 'post_update' when distinct action is implemented
  const { loading: loadingPreview, data: preview, error: previewError } = useWorkflowPreview({
    projectId,
    actionId: 'send_promo', // Temporarily reuse send_promo recipient logic
    params: { segmentation },
    enabled: open,
  })

  const handleSubmit = async () => {
    if (!message.trim() || !subject.trim()) return

    setSending(true)
    try {
      // TODO: Change actionId to 'post_update' when distinct action is implemented
      const result = await createWorkflowRun({
        projectId,
        actionId: 'send_promo', // Temporarily reuse send_promo workflow
        idempotencyKey, // Reuse same key for this modal session
        params: {
          promoType: 'custom',
          segmentation,
          subject,
          message,
          isUpdate: true, // Flag to indicate this is an update, not promo
        },
        recipientCountEstimate: preview?.count,
      })

      if (result.deduplicated) {
        toast.info(t('workflows.alreadyRunning') || 'This update is already being sent')
        onOpenChange(false)
        resetForm()
        return
      }

      toast.success(t('workflows.updateStarted') || 'Update posted', {
        description: t('workflows.updateStartedDesc', { count: preview?.count ?? 0 }) ||
          `Sending to ${preview?.count ?? 0} subscribers`,
      })

      onOpenChange(false)
      resetForm()
    } catch (error) {
      toast.error((error as Error)?.message || t('actions.postUpdateFailed') || 'Failed to post update')
    } finally {
      setSending(false)
    }
  }

  const resetForm = () => {
    setStep('compose')
    setSubject('')
    setMessage('')
    setSegmentation('recent_30d')
  }

  const canProceed = () => {
    if (step === 'compose') {
      return Boolean(subject.trim() && message.trim())
    }
    return !previewError && (preview?.count ?? 0) > 0
  }

  // Only block after compose step (allow users to adjust settings if blocked)
  const isBlockedForStep = step !== 'compose' && Boolean(preview?.blocked || previewError)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm()
      onOpenChange(isOpen)
    }}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="sparkles" className="w-5 h-5" />
            {t('actions.postUpdate')}
          </DialogTitle>
          <DialogDescription>
            {t('actions.postUpdateDesc')}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-2">
          {(['compose', 'preview', 'confirm'] as const).map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : i < ['compose', 'preview', 'confirm'].indexOf(step)
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
          {step === 'compose' && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="update-subject">{t('actions.update.subject') || 'Subject'}</Label>
                <Input
                  id="update-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('actions.update.subjectPlaceholder') || "What's the news?"}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="update-message">{t('actions.modal.message') || 'Message'}</Label>
                <Textarea
                  id="update-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('actions.modal.messagePlaceholder') || 'Share news or updates with your audience...'}
                  className="min-h-[120px]"
                />
              </div>

              <div className="grid gap-2">
                <Label>{t('actions.update.audience') || 'Send to'}</Label>
                <Select value={segmentation} onValueChange={(v) => setSegmentation(v as Segmentation)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent_30d">
                      {t('actions.update.audience30d') || 'Active subscribers (30 days)'}
                    </SelectItem>
                    <SelectItem value="recent_7d">
                      {t('actions.update.audience7d') || 'Recent subscribers (7 days)'}
                    </SelectItem>
                    <SelectItem value="all">
                      {t('actions.update.audienceAll') || 'All subscribers'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Recipient count */}
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('actions.update.recipients') || 'Recipients'}
                  </span>
                  {loadingPreview ? (
                    <Icon name="loader-2" className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : previewError ? (
                    <span className="text-sm text-destructive">{previewError}</span>
                  ) : (
                    <span className="text-sm font-medium">
                      {preview?.count ?? 0} {t('actions.update.subscribers') || 'subscribers'}
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
              {/* No recipients warning */}
              {!loadingPreview && !previewError && (preview?.count ?? 0) === 0 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-900">
                  <div className="flex items-start gap-2">
                    <Icon name="alert-triangle" className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                      {t('actions.update.noRecipients') || 'No recipients match your audience selection.'}
                    </div>
                  </div>
                </div>
              )}

              {/* Email preview */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t('actions.update.emailPreview') || 'Email Preview'}
                </div>
                <div className="font-medium">{subject}</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {message}
                </div>
              </div>

              {/* Sample recipients */}
              {preview?.sample && preview.sample.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-medium mb-2">
                    {t('actions.update.sampleRecipients') || 'Sample recipients'}
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
                <h4 className="font-medium">{t('actions.update.summary') || 'Summary'}</h4>

                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('actions.update.subject') || 'Subject'}</span>
                    <span className="truncate max-w-[200px]">{subject}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('actions.update.recipients') || 'Recipients'}</span>
                    <span>{preview?.count ?? 0} {t('actions.update.subscribers') || 'subscribers'}</span>
                  </div>
                </div>

                {preview?.exclusions && preview.exclusions.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground mb-1">
                      {t('actions.update.excluded') || 'Excluded:'}
                    </div>
                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                      {preview.exclusions.map((ex, i) => (
                        <li key={i}>{ex}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

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

              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 border border-blue-200 dark:border-blue-900">
                <div className="flex items-start gap-2">
                  <Icon name="info" className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    {t('actions.update.confirmInfo', { count: preview?.count ?? 0 }) ||
                      `This update will be sent to ${preview?.count ?? 0} subscribers.`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step !== 'compose' && (
            <Button
              variant="outline"
              onClick={() => setStep(step === 'confirm' ? 'preview' : 'compose')}
            >
              <Icon name="chevron-left" className="w-4 h-4 mr-1" />
              {t('actions.modal.back') || 'Back'}
            </Button>
          )}

          {step === 'compose' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.modal.cancel') || 'Cancel'}
            </Button>
          )}

          {step !== 'confirm' && (
            <Button
              onClick={() => setStep(step === 'compose' ? 'preview' : 'confirm')}
              disabled={!canProceed() || isBlockedForStep}
            >
              {t('actions.modal.next') || 'Next'}
              <Icon name="chevron-right" className="w-4 h-4 ml-1" />
            </Button>
          )}

          {step === 'confirm' && (
            <Button onClick={handleSubmit} disabled={sending || isBlockedForStep}>
              {sending ? (
                <>
                  <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                  {t('actions.modal.sending') || 'Sending...'}
                </>
              ) : (
                <>
                  <Icon name="send" className="w-4 h-4 mr-2" />
                  {t('actions.modal.postUpdate') || 'Post Update'}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
