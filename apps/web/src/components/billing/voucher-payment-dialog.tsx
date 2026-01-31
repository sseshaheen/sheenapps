/**
 * Voucher Payment Dialog Component
 * Displays QR codes, payment instructions, and countdown timer for voucher payments
 * Based on MULTI_PROVIDER_FRONTEND_INTEGRATION_PLAN.md
 */

'use client'

import React, { useCallback, useEffect, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import DOMPurify from 'dompurify'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import { useToastWithUndo } from '@/components/ui/toast-with-undo'
import { useVoucherStatus } from '@/hooks/use-voucher-status'
import { useVoucherTimer } from '@/hooks/use-voucher-timer'
import type { MultiProviderCheckoutResultVoucher, VoucherStatusResponse } from '@/types/billing'
import { logger } from '@/utils/logger'

interface VoucherPaymentDialogProps {
  isOpen: boolean
  onClose: () => void
  result: MultiProviderCheckoutResultVoucher
  onPaymentComplete?: (result: VoucherStatusResponse) => void
  translations: {
    title: string
    paymentReference: string
    paymentInstructions: string
    timeRemaining: string
    voucherExpired: string
    copyReference: string
    referenceCopied: string
    generateNewVoucher: string
    payWith: string
    close: string
  }
}

/**
 * Enhanced voucher payment dialog with expert accessibility and UX improvements
 */
export function VoucherPaymentDialog({
  isOpen,
  onClose,
  result,
  onPaymentComplete,
  translations
}: VoucherPaymentDialogProps) {
  const { success: showSuccessToast } = useToastWithUndo()
  
  // Expert: Sanitize voucher instructions to prevent XSS
  const sanitizedInstructions = useMemo(() => {
    if (!result.voucher_instructions) return null
    
    // DOMPurify configuration: only allow text content, no HTML tags
    const clean = DOMPurify.sanitize(result.voucher_instructions, {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: [], // No attributes allowed
      KEEP_CONTENT: true // Keep text content
    })
    
    return clean
  }, [result.voucher_instructions])
  
  // Expert: Server-synced countdown timer with grace period
  const timer = useVoucherTimer(result.voucher_expires_at, result.server_now, {
    gracePeriodMs: 5000, // 5-second grace period for visual stability
    nearExpiryThresholdMs: 5 * 60 * 1000 // 5-minute warning threshold
  })

  // Expert: Validate grace period doesn't exceed actual expiry
  // Use actualRemaining for polling decisions, display for UI
  const shouldStopPolling = timer.actualRemaining <= 0
  
  // Expert: Status polling with automatic stop on terminal states
  const statusQuery = useVoucherStatus(result.order_id, {
    enabled: isOpen && !shouldStopPolling, // Use actual expiry, not visual grace period
    refetchInterval: 5000,
    onStatusChange: (status) => {
      if (status.status === 'paid' && onPaymentComplete) {
        logger.info('Voucher payment completed', {
          order_id: result.order_id,
          provider: result.payment_provider
        }, 'billing')
        onPaymentComplete(status)
        onClose() // Auto-close on successful payment
      }
    }
  })

  // Expert: One-tap reference copy with toast confirmation
  const handleCopyReference = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.voucher_reference)
      
      // Show success toast with payment reference for context
      showSuccessToast(
        translations.referenceCopied,
        `${translations.paymentReference}: ${result.voucher_reference}`
      )
      
      logger.debug('billing', 'Voucher reference copied', {
        order_id: result.order_id,
        provider: result.payment_provider
      })
      
    } catch (error) {
      logger.error('Failed to copy voucher reference', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'billing')
    }
  }, [result.voucher_reference, result.order_id, result.payment_provider, showSuccessToast, translations])

  // Expert: Generate new voucher for expired ones
  const handleGenerateNewVoucher = useCallback(() => {
    logger.info('Generating new voucher requested', {
      expired_order_id: result.order_id,
      provider: result.payment_provider
    }, 'billing')
    
    // TODO: Implement new voucher generation in Phase 3
    console.log('TODO: Generate new voucher for expired payment')
  }, [result.order_id, result.payment_provider])

  // Expert: Accessibility announcements for timer and status changes
  useEffect(() => {
    if (timer.isExpired) {
      // Announce expiry to screen readers
      const announcement = document.createElement('div')
      announcement.setAttribute('aria-live', 'assertive')
      announcement.setAttribute('aria-atomic', 'true')
      announcement.textContent = translations.voucherExpired
      announcement.style.position = 'absolute'
      announcement.style.left = '-10000px'
      document.body.appendChild(announcement)
      
      setTimeout(() => document.body.removeChild(announcement), 1000)
    }
  }, [timer.isExpired, translations.voucherExpired])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="qr-code" className="h-5 w-5 text-blue-500" />
            {translations.payWith.replace('{provider}', getProviderDisplayName(result.payment_provider))}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR Code Section */}
          {result.voucher_barcode_url && (
            <Card>
              <CardContent className="flex flex-col items-center p-6">
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG
                    value={result.voucher_barcode_url}
                    size={200}
                    level="M"
                    includeMargin
                    // Expert: Accessibility alt text for QR code
                    aria-label={`Payment QR code for reference ${result.voucher_reference}`}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  Scan with {getProviderDisplayName(result.payment_provider)} app
                </p>
              </CardContent>
            </Card>
          )}

          {/* Payment Reference Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{translations.paymentReference}</label>
            <div className="flex items-center gap-2">
              {/* Expert: RTL support with dir="ltr" for reference numbers */}
              <Badge variant="outline" className="font-mono text-base px-3 py-2 flex-1">
                <span dir="ltr">{result.voucher_reference}</span>
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyReference}
                className="flex-shrink-0"
                aria-label={`${translations.copyReference}: ${result.voucher_reference}`}
              >
                <Icon name="copy" className="h-4 w-4 mr-1" />
                {translations.copyReference}
              </Button>
            </div>
          </div>

          {/* Payment Instructions - Sanitized for Security */}
          {sanitizedInstructions && (
            <Alert>
              <Icon name="info" className="h-4 w-4" />
              <AlertDescription>
                <strong>{translations.paymentInstructions}</strong>
                <p className="mt-1">{sanitizedInstructions}</p>
              </AlertDescription>
            </Alert>
          )}

          {/* Timer Section with Expert Accessibility */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{translations.timeRemaining}</label>
            <div
              className="flex items-center gap-2"
              // Expert: Accessibility - assertive for expired, polite for countdown
              aria-live={timer.isExpired ? "assertive" : "polite"}
              aria-atomic="true"
              aria-label={timer.isExpired ? translations.voucherExpired : `Payment expires in ${timer.formattedTime}`}
            >
              {timer.isExpired ? (
                <Badge variant="destructive" className="text-base px-3 py-2">
                  <Icon name="clock" className="h-4 w-4 mr-1" />
                  {translations.voucherExpired}
                </Badge>
              ) : (
                <Badge 
                  variant={timer.isNearExpiry ? "destructive" : "secondary"}
                  className="text-base px-3 py-2 font-mono"
                >
                  <Icon name="clock" className="h-4 w-4 mr-1" />
                  {/* Expert: RTL support for timer display */}
                  <span dir="ltr">{timer.formattedTime}</span>
                  {/* Grace period indicator for transparency */}
                  {timer.actualRemaining <= 0 && timer.remaining > 0 && (
                    <span className="ml-1 text-xs opacity-60">(grace)</span>
                  )}
                </Badge>
              )}
            </div>
          </div>

          {/* Payment Status - Live region for updates */}
          {statusQuery.data && (
            <Alert>
              <Icon name="activity" className="h-4 w-4" />
              <AlertDescription 
                aria-live="polite" 
                aria-atomic="true"
                role="status"
              >
                Status: <strong>{(statusQuery.data as any)?.status}</strong>
                {(statusQuery.data as any)?.updated_at && (
                  <span className="text-muted-foreground">
                    {' '}• Updated {new Date((statusQuery.data as any).updated_at).toLocaleTimeString()}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Expired Voucher Actions */}
          {timer.isExpired && (
            <Alert variant="destructive">
              <Icon name="alert-triangle" className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <span>{translations.voucherExpired}</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleGenerateNewVoucher}
                    className="ml-2"
                  >
                    {translations.generateNewVoucher}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              {translations.close}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Get display name for payment provider
 */
function getProviderDisplayName(provider: string): string {
  const providerNames: Record<string, string> = {
    fawry: 'Fawry',
    paymob: 'Paymob',
    stcpay: 'STC Pay',
    paytabs: 'PayTabs',
    stripe: 'Stripe'
  }
  
  return providerNames[provider] || provider
}