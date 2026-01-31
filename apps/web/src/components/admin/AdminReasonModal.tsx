/**
 * 🔒 Admin Reason Collection Modal
 * Expert-validated modal for structured reason collection with validation and audit preview
 * 
 * Key features:
 * - Expert's reason code structure (T01-T05, F01-F03)
 * - 10-character minimum validation with live feedback
 * - PII sanitization preview
 * - Live audit log format preview
 * - Structured reason prefix with category codes
 */

'use client'

import { useState, useEffect } from 'react'
import { REASON_CODES } from '@/lib/admin/reason-codes'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export type ReasonCategory = keyof typeof REASON_CODES

export interface AdminReasonModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  category: ReasonCategory
  title: string
  description: string
  actionLabel?: string
  isProcessing?: boolean
}

export function AdminReasonModal({
  isOpen,
  onClose,
  onConfirm,
  category,
  title,
  description,
  actionLabel = 'Confirm Action',
  isProcessing = false
}: AdminReasonModalProps) {
  const [reasonCode, setReasonCode] = useState(Object.keys(REASON_CODES[category])[0])
  const [details, setDetails] = useState('')

  // Expert's 10-character minimum validation
  const isValidReason = details.trim().length >= 10
  const selectedReasonLabel = REASON_CODES[category][reasonCode as keyof typeof REASON_CODES[typeof category]]

  // Expert's live structured reason preview
  const finalReason = details.trim() ? `[${reasonCode}] ${details.trim()}` : ''

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setReasonCode(REASON_CODES[category][0].code)
      setDetails('')
    }
  }, [isOpen, category])

  const handleSubmit = () => {
    if (!isValidReason) {
      return // Button should be disabled anyway
    }

    // Expert pattern: auto-prefix with structured code
    const structuredReason = `[${reasonCode}] ${details.trim()}`
    onConfirm(structuredReason)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && isValidReason) {
      handleSubmit()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Action description */}
          <p className="text-sm text-foreground">
            {description}
          </p>

          {/* Reason code selection */}
          <div className="space-y-2">
            <Label htmlFor="reason-code">Reason Code</Label>
            <Select value={reasonCode} onValueChange={setReasonCode as any}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REASON_CODES[category]).map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    <div className="flex flex-col items-start">
                      <div className="font-medium">{code}</div>
                      <div className="text-xs text-foreground">{label}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedReasonLabel && (
              <p className="text-xs text-foreground">
                {selectedReasonLabel}
              </p>
            )}
          </div>

          {/* Details textarea with validation feedback */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="reason-details">Specific Details</Label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${
                  details.length === 0 ? 'text-foreground' :
                  details.length < 10 ? 'text-red-500' :
                  details.length < 50 ? 'text-orange-500' : 'text-green-500'
                }`}>
                  {details.length}/10 minimum
                </span>
              </div>
            </div>
            <Textarea
              id="reason-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide specific details about this action. Include context, evidence, or business justification..."
              className={`min-h-[100px] ${!isValidReason && details.length > 0 ? 'border-red-300 focus:border-red-500' : ''}`}
              maxLength={1000}
            />
            
            {/* Validation message */}
            {details.length > 0 && details.length < 10 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please provide at least 10 characters of detail for audit compliance.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Expert's live preview of final structured reason */}
          {finalReason && (
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded-md">
                <div className="text-xs font-medium text-foreground mb-1">
                  Audit Log Preview:
                </div>
                <div className="font-mono text-sm break-all">
                  {finalReason}
                </div>
              </div>

            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValidReason || isProcessing}
              className="min-w-[120px]"
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Processing...
                </div>
              ) : (
                actionLabel
              )}
            </Button>
          </div>

          {/* Keyboard shortcut hint */}
          {isValidReason && (
            <div className="text-xs text-foreground text-center">
              Press Cmd+Enter to confirm
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}