/**
 * Advisor Application State Machine
 * Implements the expert-recommended state-based routing for advisor UX
 */

import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { AdvisorServerAPIService, type AdvisorProfile } from '@/services/advisor-server-api'
import { logger } from '@/utils/logger'

export type AdvisorApplicationState =
  | 'ANON'                           // Not logged in
  | 'NO_APPLICATION'                 // Logged in, no application
  | 'DRAFT'                         // Application started but not submitted
  | 'SUBMITTED'                     // Application submitted, awaiting review
  | 'UNDER_REVIEW'                  // Admin is reviewing application
  | 'APPROVED_PENDING_ONBOARDING'   // Approved but onboarding incomplete
  | 'LIVE'                          // Fully active advisor
  | 'REJECTED_COOLDOWN'             // Rejected, cooldown period active

export const advisorRoutes = {
  public: '/[locale]/advisor',
  apply: '/[locale]/advisor/apply',
  status: '/[locale]/advisor/application-status',
  onboarding: '/[locale]/advisor/dashboard/onboarding', 
  dashboard: '/[locale]/advisor/dashboard',
} as const

export interface AdvisorStateInfo {
  state: AdvisorApplicationState
  redirectTo?: string
  advisorData?: any
  metadata?: {
    applicationSubmittedAt?: string
    rejectionReason?: string
    reapplicationAllowedAt?: string
    onboardingProgress?: {
      stripeConnected: boolean
      calcomConnected: boolean
      profileComplete: boolean
    }
  }
}

/**
 * Determine the current advisor application state for a user
 * This is the core state machine that drives routing decisions
 * @param userId User ID (optional for anonymous users)
 * @param locale Locale for API calls (will auto-detect from server context if not provided)
 */
export async function getAdvisorState(userId?: string, locale?: string): Promise<AdvisorStateInfo> {
  'use server'
  // Anonymous users
  if (!userId) {
    return { 
      state: 'ANON',
      redirectTo: undefined // Show public landing
    }
  }

  try {
    logger.debug('advisor-state', 'Determining advisor state', { userId: userId.slice(0, 8) })
    
    // Try to get advisor profile from the backend API
    try {
      const advisor = await AdvisorServerAPIService.getProfile(userId, locale)
      
      if (advisor) {
        // User has advisor record, determine state based on status
        switch (advisor.approval_status) {
          case 'pending':
            return { 
              state: 'SUBMITTED',
              advisorData: advisor,
              metadata: { applicationSubmittedAt: advisor.created_at }
            }
          
          case 'under_review': 
            return {
              state: 'UNDER_REVIEW',
              advisorData: advisor
            }
          
          case 'approved':
            // Check onboarding completion
            const onboardingComplete = advisor.onboarding_steps?.admin_approved === true
            if (!onboardingComplete) {
              return {
                state: 'APPROVED_PENDING_ONBOARDING',
                advisorData: advisor,
                metadata: {
                  onboardingProgress: {
                    stripeConnected: advisor.onboarding_steps?.stripe_connected || false,
                    calcomConnected: advisor.onboarding_steps?.cal_connected || false,
                    profileComplete: advisor.onboarding_steps?.profile_completed || false
                  }
                }
              }
            }
            
            return {
              state: 'LIVE',
              advisorData: advisor
            }
          
          case 'rejected':
            const now = new Date()
            // Note: reapplication logic not yet implemented in backend
            const reapplyDate: Date | null = null
            
            if (reapplyDate && now < reapplyDate) {
              return {
                state: 'REJECTED_COOLDOWN',
                advisorData: advisor,
                metadata: {
                  rejectionReason: 'Rejection reason not available',
                  reapplicationAllowedAt: undefined
                }
              }
            }
            
            // Cooldown over, can reapply
            return { state: 'NO_APPLICATION' }
          
          default:
            logger.warn('Unknown advisor approval status:', advisor.approval_status)
            return { state: 'NO_APPLICATION' }
        }
      }
    } catch (error) {
      // Profile not found or API error - check for draft application
      if (error instanceof Error && error.message.includes('not found')) {
        try {
          const draft = await AdvisorServerAPIService.getDraft(userId, locale)
          if (draft && Object.keys(draft).length > 0) {
            return { 
              state: 'DRAFT', 
              advisorData: draft,
              metadata: { applicationSubmittedAt: draft.updated_at }
            }
          }
        } catch (draftError) {
          // No draft found either
          logger.debug('advisor-state', 'No draft application found', { userId: userId.slice(0, 8) })
        }
        
        // No advisor profile and no draft - user can apply
        return { state: 'NO_APPLICATION' }
      }
      
      // Other API errors - log but don't fail
      logger.error('Error checking advisor profile:', error)
      return { state: 'NO_APPLICATION' }
    }
    
    // Fallback
    return {
      state: 'NO_APPLICATION',
      redirectTo: undefined
    }
    
    
  } catch (error) {
    logger.error('Error determining advisor state:', error)
    return { state: 'NO_APPLICATION' }
  }
}

/**
 * Get the appropriate redirect URL based on advisor state and current path
 */
export function getAdvisorRedirect(
  state: AdvisorApplicationState, 
  currentPath: string,
  locale: string
): string | null {
  const routes = {
    public: `/${locale}/advisor`,
    apply: `/${locale}/advisor/apply`,
    status: `/${locale}/advisor/application-status`,
    onboarding: `/${locale}/advisor/dashboard/onboarding`,
    dashboard: `/${locale}/advisor/dashboard`,
  }
  
  // Route guard logic from expert feedback
  switch (state) {
    case 'ANON':
      // Anonymous users should see public landing unless they're trying to access protected pages
      if (currentPath.includes('/apply') || currentPath.includes('/dashboard') || currentPath.includes('/status')) {
        return routes.public
      }
      return null
    
    case 'NO_APPLICATION':
    case 'DRAFT':
      // Users without applications should see apply page if they're trying to access dashboard/status
      if (currentPath.includes('/dashboard') || currentPath.includes('/status') || currentPath.includes('/onboarding')) {
        return routes.apply
      }
      return null
    
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      // Users with pending applications should see status page
      if (currentPath.includes('/apply') || currentPath.includes('/dashboard') || currentPath.includes('/onboarding')) {
        return routes.status
      }
      return null
    
    case 'APPROVED_PENDING_ONBOARDING':
      // Approved users should complete onboarding
      if (currentPath.includes('/apply') || currentPath.includes('/status')) {
        return routes.onboarding
      }
      // Only redirect to onboarding if on dashboard (but not already on onboarding)
      if (currentPath.includes('/dashboard') && !currentPath.includes('/onboarding')) {
        return routes.onboarding
      }
      return null
    
    case 'LIVE':
      // Active advisors should see dashboard
      if (currentPath.includes('/apply') || currentPath.includes('/status') || currentPath.includes('/onboarding')) {
        return routes.dashboard
      }
      return null
    
    case 'REJECTED_COOLDOWN':
      // Rejected users should see status with reapply info
      if (currentPath.includes('/apply') || currentPath.includes('/dashboard') || currentPath.includes('/onboarding')) {
        return routes.status
      }
      return null
    
    default:
      return null
  }
}

/**
 * Helper to get current user ID from server-side auth
 */
export async function getCurrentUserId(): Promise<string | null> {
  'use server'
  try {
    logger.info('🔧 getCurrentUserId() called - creating Supabase server client')
    const supabase = await createServerSupabaseClientNew()
    
    logger.info('🔐 Calling supabase.auth.getUser() from getCurrentUserId()')
    const { data: { user }, error } = await supabase.auth.getUser()
    
    logger.info('✅ getCurrentUserId() getUser() completed', {
      hasUser: !!user,
      userId: user?.id,
      hasError: !!error,
      errorMessage: error?.message
    })
    
    if (error || !user) {
      logger.warn('⚠️ getCurrentUserId() returning null', {
        hasUser: !!user,
        hasError: !!error,
        errorMessage: error?.message
      })
      return null
    }
    
    logger.info('✅ getCurrentUserId() returning user ID', {
      userId: user.id,
      userEmail: user.email
    })
    return user.id
  } catch (error) {
    logger.error('❌ getCurrentUserId() failed with exception:', error)
    return null
  }
}