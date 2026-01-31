// EXPERT SOLUTION: Standardized sign-out route with header-based cookie adapter
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { RequestCookies, ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import type { Database } from '@/types/supabase'

// EXPERT FIX: Force dynamic execution and Node runtime for auth operations
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

export async function POST(req: Request) {
  const reqHeaders = new Headers(req.headers)
  const resHeaders = new Headers()

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => new RequestCookies(reqHeaders).getAll(),
      setAll: (cookies) => {
        const rc = new ResponseCookies(resHeaders)
        for (const { name, value, options } of cookies) {
          // EXPERT FIX: Ensure auth cookies are HttpOnly for security and persistence
          const secureOptions = name.startsWith('sb-') ? {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const
          } : options
          rc.set(name, value, secureOptions)
        }
      }
    }
  })

  await supabase.auth.signOut()

  const url = new URL(`/${(new URL(req.url).pathname.split('/')[1] || 'en')}`, req.url)
  const res = NextResponse.redirect(url, { status: 303 })

  for (const [k, v] of resHeaders) res.headers.append(k, v)
  return res
}