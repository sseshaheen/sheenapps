/**
 * Server Auth Snapshot Utility
 * Expert-Validated RSC-Only Function for Synchronous Bootstrap
 * 
 * Purpose: Extract server-side auth state for synchronous client bootstrap
 * This eliminates the 39ms hydration race condition by providing immediate auth state
 */

import 'server-only' // Ensure this only runs server-side
import { unstable_noStore as noStore } from 'next/cache'
import { createServerSupabaseClientReadOnly } from '@/lib/supabase-server'
import { getSessionLimits } from '@/types/auth'
import type { ServerAuthSnapshot } from '@/store/auth-store-new'
import { logger } from '@/utils/logger'
import { headers } from 'next/headers'

/**
 * RSC-only function to get auth state snapshot for synchronous client bootstrap
 * This prevents the hydration race condition by providing the client with immediate auth state
 */
export async function getServerAuthSnapshot(): Promise<ServerAuthSnapshot> {
  noStore() // avoid stale RSC caching
  
  try {
    logger.info('🔐 Getting server auth snapshot for synchronous bootstrap')
    
    // EXPERT FIX: Use read-only client to prevent cookie mutation errors in RSC
    const supabase = await createServerSupabaseClientReadOnly()
    const { data, error } = await supabase.auth.getUser()
    
    // console.log('🔐 Server auth getUser result:', { 
    //   hasUser: !!data?.user, 
    //   hasError: !!error,
    //   errorMessage: error?.message
    // })
    
    if (error) {
      // This is normal for anonymous users - no logging needed
      return {
        user: null,
        status: 'anonymous',
        isSettled: true,
        sessionLimits: getSessionLimits(null)
      }
    }
    
    if (!data?.user) {
      // This is normal for anonymous users - no logging needed
      return {
        user: null,
        status: 'anonymous', 
        isSettled: true,
        sessionLimits: getSessionLimits(null)
      }
    }
    
    // User found - use the full user object for session limits
    const sessionLimits = getSessionLimits(data.user)
    
    // Extract minimal user data for client
    const user = {
      id: data.user.id,
      email: data.user.email,
      email_confirmed_at: data.user.email_confirmed_at,
      created_at: data.user.created_at,
      updated_at: data.user.updated_at,
      // Add minimal required fields for compatibility
      app_metadata: data.user.app_metadata || {},
      user_metadata: data.user.user_metadata || {},
      aud: data.user.aud || 'authenticated'
    }
    
    logger.info('🔐 Server auth snapshot: User authenticated', {
      userId: user.id.slice(0, 8),
      email: user.email,
      hasSessionLimits: !!sessionLimits
    })
    
    return {
      user,
      status: 'authenticated',
      isSettled: true,
      sessionLimits
    }
  } catch (error) {
    // On error, assume anonymous for safety - no logging needed for this common case
    
    // On error, assume anonymous for safety
    return {
      user: null,
      status: 'anonymous',
      isSettled: true,
      sessionLimits: getSessionLimits(null)
    }
  }
}