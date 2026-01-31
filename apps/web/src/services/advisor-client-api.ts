/**
 * Client-Safe Advisor API Service
 * Uses Next.js API routes instead of calling worker API directly from browser
 */

import type { AdvisorProfile } from './advisor-server-api'

export class AdvisorClientAPIService {
  /**
   * Get advisor profile for current user (via Next.js API route)
   */
  static async getProfile(): Promise<AdvisorProfile | null> {
    try {
      const response = await fetch('/api/advisor/profile', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (response.status === 404) {
        // Profile not found - user is not an advisor (this is expected)
        return null
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch advisor profile')
      }

      return result.data
    } catch (error) {
      if (error instanceof Error && error.message.includes('HTTP 404')) {
        // Profile not found is expected for non-advisors
        return null
      }
      throw error
    }
  }
}