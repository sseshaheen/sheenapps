/**
 * Referral Tracking Hook
 * Handles referral code detection, storage, and URL cleanup for SEO
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store'
import { ReferralService } from '@/services/referral-service'
import { toast } from 'sonner'

interface ReferralTrackingOptions {
  /** Whether to show user feedback toasts */
  showToasts?: boolean
  /** Whether to track clicks (set false for authenticated pages) */
  trackClicks?: boolean
}

export function useReferralTracking(options: ReferralTrackingOptions = {}) {
  const { showToasts = true, trackClicks = true } = options
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isAuthenticated } = useAuthStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)

  useEffect(() => {
    const handleReferralTracking = async () => {
      if (isProcessing) return
      
      // Extract referral code from URL (accepts ref, r, referrer)
      const urlReferralCode = ReferralService.extractReferralCode(searchParams)
      
      if (!urlReferralCode) return
      
      setIsProcessing(true)
      setReferralCode(urlReferralCode)

      try {
        // ✅ SELF-REFERRAL PROTECTION: Check if user is trying to refer themselves
        if (isAuthenticated && user) {
          // Get user's partner status to check their partner code
          try {
            const dashboard = await ReferralService.getPartnerDashboard(user.id)
            if (dashboard.partner.partner_code === urlReferralCode) {
              if (showToasts) {
                toast.error('You can\'t refer yourself! 😅')
              }
              // Clean URL without storing referral
              cleanUrlParams()
              return
            }
          } catch {
            // User doesn't have partner account, continue with referral tracking
          }
        }

        // Store referral code for attribution
        ReferralService.storeReferralCode(urlReferralCode)
        
        // Track click if enabled and we have necessary data
        if (trackClicks) {
          try {
            const ip = await ReferralService.getUserIP()
            await ReferralService.trackReferralClick({
              partner_code: urlReferralCode,
              ip_address: ip,
              user_agent: navigator.userAgent
            })
          } catch (error) {
            console.warn('Failed to track referral click:', error)
            // Non-blocking - continue with normal flow
          }
        }
        
        // Show success feedback
        if (showToasts && !isAuthenticated) {
          toast.success('🎉 You\'ve been referred by a SheenApps Friend! Get started and they\'ll earn commission when you subscribe.')
        }

      } catch (error) {
        console.warn('Referral tracking error:', error)
        // Non-blocking - don't interrupt user experience
      } finally {
        // ✅ CLEAN URL FOR SEO: Remove ref parameter after processing
        cleanUrlParams()
        setIsProcessing(false)
      }
    }

    // Clean URL parameters and preserve attribution
    const cleanUrlParams = () => {
      const currentUrl = new URL(window.location.href)
      const hasReferralParams = currentUrl.searchParams.has('ref') || 
                               currentUrl.searchParams.has('r') || 
                               currentUrl.searchParams.has('referrer')
      
      if (hasReferralParams) {
        // Remove referral parameters
        currentUrl.searchParams.delete('ref')
        currentUrl.searchParams.delete('r') 
        currentUrl.searchParams.delete('referrer')
        
        // Update URL without reload
        const cleanUrl = currentUrl.pathname + (currentUrl.search || '')
        router.replace(cleanUrl, { scroll: false })
      }
    }

    handleReferralTracking()
  }, [searchParams, isAuthenticated, user, router, isProcessing, showToasts, trackClicks])

  return {
    referralCode,
    isProcessing,
    hasReferralCode: !!referralCode
  }
}

/**
 * Hook for canonical URL generation (SEO optimization)
 */
export function useReferralCanonicalUrl() {
  const searchParams = useSearchParams()
  
  const canonicalUrl = (() => {
    if (typeof window === 'undefined') return null
    
    const url = new URL(window.location.href)
    
    // Remove referral parameters for canonical URL
    url.searchParams.delete('ref')
    url.searchParams.delete('r')
    url.searchParams.delete('referrer')
    
    return url.href
  })()
  
  return canonicalUrl
}

/**
 * Hook for referral banner display
 */
export function useReferralBanner() {
  const searchParams = useSearchParams()
  const [showBanner, setShowBanner] = useState(false)
  
  useEffect(() => {
    const hasReferralCode = ReferralService.extractReferralCode(searchParams)
    setShowBanner(!!hasReferralCode)
    
    // Hide banner after 10 seconds
    if (hasReferralCode) {
      const timer = setTimeout(() => setShowBanner(false), 10000)
      return () => clearTimeout(timer)
    }
  }, [searchParams])
  
  return { showBanner, hideBanner: () => setShowBanner(false) }
}