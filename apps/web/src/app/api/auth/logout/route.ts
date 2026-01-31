import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'
import { cookies } from 'next/headers'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

async function clearAllAuthCookies(response?: NextResponse) {
  const cookieStore = await cookies()
  
  // EXPERT FIX: Only clear app-specific cookies - let Supabase manage auth tokens
  // Manual sb-*-auth-token management causes "refresh churn and random logouts"
  const authCookies = [
    'app-has-auth'
  ]
  
  authCookies.forEach(cookieName => {
    // Set cookie with Max-Age=0 to delete it
    if (response) {
      response.cookies.set(cookieName, '', {
        httpOnly: false, // app-has-auth is client-readable
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0 // This tells the browser to delete the cookie
      })
    } else {
      // Fallback using cookieStore
      cookieStore.set(cookieName, '', {
        httpOnly: false, // app-has-auth is client-readable
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0
      })
    }
  })
  
  // EXPERT FIX: Don't manually clear Supabase cookies
  // Supabase auth.signOut() will handle clearing auth tokens properly
  // Manual cookie clearing causes "refresh churn and random logouts"
}

export async function POST(request: NextRequest) {
  try {
    // Create response object first
    const response = NextResponse.json(
      { success: true },
      { status: 200 }
    )
    
    // Add Clear-Site-Data header for browsers that support it
    response.headers.set('Clear-Site-Data', '"cookies"')
    
    // If using server auth, just clear cookies
    if (FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
      logger.info('🔐 Server auth logout - clearing cookies')
      await clearAllAuthCookies(response)
      
      return response
    }
    
    // Otherwise, use Supabase signOut
    const supabase = await createServerSupabaseClientNew()
    
    // Try to get current user for logging
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id
    
    // Sign out from Supabase
    const { error: signOutError } = await supabase.auth.signOut()
    
    if (signOutError) {
      logger.error('Supabase sign out error:', signOutError)
    }
    
    // Clear all cookies regardless
    await clearAllAuthCookies(response)
    
    logger.info('User signed out successfully:', { userId })
    
    return response
    
  } catch (error) {
    logger.error('Logout endpoint error:', error)
    
    // Create error response
    const errorResponse = NextResponse.json(
      { success: true }, // Always return success to ensure user is logged out
      { status: 200 }
    )
    
    // Even on error, clear cookies
    await clearAllAuthCookies(errorResponse)
    
    return errorResponse
  }
}