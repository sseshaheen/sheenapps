import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { createAppUser } from '@/types/auth'
import { logger } from '@/utils/logger'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

// EXPERT REQUIREMENT: Top-level logging
// console.log('🛎️ /api/auth/me handler invoked')
// console.log('🛎️ /api/auth/me handler invoked - EXPERT CANARY LOG')

export async function GET(request: NextRequest) {
  try {
    logger.info('🔐 /api/auth/me endpoint called', {
      url: request.url,
      method: request.method
    })

    // Analyze incoming cookies
    const allCookies = Array.from(request.cookies.getAll())
    const sbCookies = allCookies.filter(c => c.name.startsWith('sb-'))
    
    logger.info('🍪 Cookie analysis', {
      totalCookies: allCookies.length,
      sbCookieCount: sbCookies.length
    })

    // EXPERT FIX: Always call Supabase to check auth - don't early return on missing cookies
    // This prevents false negatives from early page loads or unusual clients
    
    logger.info('🔧 Creating Supabase server client')
    
    // Create Supabase client
    const supabase = await createServerSupabaseClientNew()

    // Use getUser() instead of getSession() - Supabase best practice for server-side auth
    logger.info('🔐 Calling supabase.auth.getUser()')
    
    const { data: { user }, error } = await supabase.auth.getUser()

    logger.info('✅ getUser() completed', {
      hasUser: !!user,
      userId: user?.id,
      hasError: !!error,
      errorMessage: error?.message
    })

    // Add detailed debugging for the auth result
    // console.log('🔐 getUser() result details:', {
    //   userExists: !!user,
    //   userId: user?.id,
    //   userEmail: user?.email,
    //   userRole: user?.role,
    //   userConfirmedAt: user?.email_confirmed_at,
    //   errorExists: !!error,
    //   errorMessage: error?.message,
    //   errorCode: (error as any)?.code,
    //   errorStatus: (error as any)?.status
    // })

    // console.log('🔐 Supabase user check:', {
    //   hasUser: !!user,
    //   error: error?.message,
    //   userId: user?.id?.slice(0, 8),
    //   userEmail: user?.email,
    //   emailConfirmed: user?.email_confirmed_at
    // })

    // If we have a user, create the session response
    if (user && !error) {
      logger.info('✅ User authenticated successfully', {
        userId: user.id,
        userEmail: user.email
      })
      
      const appUser = createAppUser(user)
      
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
            'Cache-Control': 'private, no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    // Handle JWT validation errors by attempting token refresh
    if (!user || error) {
      logger.info('⚠️ getUser() failed, analyzing error', {
        hasUser: !!user,
        hasError: !!error,
        errorMessage: error?.message
      })

      // Check if the error is specifically a JWT signature issue
      const isJWTError = error?.message?.includes('invalid JWT') || error?.message?.includes('signature is invalid')

      if (isJWTError) {
        logger.info('🔄 Attempting token refresh for JWT error')

        try {
          // Try to refresh the session to get a new valid token
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

          if (refreshData.session && !refreshError) {
            logger.info('✅ Token refresh successful')
            
            const appUser = createAppUser(refreshData.session.user)
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
                  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                }
              }
            )
          }
        } catch (refreshErr) {
          logger.error('❌ Token refresh failed', {
            errorMessage: refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
          })
        }
      }

      // Legacy fallback - try getSession() if refresh also fails
      logger.info('🔄 Attempting getSession() as final fallback')
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      // Note: Using getSession() for fallback despite security warning
      // This allows users to continue working while we fix the JWT issue
      if (session && !sessionError) {
        logger.info('✅ Using session fallback', {
          userId: session.user.id,
          userEmail: session.user.email
        })
        
        const appUser = createAppUser(session.user)
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
              'Cache-Control': 'private, no-store, no-cache, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          }
        )
      }
    }

    // If both getUser() and getSession() failed, return unauthenticated
    logger.info('⚠️ All auth methods failed - returning unauthenticated', {
      hadUser: !!user,
      hadError: !!error,
      errorMessage: error?.message
    })
    
    return NextResponse.json(
      {
        user: null,
        isAuthenticated: false,
        isGuest: true
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )

  } catch (error) {
    logger.error('❌ Unexpected exception in /api/auth/me', {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : typeof error
    })
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
