/**
 * 🛡️ Server-Only Supabase Client Module
 * 
 * CRITICAL: This module contains 'server-only' directive
 * - Can ONLY be imported by server-side code (API routes, server actions, RSC)
 * - NEVER import from client components (will cause build errors)
 * - Use @/lib/supabase-client for client-side needs
 * 
 * Expert-validated patterns with clean getAll/setAll cookie adapters
 */

import 'server-only'
import { type Database } from '@/types/supabase'
import { createServerClient } from '@supabase/ssr'

// Server-only environment variables (no NEXT_PUBLIC_ prefix)
const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

/**
 * 🖥️ Server-side instance for API routes and server actions
 * Allows cookie modification with clean getAll/setAll pattern
 */
export const createServerSupabaseClientNew = async () => {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies() // ✅ Next.js 15: cookies() is async

    return createServerClient<Database>(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          },
        }
      }
    )
  } catch (error) {
    console.error('🚨 Failed to create Supabase server client:', error)
    throw error
  }
}

/**
 * 📖 Read-only server-side instance for server components (RSC)
 * EXPERT FIX: Uses per-cookie APIs that @supabase/ssr expects
 * Use for auth state reads in pages/layouts, never for mutations
 */
export const createServerSupabaseClientReadOnly = async () => {
  try {
    const { cookies } = await import('next/headers')
    const store = await cookies() // ✅ Next.js 15: cookies() is async

    return createServerClient<Database>(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        cookies: {
          get: (name: string) => store.get(name)?.value,
          set: () => {},     // read-only in RSC
          remove: () => {},  // read-only in RSC
        }
      }
    )
  } catch (error) {
    console.error('🚨 Failed to create read-only Supabase client:', error)
    throw error
  }
}

/**
 * 🛡️ Middleware client moved to separate edge-safe module
 * Use: import { createMiddlewareClient } from '@/lib/supabase-mw'
 */

/**
 * ❌ Legacy adapter removal
 * Use createServerSupabaseClientNew() with getAll/setAll pattern instead
 */
export const createServerSupabaseClient = () => {
  throw new Error('Use createServerSupabaseClientNew() (getAll/setAll). Legacy adapter is disabled.')
}