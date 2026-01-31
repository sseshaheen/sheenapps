'use client'

import { useEffect, useState } from 'react'
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

interface ReasonDialogProps {
  open: boolean
  title: string
  description?: string
  placeholder?: string
  confirmText?: string
  confirmVariant?: 'default' | 'destructive'
  requireReason?: boolean
  multiline?: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void> | void
}

/**
 * Reusable dialog for admin actions that require a reason.
 * Replaces window.prompt with proper UX.
 *
 * @example
 * const [showDialog, setShowDialog] = useState(false)
 *
 * <ReasonDialog
 *   open={showDialog}
 *   title="Delete File"
 *   description="This action cannot be undone."
 *   placeholder="Reason for deletion..."
 *   confirmText="Delete"
 *   confirmVariant="destructive"
 *   onClose={() => setShowDialog(false)}
 *   onConfirm={async (reason) => {
 *     await deleteFile(fileId, reason)
 *     setShowDialog(false)
 *   }}
 * />
 */
export function ReasonDialog({
  open,
  title,
  description,
  placeholder = 'Reason...',
  confirmText = 'Confirm',
  confirmVariant = 'default',
  requireReason = true,
  multiline = false,
  onClose,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setReason('')
      setBusy(false)
    }
  }, [open])

  const canConfirm = !busy && (!requireReason || reason.trim().length > 0)

  const handleConfirm = async () => {
    if (!canConfirm) return
    setBusy(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setBusy(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline && canConfirm) {
      e.preventDefault()
      handleConfirm()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {multiline ? (
          <Textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            rows={3}
            disabled={busy}
          />
        ) : (
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            onKeyDown={handleKeyDown}
            disabled={busy}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {busy ? 'Processing...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
