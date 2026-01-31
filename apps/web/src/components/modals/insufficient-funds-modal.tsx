'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import type { InsufficientFundsError } from '@/types/billing'
import { formatMinutes, formatSeconds } from '@/types/billing'
import { usePricingCatalog } from '@/hooks/use-pricing-catalog'

interface InsufficientFundsModalProps {
  isOpen: boolean
  onClose: () => void
  error: InsufficientFundsError
  onPurchaseSuccess?: (resumeToken?: string) => void
  operationType?: string
}

/**
 * Enhanced Insufficient Funds Modal (Week 2.2 Implementation)
 * Expert-recommended UX with resume tokens and structured purchase suggestions
 */
export function InsufficientFundsModal({
  isOpen,
  onClose,
  error,
  onPurchaseSuccess,
  operationType = 'operation'
}: InsufficientFundsModalProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const { data: catalog } = usePricingCatalog() // Get current pricing for suggestions

  const handlePurchase = async (suggestion: InsufficientFundsError['suggestions'][0]) => {
    setIsProcessing(true)
    
    try {
      // Create checkout session based on suggestion
      const checkoutData = suggestion.type === 'package' 
        ? { packageKey: suggestion.key }
        : { planKey: suggestion.plan }

      const response = await fetch('/api/v1/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...checkoutData,
          resumeToken: error.resume_token, // Expert enhancement - auto-retry
          successUrl: `${window.location.origin}${window.location.pathname}?purchase=success&resume=${error.resume_token}`,
          cancelUrl: `${window.location.origin}${window.location.pathname}?purchase=cancelled`
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }

      const { url } = await response.json()
      
      // Redirect to Stripe checkout
      window.location.href = url
      
    } catch (err) {
      console.error('Purchase failed:', err)
      // Handle error - could show toast notification
    } finally {
      setIsProcessing(false)
    }
  }

  const totalMinutes = Math.floor(error.balance_seconds / 60)
  const requiredMinutes = Math.floor((error.balance_seconds || 0) / 60) + 1 // Estimate needed

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="zap" className="h-5 w-5 text-orange-500" />
            Insufficient AI Time
          </DialogTitle>
          <DialogDescription>
            Not enough AI time remaining to complete this {operationType}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Balance */}
          <Alert>
            <Icon name="clock" className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span>Current Balance:</span>
                <Badge variant="outline">
                  {formatMinutes(error.balance_seconds)}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Daily: {formatMinutes(error.breakdown_seconds.bonus_daily)} • 
                Paid: {formatMinutes(error.breakdown_seconds.paid)}
              </div>
            </AlertDescription>
          </Alert>

          {/* Purchase Suggestions */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Recommended Solutions:</h4>
            
            {error.suggestions.map((suggestion, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="space-y-1">
                  <div className="font-medium">
                    {suggestion.type === 'package' ? 'AI Time Package' : 'Plan Upgrade'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {suggestion.minutes && `+${suggestion.minutes} minutes`}
                    {suggestion.plan && ` • ${suggestion.plan} Plan`}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handlePurchase(suggestion)}
                  disabled={isProcessing}
                  className="min-w-[80px]"
                >
                  {isProcessing ? (
                    <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                  ) : (
                    'Purchase'
                  )}
                </Button>
              </div>
            ))}
          </div>

          {/* Resume Token Info (if available) */}
          {error.resume_token && (
            <Alert variant="default">
              <Icon name="rotate-ccw" className="h-4 w-4" />
              <AlertDescription>
                <div className="text-sm">
                  <strong>Auto-retry enabled:</strong> Your {operationType} will automatically 
                  continue after successful purchase.
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}