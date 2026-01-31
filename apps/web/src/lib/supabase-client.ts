/**
 * Conditional Supabase client wrapper
 * Prevents any client creation when server auth is enabled
 */

import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

// 🌐 Conditional client-side instance for browser
export const createClient = () => {
  if (FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
    console.warn('⚠️ Server auth is enabled - Supabase client creation blocked')
    // Return a dummy client that does nothing
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        setSession: async () => ({ data: null, error: null }),
        signOut: async () => ({ error: null }),
        signInWithPassword: async () => ({ data: null, error: new Error('Use server actions') }),
        refreshSession: async () => ({ data: null, error: new Error('Use server actions') })
      }
    } as any
  }

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}