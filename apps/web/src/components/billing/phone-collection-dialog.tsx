/**
 * Phone Collection Dialog Component
 * Collects phone numbers for payment providers that require them (STC Pay)
 * Based on MULTI_PROVIDER_FRONTEND_INTEGRATION_PLAN.md
 */

'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Icon from '@/components/ui/icon'
import type { RegionCode, PaymentProvider } from '@/types/billing'
import { maskPhoneNumber } from '@/types/billing'
import { logger } from '@/utils/logger'

interface PhoneCollectionDialogProps {
  isOpen: boolean
  onClose: () => void
  onPhoneCollected: (phone: string) => void
  region: RegionCode
  provider: PaymentProvider
  translations: {
    title: string
    description: string
    phoneLabel: string
    phoneHelp: string
    submit: string
    cancel: string
    invalidPhone: string
    phoneRequired: string
  }
}

/**
 * Phone collection dialog with E.164 validation and regional pre-fill
 */
export function PhoneCollectionDialog({
  isOpen,
  onClose,
  onPhoneCollected,
  region,
  provider,
  translations
}: PhoneCollectionDialogProps) {
  const [phone, setPhone] = useState(() => {
    // Expert: Pre-fill country code based on region
    const countryCode = getCountryCodeForRegion(region)
    return countryCode
  })
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      // Expert: E.164 validation
      const e164Regex = /^\+[1-9]\d{1,14}$/
      const cleanPhone = phone.trim()
      
      if (!cleanPhone) {
        setError(translations.phoneRequired)
        return
      }
      
      if (!e164Regex.test(cleanPhone)) {
        setError(translations.invalidPhone)
        return
      }

      // Regional validation
      const regionValidation = validatePhoneForRegion(cleanPhone, region)
      if (!regionValidation.valid) {
        setError(regionValidation.error)
        return
      }

      logger.info('Phone number collected', {
        provider,
        region,
        phone_masked: maskPhoneNumber(cleanPhone),
        format: 'E.164'
      }, 'billing')

      // Expert: Store in sessionStorage for MVP (not profile persistence yet)
      sessionStorage.setItem('collected-phone', cleanPhone)
      sessionStorage.setItem('collected-phone-region', region)
      sessionStorage.setItem('collected-phone-provider', provider)

      // Call success handler
      onPhoneCollected(cleanPhone)
      onClose()

    } catch (err) {
      logger.error('Phone collection failed', {
        error: err instanceof Error ? err.message : 'Unknown error',
        provider,
        region
      }, 'billing')
      setError('Failed to save phone number. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setPhone(getCountryCodeForRegion(region)) // Reset to country code
    setError(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="phone" className="h-5 w-5 text-green-500" />
            {translations.title}
          </DialogTitle>
          <DialogDescription>
            {translations.description.replace('{provider}', getProviderDisplayName(provider))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Provider Info Alert */}
          <Alert>
            <Icon name="info" className="h-4 w-4" />
            <AlertDescription>
              <strong>{getProviderDisplayName(provider)}</strong> requires a phone number for payment processing.
              Your number will be used only for this transaction.
            </AlertDescription>
          </Alert>

          {/* Phone Input */}
          <div className="space-y-2">
            <Label htmlFor="phone">{translations.phoneLabel}</Label>
            <Input
              id="phone"
              type="tel"
              placeholder={getPhonePlaceholderForRegion(region)}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setError(null) // Clear error on change
              }}
              className={error ? 'border-red-500' : ''}
              autoComplete="tel"
              // Expert: RTL support - phone numbers always LTR
              dir="ltr"
            />
            <p className="text-sm text-muted-foreground">
              {translations.phoneHelp}
            </p>
            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Regional Guidance */}
          <Alert variant="default">
            <Icon name="map-pin" className="h-4 w-4" />
            <AlertDescription>
              <strong>Region:</strong> {getRegionDisplayName(region)}
              <br />
              <strong>Expected format:</strong> {getCountryCodeForRegion(region)}XXXXXXXXX
            </AlertDescription>
          </Alert>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              {translations.cancel}
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting || !phone.trim()}
            >
              {isSubmitting ? (
                <>
                  <Icon name="loader-2" className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Icon name="check" className="h-4 w-4 mr-2" />
                  {translations.submit}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Get country code for a region
 */
function getCountryCodeForRegion(region: RegionCode): string {
  const countryCodes: Record<RegionCode, string> = {
    us: '+1',
    ca: '+1', 
    gb: '+44',
    eu: '+33', // Default to France
    eg: '+20',
    sa: '+966'
  }
  
  return countryCodes[region] || '+1'
}

/**
 * Get phone placeholder for a region
 */
function getPhonePlaceholderForRegion(region: RegionCode): string {
  const placeholders: Record<RegionCode, string> = {
    us: '+1 555 123 4567',
    ca: '+1 416 123 4567',
    gb: '+44 20 1234 5678', 
    eu: '+33 1 23 45 67 89',
    eg: '+20 10 1234 5678',
    sa: '+966 50 123 4567'
  }
  
  return placeholders[region] || '+1 555 123 4567'
}

/**
 * Validate phone number for specific region
 */
function validatePhoneForRegion(phone: string, region: RegionCode): { valid: boolean; error?: string } {
  const countryCode = getCountryCodeForRegion(region)
  
  if (!phone.startsWith(countryCode)) {
    return {
      valid: false,
      error: `Phone number must start with ${countryCode} for ${getRegionDisplayName(region)}`
    }
  }
  
  // Region-specific length validation
  const regionValidations: Record<RegionCode, { minLength: number; maxLength: number }> = {
    us: { minLength: 12, maxLength: 12 }, // +1XXXXXXXXXX
    ca: { minLength: 12, maxLength: 12 },
    gb: { minLength: 13, maxLength: 15 }, // +44XXXXXXXXXX to +44XXXXXXXXXXXXX
    eu: { minLength: 12, maxLength: 15 },
    eg: { minLength: 13, maxLength: 14 }, // +20XXXXXXXXXX to +20XXXXXXXXXXXX
    sa: { minLength: 13, maxLength: 13 }  // +966XXXXXXXXX
  }
  
  const validation = regionValidations[region]
  if (phone.length < validation.minLength || phone.length > validation.maxLength) {
    return {
      valid: false,
      error: `Invalid phone length for ${getRegionDisplayName(region)}`
    }
  }
  
  return { valid: true }
}

/**
 * Get display name for region
 */
function getRegionDisplayName(region: RegionCode): string {
  const regionNames: Record<RegionCode, string> = {
    us: 'United States',
    ca: 'Canada',
    gb: 'United Kingdom', 
    eu: 'Europe',
    eg: 'Egypt',
    sa: 'Saudi Arabia'
  }
  
  return regionNames[region] || region.toUpperCase()
}

/**
 * Get display name for payment provider
 */
function getProviderDisplayName(provider: PaymentProvider): string {
  const providerNames: Record<PaymentProvider, string> = {
    fawry: 'Fawry',
    paymob: 'Paymob',
    stcpay: 'STC Pay',
    paytabs: 'PayTabs',
    stripe: 'Stripe'
  }
  
  return providerNames[provider]
}