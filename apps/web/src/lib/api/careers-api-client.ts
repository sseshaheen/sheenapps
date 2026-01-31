/**
 * Career Portal API Client
 * Handles all interactions with the career portal backend endpoints
 */

import { getWorkerBaseUrl } from '@/utils/api-utils'

// Import types from centralized location
import type { Job, EmploymentType, ExperienceLevel } from '@/types/careers'

// Re-export for backward compatibility
export type { Job }

export interface JobListParams {
  search?: string
  department?: string
  location?: string
  employment_type?: string
  experience_level?: string
  is_remote?: boolean
  limit?: number
  offset?: number
}

export interface JobListResponse {
  items: Job[]
  total: number
  limit: number
  offset: number
}

export interface JobDetailResponse {
  success: boolean
  job: Job
  jsonLd: object
}

export interface ApplicationRequest {
  full_name: string
  email: string
  phone: string
  cover_letter?: string
  linkedin_url?: string
  portfolio_url?: string
  years_of_experience?: number
  resume_file?: string // Base64 encoded file data
  captcha_token: string
}

export interface ApplicationResponse {
  success: boolean
  application_id: string
  message: string
}

export interface DepartmentsResponse {
  success: boolean
  departments: Array<{
    department: string
    job_count: number
  }>
}

export interface SitemapResponse {
  success: boolean
  urls: Array<{
    loc: string
    lastmod: string
    changefreq: string
    priority: number
  }>
}

/**
 * Base API call with locale header
 */
async function apiCall(
  endpoint: string,
  locale: string,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = getWorkerBaseUrl()
  
  return fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'x-sheen-locale': locale,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Career Portal API Client
 */
export const CareersApiClient = {
  /**
   * List all jobs with optional filters
   */
  async listJobs(
    params: JobListParams = {},
    locale: string = 'en'
  ): Promise<JobListResponse> {
    const searchParams = new URLSearchParams()
    
    if (params.search) searchParams.append('search', params.search)
    if (params.department) searchParams.append('department', params.department)
    if (params.location) searchParams.append('location', params.location)
    if (params.employment_type) searchParams.append('employment_type', params.employment_type)
    if (params.experience_level) searchParams.append('experience_level', params.experience_level)
    if (params.is_remote !== undefined) searchParams.append('is_remote', String(params.is_remote))
    if (params.limit) searchParams.append('limit', String(params.limit))
    if (params.offset) searchParams.append('offset', String(params.offset))
    
    const response = await apiCall(
      `/api/careers/jobs?${searchParams.toString()}`,
      locale
    )
    
    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.statusText}`)
    }
    
    return response.json()
  },

  /**
   * Get a single job by slug
   */
  async getJob(slug: string, locale: string = 'en'): Promise<JobDetailResponse> {
    const response = await apiCall(`/api/careers/jobs/${slug}`, locale)
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Job not found')
      }
      throw new Error(`Failed to fetch job: ${response.statusText}`)
    }
    
    return response.json()
  },

  /**
   * Submit a job application
   */
  async submitApplication(
    jobId: string,
    application: ApplicationRequest,
    locale: string = 'en'
  ): Promise<ApplicationResponse> {
    const response = await apiCall(
      `/api/careers/jobs/${jobId}/apply`,
      locale,
      {
        method: 'POST',
        body: JSON.stringify(application),
      }
    )
    
    const data = await response.json()
    
    if (!response.ok) {
      const errorMessage = data.error || 'Application failed'
      
      // Throw specific error types for different status codes
      if (response.status === 409) {
        const error = new Error('You have already applied for this position')
        ;(error as any).code = 'DUPLICATE_APPLICATION'
        throw error
      }
      
      if (response.status === 429) {
        const error = new Error('Too many applications. Please try again later.')
        ;(error as any).code = 'RATE_LIMIT'
        throw error
      }
      
      if (response.status === 422) {
        const error = new Error('CAPTCHA verification failed. Please try again.')
        ;(error as any).code = 'CAPTCHA_FAILED'
        ;(error as any).errorCodes = data.errorCodes
        throw error
      }
      
      throw new Error(errorMessage)
    }
    
    return data
  },

  /**
   * Get list of departments with job counts
   */
  async getDepartments(locale: string = 'en'): Promise<DepartmentsResponse> {
    const response = await apiCall('/api/careers/departments', locale)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch departments: ${response.statusText}`)
    }
    
    return response.json()
  },

  /**
   * Get sitemap data for SEO
   */
  async getSitemapData(locale: string = 'en'): Promise<SitemapResponse> {
    const response = await apiCall('/api/careers/sitemap', locale)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap data: ${response.statusText}`)
    }
    
    return response.json()
  },

  /**
   * Convert file to base64 for API submission
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  },

  /**
   * Validate file for resume upload
   */
  validateResumeFile(file: File): { valid: boolean; error?: string } {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    
    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: 'Only PDF, DOC, and DOCX files are allowed',
      }
    }
    
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File size must be less than 5MB',
      }
    }
    
    return { valid: true }
  },
}