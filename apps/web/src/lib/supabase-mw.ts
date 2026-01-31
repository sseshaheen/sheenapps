/**
 * 🔐 Edge-Safe Supabase Middleware Client
 * 
 * EXPERT REQUIREMENT: Pure setAll/getAll implementation
 * - No custom cookie options (httpOnly, secure, sameSite, maxAge)
 * - Let Supabase manage all cookie attributes to prevent attribute loss
 * - Edge runtime compatible (no 'server-only' imports)
 */

import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

/**
 * Create middleware-safe Supabase client
 * CRITICAL: Uses pure setAll/getAll without overriding cookie options
 */
export function createMiddlewareClient(req: NextRequest, res: NextResponse) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) {
          // EXPERT FIX: Don't override Supabase's cookie options
          // Let Supabase decide httpOnly, secure, sameSite, maxAge
          res.cookies.set(name, value, options)
        }
      },
    },
  })
}