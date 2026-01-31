/**
 * Advisor API Service
 * Handles all advisor-related API calls with worker API integration
 */

import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'

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

interface ProfessionalData {
  bio: string
  skills: string[]
  specialties: string[]
  languages: string[]
  yearsExperience: number
  portfolioUrl?: string
  linkedinUrl?: string
  githubUrl?: string
  timezone: string
  weeklyAvailabilityHours: number
  preferredSessionDuration: number[]
  communicationStyle?: string
  preferredLanguages?: string[]
  isComplete: boolean
  completedSections: string[]
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
  correlationId: string
}

export class AdvisorAPIService {
  private static baseUrl = process.env.WORKER_BASE_URL || 'http://localhost:8081'
  
  private static async makeRequest<T>(
    path: string,
    options: RequestInit = {},
    userId?: string
  ): Promise<ApiResponse<T>> {
    const fullUrl = `${this.baseUrl}${path}`
    
    try {
      logger.info(`🔗 Advisor API: ${options.method || 'GET'} ${path}`)
      
      // Create worker auth headers
      const authHeaders = createWorkerAuthHeaders(options.method || 'GET', path, options.body as string)
      
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          ...authHeaders,
          'x-sheen-locale': 'en', // TODO: Get from context
          'x-correlation-id': crypto.randomUUID(),
          ...(userId && { 'x-user-id': userId }),
          ...options.headers
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }
      
      const result = await response.json() as ApiResponse<T>
      
      if (!result.success) {
        throw new Error(result.error || 'API request failed')
      }
      
      return result
    } catch (error) {
      logger.error(`❌ Advisor API Error: ${options.method || 'GET'} ${path}`, error)
      throw error
    }
  }
  
  /**
   * Get advisor profile
   */
  static async getProfile(userId: string): Promise<AdvisorProfile> {
    const response = await this.makeRequest<AdvisorProfile>(
      '/api/advisor/profile',
      { method: 'GET' },
      userId
    )
    
    if (!response.data) {
      throw new Error('No profile data received')
    }
    
    return response.data
  }
  
  /**
   * Update advisor profile
   */
  static async updateProfile(
    advisorId: string,
    updates: Partial<AdvisorProfile>,
    userId: string
  ): Promise<AdvisorProfile> {
    const response = await this.makeRequest<AdvisorProfile>(
      `/api/advisor/profile/${advisorId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates)
      },
      userId
    )
    
    if (!response.data) {
      throw new Error('No updated profile data received')
    }
    
    return response.data
  }
  
  /**
   * Get draft application
   */
  static async getDraft(userId: string): Promise<any> {
    const response = await this.makeRequest<any>(
      '/api/advisor/draft',
      { method: 'GET' },
      userId
    )
    
    return response.data
  }
  
  /**
   * Create/update draft with auto-save
   */
  static async saveDraft(professionalData: Partial<ProfessionalData>, userId: string): Promise<any> {
    const response = await this.makeRequest<any>(
      '/api/advisor/draft',
      {
        method: 'POST',
        body: JSON.stringify({ professionalData })
      },
      userId
    )
    
    return response.data
  }
  
  /**
   * Submit application
   */
  static async submitApplication(userId: string): Promise<any> {
    const response = await this.makeRequest<any>(
      '/api/advisor/draft/submit',
      { method: 'POST' },
      userId
    )
    
    return response.data
  }
  
  /**
   * Get event timeline
   */
  static async getTimeline(userId: string, limit: number = 50): Promise<any[]> {
    const response = await this.makeRequest<any[]>(
      `/api/advisor/timeline?limit=${limit}`,
      { method: 'GET' },
      userId
    )
    
    return response.data || []
  }
}

// Export types for use in components
export type { ProfessionalData, ApiResponse }