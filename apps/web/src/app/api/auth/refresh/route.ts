import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'
import { createAppUser } from '@/types/auth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// EXPERT FIX: Let Supabase handle auth cookies automatically
// Manual sb-*-auth-token management causes "refresh churn and random logouts"
async function clearAuthCookies() {
  const cookieStore = await cookies()
  // Only clear app-specific cookies - let Supabase manage its own auth tokens
  cookieStore.delete('app-has-auth')
}

export async function POST(request: NextRequest) {
  try {
    // EXPERT FIX: Don't check specific auth token cookies - let Supabase handle this
    // The createServerSupabaseClientNew() will automatically handle auth token validation
    
    // Create Supabase client and let it handle auth token validation automatically
    const supabase = await createServerSupabaseClientNew()
    
    // Attempt to refresh session (single attempt only)
    const { data, error } = await supabase.auth.refreshSession()
    
    if (error || !data.session) {
      logger.error('Session refresh failed:', error)
      
      // Clear cookies on refresh failure
      await clearAuthCookies()
      
      // Check if it's an invalid refresh token error
      if (error?.message?.includes('refresh_token') || error?.status === 400) {
        return NextResponse.json(
          { 
            error: { 
              code: 'UNAUTHORIZED', 
              status: 401, 
              message: 'Invalid refresh token. Please sign in again.' 
            } 
          },
          { status: 401 }
        )
      }
      
      return NextResponse.json(
        { 
          error: { 
            code: 'UNAUTHORIZED', 
            status: 401, 
            message: 'Session refresh failed. Please sign in again.' 
          } 
        },
        { status: 401 }
      )
    }
    
    // Refresh successful - create app user
    const appUser = createAppUser(data.user)
    
    // Set app-specific cookie to indicate auth status
    const cookieStore = await cookies()
    cookieStore.set('app-has-auth', 'true', {
      httpOnly: false, // Allow client to check existence
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    })
    
    logger.info('Session refreshed successfully for user:', appUser.id)
    
    return NextResponse.json(
      { 
        user: appUser,
        isAuthenticated: true,
        isGuest: false,
        sessionLimits: {
          maxGenerations: -1,
          maxChatMessages: -1,
          canExport: true,
          canShare: true,
          maxProjects: -1,
          canSaveProjects: true
        }
      },
      { 
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache'
        }
      }
    )
    
  } catch (error) {
    logger.error('Auth refresh endpoint error:', error)
    
    // Clear cookies on any error
    await clearAuthCookies()
    
    return NextResponse.json(
      { 
        error: { 
          code: 'SERVER_ERROR', 
          status: 500, 
          message: 'Internal server error' 
        } 
      },
      { status: 500 }
    )
  }
}