/**
 * Referral Attribution Hook
 * Tracks referral attribution after successful user signup/login
 */

'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store'
import { ReferralService } from '@/services/referral-service'
import { toast } from 'sonner'

export function useReferralAttribution() {
  const { user, isAuthenticated } = useAuthStore()
  const attributionAttempted = useRef<string | null>(null)

  useEffect(() => {
    const trackAttribution = async () => {
      // Only track for authenticated users who we haven't attempted attribution for
      if (!isAuthenticated || !user || attributionAttempted.current === user.id) {
        return
      }

      // Check if we have a stored referral code
      const referralCode = ReferralService.getStoredReferralCode()
      if (!referralCode) {
        return
      }

      // Mark this user as attempted (prevent duplicate tracking)
      attributionAttempted.current = user.id

      try {
        // Get user IP and build attribution data
        const ip = await ReferralService.getUserIP()
        const urlParams = new URLSearchParams(window.location.search)
        
        const attributionData = {
          partner_code: referralCode,
          attribution_method: 'cookie' as const,
          utm_source: urlParams.get('utm_source') || undefined,
          utm_medium: urlParams.get('utm_medium') || undefined,
          utm_campaign: urlParams.get('utm_campaign') || undefined,
          ip_address: ip,
          user_agent: navigator.userAgent
        }

        console.log('🎯 Tracking referral attribution:', {
          userId: user.id.slice(0, 8) + '...',
          referralCode,
          utms: {
            source: attributionData.utm_source,
            medium: attributionData.utm_medium,
            campaign: attributionData.utm_campaign
          }
        })

        const result = await ReferralService.trackReferralSignup(attributionData)
        
        if (result.success) {
          console.log('✅ Referral attribution successful:', {
            referralId: result.referral_id,
            fraudCheck: result.fraud_check
          })

          // Show success feedback if not flagged for fraud
          if (result.fraud_check !== 'flagged') {
            toast.success('🎉 Welcome! Your referrer will earn commission from your subscription.')
          }

          // Clear stored referral code after successful attribution
          ReferralService.clearStoredReferralCode()
        }
      } catch (error: any) {
        console.warn('⚠️ Referral attribution failed:', error.message || error)
        
        // Don't show error toasts for attribution failures - this is non-critical
        // The signup should still succeed even if attribution fails
        
        // Clear stored code anyway to prevent retry loops
        ReferralService.clearStoredReferralCode()
      }
    }

    trackAttribution()
  }, [user, isAuthenticated])
}

/**
 * Attribution hook for specific pages where we want immediate tracking
 * Use this on pages that are visited after successful signup/login
 */
export function useImmediateReferralAttribution() {
  useReferralAttribution()
}

/**
 * Hook to check if current user was referred
 * Useful for showing special onboarding content to referred users
 */
export function useIsReferredUser(): boolean {
  const { user } = useAuthStore()
  
  // Check if user has referral code stored (not yet attributed)
  const hasStoredCode = !!ReferralService.getStoredReferralCode()
  
  // In a real implementation, you might also check if the user
  // was previously attributed by checking a user profile flag
  
  return hasStoredCode
}