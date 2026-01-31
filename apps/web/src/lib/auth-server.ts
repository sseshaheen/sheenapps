/**
 * Server-side Authentication Utilities
 * Following Supabase best practices for server-side auth
 */

import { createServerSupabaseClientReadOnly } from '@/lib/supabase-server'
import { unstable_noStore as noStore } from 'next/cache'
import { createAppUser, type User } from '@/types/auth'
import { logger } from '@/utils/logger'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isGuest: boolean
}

/**
 * Get current user auth state server-side
 * This should be called from server components and server actions
 * Never from client components
 */
export async function getServerAuthState(): Promise<AuthState> {
  noStore() // avoid stale RSC caching
  
  try {
    // EXPERT FIX: Use read-only client to prevent cookie mutation errors in RSC
    const supabase = await createServerSupabaseClientReadOnly()
    
    // Use getUser() for secure server-side auth validation
    // This validates the token with Supabase Auth server
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      logger.error('Server auth error:', error)
      return {
        user: null,
        isAuthenticated: false,
        isGuest: true
      }
    }
    
    if (!user) {
      return {
        user: null,
        isAuthenticated: false,
        isGuest: true
      }
    }
    
    // Convert to app user format
    const appUser = createAppUser(user)
    
    return {
      user: appUser,
      isAuthenticated: true,
      isGuest: false
    }
    
  } catch (error) {
    logger.error('Failed to get server auth state:', error)
    return {
      user: null,
      isAuthenticated: false,
      isGuest: true
    }
  }
}

/**
 * Check if user is authenticated server-side
 * Simpler version that just returns boolean
 */
export async function isAuthenticated(): Promise<boolean> {
  const { isAuthenticated } = await getServerAuthState()
  return isAuthenticated
}

/**
 * Get current user server-side
 * Returns null if not authenticated
 */
export async function getCurrentUser(): Promise<User | null> {
  const { user } = await getServerAuthState()
  return user
}

/**
 * Require authentication server-side
 * Throws error if not authenticated - use in server actions
 */
export async function requireAuth(): Promise<User> {
  const { user, isAuthenticated } = await getServerAuthState()
  
  if (!isAuthenticated || !user) {
    throw new Error('Authentication required')
  }
  
  return user
}