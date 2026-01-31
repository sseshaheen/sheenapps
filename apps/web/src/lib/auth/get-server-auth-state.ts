/**
 * 🔐 Central Server Auth State Bootstrap
 * 
 * EXPERT PATTERN: Non-cacheable auth state query safe for RSC
 * - Uses read-only client to prevent cookie mutation errors
 * - Includes noStore() to avoid stale RSC caching
 * - Used by pages/layouts for server-side auth bootstrap
 */

import 'server-only'
import { unstable_noStore as noStore } from 'next/cache'
import { createServerSupabaseClientReadOnly } from '@/lib/supabase-server'

export interface ServerAuthState {
  isAuthenticated: boolean
  user: {
    id: string
    email: string
  } | null
  error?: string
}

/**
 * Get current auth state for server-side bootstrap
 * EXPERT FIX: Avoids cache issues and cookie mutation errors
 */
export async function getServerAuthState(): Promise<ServerAuthState> {
  noStore() // avoid stale RSC caching

  try {
    const supabase = await createServerSupabaseClientReadOnly()
    const { data: { user }, error } = await supabase.auth.getUser()

    return {
      isAuthenticated: !!user && !error,
      user: user ? { id: user.id, email: user.email } : null,
      error: error?.message,
    }
  } catch (err) {
    console.error('🚨 Server auth state error:', err)
    return {
      isAuthenticated: false,
      user: null,
      error: err instanceof Error ? err.message : 'Authentication error'
    }
  }
}