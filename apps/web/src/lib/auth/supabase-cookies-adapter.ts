// Reusable SSR cookie adapter for Supabase route handlers
import { cookies } from 'next/headers'
import type { CookieOptions } from '@supabase/ssr'

export async function createCookiesAdapter() {
  const cookieStore = await cookies()
  
  return {
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) => {
      for (const { name, value, options } of cookiesToSet) {
        // Let Supabase SSR client set proper HttpOnly, SameSite=Lax, etc.
        cookieStore.set(name, value, options)
      }
    },
  }
}