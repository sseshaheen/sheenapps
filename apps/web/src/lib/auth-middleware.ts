/**
 * 🛡️ API Authentication Middleware
 * Enterprise-grade API route protection with comprehensive error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import type { User } from '@supabase/auth-js'
import { logger } from '@/utils/logger';

// 📊 Authentication result types
export interface AuthResult {
  success: boolean
  user: User | null
  error?: {
    code: string
    message: string
    status: number
  }
}

// 🎯 Rate limiting configuration
interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  keyGenerator?: (req: NextRequest) => string // Custom key generator
}

// 🚀 Enhanced API middleware with optional features
export interface ApiMiddlewareOptions {
  requireAuth?: boolean
  rateLimit?: RateLimitConfig
  allowedRoles?: string[]
  requireEmailVerified?: boolean
  customValidation?: (user: User) => Promise<boolean>
}

// 💾 Simple in-memory rate limiting (replace with Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

/**
 * 🔐 Core authentication function - Modern Supabase SSR approach with server auth support
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  // Skip authentication in mock mode
  if (!FEATURE_FLAGS.ENABLE_SUPABASE) {
    logger.info('🔓 Auth: SUPABASE disabled, skipping auth')
    return { 
      success: true, 
      user: null // Mock mode doesn't have real users
    }
  }

  try {
    logger.info('🔐 Auth: Starting authentication check')
    
    // Handle server auth mode differently - use direct Supabase auth instead of HTTP fetch
    if (FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
      logger.info('🔐 Auth: Using server auth mode - direct Supabase auth check')
      
      try {
        // Use the same logic as /api/auth/me but directly, avoiding HTTP fetch
        const supabase = await createServerSupabaseClientNew()
        
        // EXPERT FIX: Remove premature cookie check to fix Next.js cookie propagation timing issue
        // Let Supabase handle auth validation - it will fail gracefully if no valid tokens exist
        const allCookies = Array.from(request.cookies.getAll())
        const hasSupabaseCookies = allCookies.some(cookie => cookie.name.startsWith('sb-'))
        const hasAppCookie = request.cookies.has('app-has-auth')
        
        logger.info('🔐 Auth: Cookie analysis (diagnostic only)', {
          hasSupabaseCookies,
          hasAppCookie,
          totalCookies: allCookies.length,
          message: 'Proceeding with Supabase auth check regardless of cookie visibility'
        })

        // Use getUser() for secure server-side auth validation (same as /api/auth/me)
        const { data: { user }, error } = await supabase.auth.getUser()
        
        logger.info('🔐 Auth: Supabase getUser() result', {
          hasUser: !!user,
          error: error?.message,
          userId: user?.id?.slice(0, 8)
        })

        if (user && !error) {
          logger.info('🔐 Auth: User authenticated via direct Supabase auth', {
            userId: user.id?.slice(0, 8),
            email: user.email
          })
          return { success: true, user }
        }

        // Handle JWT validation errors by attempting token refresh (same as /api/auth/me)
        if (!user || error) {
          const isJWTError = error?.message?.includes('invalid JWT') || error?.message?.includes('signature is invalid')
          
          if (isJWTError) {
            logger.info('🔄 JWT signature invalid - attempting token refresh...')
            try {
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
              
              if (refreshData.session && !refreshError) {
                logger.info('✅ Token refreshed successfully')
                return { success: true, user: refreshData.session.user }
              }
            } catch (refreshErr) {
              logger.error('❌ Token refresh failed:', refreshErr)
            }
          }

          // Final fallback to getSession() (same as /api/auth/me)
          logger.info('🔍 Trying getSession() as final fallback...')
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (session && !sessionError) {
            logger.info('⚠️ Using session fallback (security warning acknowledged)')
            return { success: true, user: session.user }
          }
        }

        logger.info('❌ All auth methods failed - user not authenticated')
        return {
          success: false,
          user: null,
          error: {
            code: 'NO_USER',
            message: 'Auth session missing!',
            status: 401
          }
        }
        
      } catch (authError) {
        logger.error('🚨 Auth: Direct Supabase auth failed:', {
          error: authError instanceof Error ? authError.message : String(authError),
          stack: authError instanceof Error ? authError.stack : undefined
        })
        return {
          success: false,
          user: null,
          error: {
            code: 'AUTH_SERVICE_ERROR',
            message: 'Auth session missing!',
            status: 401
          }
        }
      }
    }
    
    // Standard Supabase client auth (non-server mode)
    const supabase = await createServerSupabaseClientNew()
    
    // Try getSession first, fallback to getUser (same pattern as /api/auth/me)
    let user = null
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (session && session.user) {
      user = session.user
    } else {
      // Fallback to getUser
      const { data: { user: fallbackUser }, error: userError } = await supabase.auth.getUser()
      if (fallbackUser && !userError) {
        user = fallbackUser
      }
    }
    
    logger.info('🔐 Auth: Supabase response', {
      hasUser: !!user,
      userId: user?.id?.slice(0, 8),
      hasSessionError: !!sessionError,
      sessionErrorMessage: sessionError?.message
    })

    if (!user) {
      logger.info('🔐 Auth: No user found in session')
      return {
        success: false,
        user: null,
        error: {
          code: 'NO_USER',
          message: 'No authenticated user found',
          status: 401
        }
      }
    }

    logger.info('🔐 Auth: User authenticated successfully', {
      userId: user.id?.slice(0, 8),
      email: user.email
    })

    return { success: true, user }

  } catch (error) {
    logger.error('🚨 Authentication error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error
    });
    return {
      success: false,
      user: null,
      error: {
        code: 'AUTH_SERVICE_ERROR',
        message: 'Authentication service temporarily unavailable',
        status: 503
      }
    }
  }
}

/**
 * ⚡ Rate limiting implementation
 */
function checkRateLimit(request: NextRequest, config: RateLimitConfig): boolean {
  const key = config.keyGenerator 
    ? config.keyGenerator(request)
    : request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'

  const now = Date.now()
  const windowStart = now - config.windowMs
  
  // Clean expired entries
  for (const [k, v] of rateLimitStore.entries()) {
    if (v.resetTime < windowStart) {
      rateLimitStore.delete(k)
    }
  }

  const current = rateLimitStore.get(key)
  
  if (!current) {
    rateLimitStore.set(key, { count: 1, resetTime: now + config.windowMs })
    return true
  }

  if (current.resetTime < now) {
    // Reset window
    rateLimitStore.set(key, { count: 1, resetTime: now + config.windowMs })
    return true
  }

  if (current.count >= config.maxRequests) {
    return false // Rate limit exceeded
  }

  current.count++
  return true
}

/**
 * 🛡️ Comprehensive API middleware wrapper
 */
export function withApiAuth(
  handler: (request: NextRequest, context: any) => Promise<NextResponse>,
  options: ApiMiddlewareOptions = {}
) {
  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      // 🚦 Rate limiting check
      if (options.rateLimit) {
        const rateLimitPassed = checkRateLimit(request, options.rateLimit)
        if (!rateLimitPassed) {
          return NextResponse.json(
            {
              error: 'Rate limit exceeded',
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Too many requests. Try again in ${Math.ceil(options.rateLimit.windowMs / 1000)} seconds.`
            },
            { 
              status: 429,
              headers: {
                'Retry-After': Math.ceil(options.rateLimit.windowMs / 1000).toString(),
                'X-Rate-Limit-Limit': options.rateLimit.maxRequests.toString(),
                'X-Rate-Limit-Remaining': '0'
              }
            }
          )
        }
      }

      // 🔐 Authentication check
      let authResult: AuthResult = { success: true, user: null }
      
      if (options.requireAuth) {
        authResult = await authenticateRequest(request)
        
        if (!authResult.success) {
          return NextResponse.json(
            {
              error: authResult.error?.message || 'Authentication failed',
              code: authResult.error?.code || 'AUTH_FAILED'
            },
            { status: authResult.error?.status || 401 }
          )
        }
      }

      const user = authResult.user

      // ✉️ Email verification check
      if (options.requireEmailVerified && user && !user.email_confirmed_at) {
        return NextResponse.json(
          {
            error: 'Email verification required',
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Please verify your email address to access this resource'
          },
          { status: 403 }
        )
      }

      // 👥 Role-based access control
      if (options.allowedRoles && user) {
        const userRoles = user.user_metadata?.roles || []
        const hasAllowedRole = options.allowedRoles.some(role => userRoles.includes(role))
        
        if (!hasAllowedRole) {
          return NextResponse.json(
            {
              error: 'Insufficient permissions',
              code: 'FORBIDDEN',
              message: 'You do not have permission to access this resource'
            },
            { status: 403 }
          )
        }
      }

      // 🎯 Custom validation
      if (options.customValidation && user) {
        const isValid = await options.customValidation(user)
        if (!isValid) {
          return NextResponse.json(
            {
              error: 'Access denied',
              code: 'CUSTOM_VALIDATION_FAILED',
              message: 'Custom validation requirements not met'
            },
            { status: 403 }
          )
        }
      }

      // 🚀 Execute the actual handler
      // If context was provided (for dynamic routes), merge user into it
      const handlerContext = context ? { ...context, user } : { user }
      return await handler(request, handlerContext)

    } catch (error) {
      logger.error('🚨 API middleware error:', error);
      
      return NextResponse.json(
        {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred'
        },
        { status: 500 }
      )
    }
  }
}

/**
 * 🎯 Convenient preset configurations
 */
export const authPresets = {
  // Public API with rate limiting
  public: (handler: any) => {
    return (request: NextRequest, context?: any) => 
      withApiAuth(handler, {
        requireAuth: false,
        rateLimit: { windowMs: 60 * 1000, maxRequests: 100 } // 100 req/min
      })(request, context)
  },

  // Authenticated users only
  authenticated: (handler: any) => {
    return (request: NextRequest, context?: any) => 
      withApiAuth(handler, {
        requireAuth: true,
        rateLimit: { windowMs: 60 * 1000, maxRequests: 200 } // 200 req/min for auth users
      })(request, context)
  },

  // Verified users only
  verified: (handler: any) => {
    return (request: NextRequest, context?: any) => 
      withApiAuth(handler, {
        requireAuth: true,
        requireEmailVerified: true,
        rateLimit: { windowMs: 60 * 1000, maxRequests: 300 } // 300 req/min for verified
      })(request, context)
  },

  // Admin only
  admin: (handler: any) => {
    return (request: NextRequest, context?: any) => 
      withApiAuth(handler, {
        requireAuth: true,
        requireEmailVerified: true,
        allowedRoles: ['admin', 'super_admin'],
        rateLimit: { windowMs: 60 * 1000, maxRequests: 1000 } // High limit for admins
      })(request, context)
  }
}

/**
 * 🔍 Helper to extract user info from request
 */
export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  const authResult = await authenticateRequest(request)
  return authResult.success ? authResult.user : null
}