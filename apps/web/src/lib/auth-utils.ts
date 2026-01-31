/**
 * 🔗 Authentication Utilities
 * Robust redirect handling for OAuth and mobile in-app browsers
 */

import { NextRequest } from 'next/server'
import { logger } from '@/utils/logger';

/**
 * Generate robust redirect URL using server-side host detection
 * Handles mobile in-app browsers and proxy scenarios
 */
export function getAuthRedirectUrl(request: NextRequest, path: string): string {
  // In development, always use the request host to avoid env var conflicts
  if (process.env.NODE_ENV === 'development') {
    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http:' : 'https:'
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    return `${protocol}//${host}${cleanPath}`
  }
  
  // In production, try x-forwarded-host first (for proxies/load balancers)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host')
  
  // Determine protocol
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const protocol = forwardedProto || (request.nextUrl.protocol || 'https:')
  
  // Ensure protocol has colon
  const normalizedProtocol = protocol.endsWith(':') ? protocol : `${protocol}:`
  
  // Build robust URL
  const baseUrl = `${normalizedProtocol}//${host}`
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  
  return `${baseUrl}${cleanPath}`
}

/**
 * Generate OAuth callback URL with proper host detection
 */
export function getOAuthCallbackUrl(
  request: NextRequest, 
  locale: string, 
  returnTo?: string
): string {
  const callbackPath = `/${locale}/auth/callback`
  const baseUrl = getAuthRedirectUrl(request, callbackPath)
  
  if (returnTo) {
    return `${baseUrl}?returnTo=${encodeURIComponent(returnTo)}`
  }
  
  return baseUrl
}

/**
 * Client-side helper for OAuth redirects (fallback when server context unavailable)
 */
export function getClientOAuthCallbackUrl(locale: string, returnTo?: string): string {
  // Use environment variable if available, fallback to window.location
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
  
  const callbackPath = `/${locale}/auth/callback`
  const baseUrl = origin + callbackPath
  
  if (returnTo) {
    return `${baseUrl}?returnTo=${encodeURIComponent(returnTo)}`
  }
  
  return baseUrl
}

/**
 * Enhanced redirect URL generation for magic links and email verification
 */
export function getEmailRedirectUrl(
  request: NextRequest,
  locale: string,
  returnTo?: string,
  emailType: 'signup' | 'magic' | 'recovery' = 'signup'
): string {
  const callbackPath = `/${locale}/auth/callback`
  const baseUrl = getAuthRedirectUrl(request, callbackPath)
  
  const params = new URLSearchParams()
  if (returnTo) params.set('returnTo', returnTo)
  params.set('type', emailType)
  
  return `${baseUrl}?${params.toString()}`
}

/**
 * Parse and validate return URL for security
 */
export function sanitizeReturnUrl(returnTo: string | null, locale: string): string {
  if (!returnTo) {
    return `/${locale}/builder`
  }
  
  try {
    // Parse URL to validate
    const url = new URL(returnTo, 'https://example.com')
    
    // Only allow relative URLs (same origin)
    if (url.origin !== 'https://example.com') {
      logger.warn('🚨 Rejected external return URL:', returnTo);
      return `/${locale}/builder`
    }
    
    // Ensure it starts with the locale
    const path = url.pathname
    if (!path.startsWith(`/${locale}/`)) {
      return `/${locale}/builder`
    }
    
    return path + url.search
  } catch (error) {
    logger.warn('🚨 Invalid return URL:', returnTo, error);
    return `/${locale}/builder`
  }
}