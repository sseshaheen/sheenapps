/**
 * Server-Side Advisor API Service
 * Follows the established patterns from persistent chat routes
 * IMPORTANT: This service can only be used in server context
 */

import { detectServerLocale } from '@/lib/server-locale-utils'
import { logger } from '@/utils/logger'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import 'server-only'

export interface AdvisorProfile {
  id: string
  user_id: string
  display_name: string
  bio?: string
  avatar_url?: string
  skills: string[]
  specialties: string[]
  languages: string[]
  rating: number
  review_count: number
  approval_status: 'pending' | 'approved' | 'rejected' | 'under_review'
  is_accepting_bookings: boolean
  onboarding_steps: {
    profile_completed: boolean
    skills_added: boolean
    availability_set: boolean
    stripe_connected: boolean
    cal_connected: boolean
    admin_approved: boolean
  }
  created_at: string
  updated_at: string
}

interface ApiResponse<T> {
  success: boolean
  profile?: T
  error?: string
  message?: string
  correlationId: string
}

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081'

export class AdvisorServerAPIService {

  /**
   * Create user claims for HMAC authentication
   * Same pattern as advisor-api-client.ts
   */
  private static createUserClaims(userId: string): string {
    const claims = {
      userId,
      roles: ['user'],
      issued: Math.floor(Date.now() / 1000),
      expires: Math.floor(Date.now() / 1000) + 300 // 5 minutes
    };

    return Buffer.from(JSON.stringify(claims)).toString('base64');
  }

  /**
   * Get advisor profile for a user
   * @param userId User ID
   * @param locale Optional locale (will auto-detect from server context if not provided)
   */
  static async getProfile(userId: string, locale?: string): Promise<AdvisorProfile | null> {
    try {
      // Smart locale detection - use provided locale or auto-detect from server context
      const detectedLocale = await detectServerLocale(locale)

      const path = `/api/v1/advisors/profile`
      const pathWithQuery = path // No query parameters - user_id comes from claims
      const body = ''

      // Create and log the claims for debugging
      const userClaims = this.createUserClaims(userId)
      const decodedClaims = JSON.parse(Buffer.from(userClaims, 'base64').toString('utf8'))

      logger.info('🔗 Advisor Server API: GET /api/v1/advisors/profile', {
        userId: userId.slice(0, 8),
        requestedLocale: locale,
        detectedLocale,
        pathWithQuery,
        claimsLength: userClaims.length,
        decodedClaims: {
          userId: decodedClaims.userId.slice(0, 8),
          roles: decodedClaims.roles,
          issued: new Date(decodedClaims.issued * 1000).toISOString(),
          expires: new Date(decodedClaims.expires * 1000).toISOString()
        }
      })

      // Generate dual signature headers (V1 + V2 for rollout compatibility)
      const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, body)

      const finalHeaders = {
        ...authHeaders,                           // HMAC authentication
        'x-sheen-claims': userClaims,             // User claims (contains userId)
        'x-sheen-locale': detectedLocale          // Full locale context
      }

      // Console log for backend team diagnostics
      // console.log('🔍 WORKER API REQUEST DETAILS:')
      // console.log('URL:', `${WORKER_BASE_URL}${pathWithQuery}`)
      // console.log('Method: GET')
      // console.log('Headers:', {
      //   'x-sheen-signature': finalHeaders['x-sheen-signature']?.slice(0, 20) + '...',
      //   'x-sheen-sig-v2': finalHeaders['x-sheen-sig-v2']?.slice(0, 20) + '...',
      //   'x-sheen-timestamp': finalHeaders['x-sheen-timestamp'],
      //   'x-sheen-nonce': finalHeaders['x-sheen-nonce']?.slice(0, 20) + '...',
      //   'x-sheen-claims': userClaims?.slice(0, 50) + '...',
      //   'x-sheen-locale': finalHeaders['x-sheen-locale']
      // })
      // console.log('Decoded Claims:', decodedClaims)
      // console.log('Full User ID:', userId)

      const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
        method: 'GET',
        headers: finalHeaders
      })

      if (!response.ok) {
        const errorText = await response.text()

        // Console log the response for backend team diagnostics
        console.log('🚨 WORKER API RESPONSE ERROR:')
        console.log('Status:', response.status, response.statusText)
        console.log('Response Body:', errorText)
        console.log('Response Headers:', Object.fromEntries(response.headers.entries()))

        logger.error('❌ Advisor API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          userId: userId.slice(0, 8),
          pathWithQuery,
          requestHeaders: {
            hasSignature: !!authHeaders['x-sheen-signature'],
            hasSignatureV2: !!authHeaders['x-sheen-sig-v2'],
            hasTimestamp: !!authHeaders['x-sheen-timestamp'],
            hasNonce: !!authHeaders['x-sheen-nonce'],
            hasClaims: !!userClaims,
            claimsLength: userClaims?.length,
            locale: detectedLocale
          }
        })

        // Handle 401/404 as "profile not found" (expected for non-advisors)
        if (response.status === 401 || response.status === 404) {
          logger.info('ℹ️ User is not an advisor (401/404)', { userId: userId.slice(0, 8) })
          return null
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      // Get response as text first to handle empty/malformed responses
      const responseText = await response.text()

      if (!responseText.trim()) {
        logger.warn('Empty response from advisor API')
        return null
      }

      const result = JSON.parse(responseText) as ApiResponse<AdvisorProfile>

      if (!result.success) {
        throw new Error(result.error || 'API request failed')
      }

      if (!result.profile) {
        logger.warn('API returned success=true but no profile')
        return null
      }

      logger.info('✅ Advisor profile loaded successfully', {
        advisorId: result.profile.id.slice(0, 8),
        status: result.profile.approval_status,
        displayName: result.profile.display_name
      })

      return result.profile

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch advisor profile'
      logger.error('❌ AdvisorServerAPIService.getProfile failed:', {
        error: errorMessage,
        userId: userId.slice(0, 8)
      })
      throw error
    }
  }

  /**
   * Update advisor profile
   */
  static async updateProfile(
    advisorId: string,
    updates: Partial<AdvisorProfile>,
    userId: string,
    locale?: string
  ): Promise<AdvisorProfile> {
    try {
      // Smart locale detection
      const detectedLocale = await detectServerLocale(locale)

      const path = `/api/advisor/profile/${advisorId}`
      const pathWithQuery = path
      const body = JSON.stringify(updates)

      logger.info('🔗 Advisor Server API: PATCH /api/advisor/profile', {
        advisorId: advisorId.slice(0, 8),
        userId: userId.slice(0, 8),
        requestedLocale: locale,
        detectedLocale
      })

      // Generate dual signature headers
      const authHeaders = createWorkerAuthHeaders('PATCH', pathWithQuery, body)

      const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'x-sheen-claims': this.createUserClaims(advisorId),  // Note: using advisorId here
          'x-sheen-locale': detectedLocale
        },
        body
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('❌ Advisor update API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          advisorId: advisorId.slice(0, 8)
        })

        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const responseText = await response.text()
      const result = JSON.parse(responseText) as ApiResponse<AdvisorProfile>

      if (!result.success || !result.profile) {
        throw new Error(result.error || 'No updated profile data received')
      }

      return result.profile

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update advisor profile'
      logger.error('❌ AdvisorServerAPIService.updateProfile failed:', {
        error: errorMessage,
        advisorId: advisorId.slice(0, 8)
      })
      throw error
    }
  }

  /**
   * Get draft application for a user
   * @param userId User ID
   * @param locale Optional locale (will auto-detect from server context if not provided)
   */
  static async getDraft(userId: string, locale?: string): Promise<any> {
    try {
      // Smart locale detection
      const detectedLocale = await detectServerLocale(locale)

      const path = `/api/advisor/draft`
      const query = new URLSearchParams({ user_id: userId }).toString()
      const pathWithQuery = `${path}?${query}`
      const body = ''

      logger.info('🔗 Advisor Server API: GET /api/advisor/draft', {
        userId: userId.slice(0, 8),
        requestedLocale: locale,
        detectedLocale
      })

      // Generate dual signature headers
      const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, body)

      const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
        method: 'GET',
        headers: {
          ...authHeaders,
          'x-sheen-claims': this.createUserClaims(userId),
          'x-sheen-locale': detectedLocale
        }
      })

      if (!response.ok) {
        const errorText = await response.text()

        // Handle 401/404 as "draft not found" (expected for non-advisors)
        if (response.status === 401 || response.status === 404) {
          logger.info('ℹ️ User has no advisor draft (401/404)', { userId: userId.slice(0, 8) })
          return null
        }

        logger.error('❌ Advisor draft API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          userId: userId.slice(0, 8)
        })

        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const responseText = await response.text()

      if (!responseText.trim()) {
        return null
      }

      const result = JSON.parse(responseText) as ApiResponse<any>

      if (!result.success) {
        throw new Error(result.error || 'API request failed')
      }

      return result.profile || null

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch advisor draft'
      logger.error('❌ AdvisorServerAPIService.getDraft failed:', {
        error: errorMessage,
        userId: userId.slice(0, 8)
      })
      throw error
    }
  }
}
