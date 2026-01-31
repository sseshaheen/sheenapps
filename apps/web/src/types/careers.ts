/**
 * Career Portal Types
 * Shared type definitions for the career portal feature
 */

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship'
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'executive'
export type ApplicationStatus = 'pending' | 'reviewing' | 'shortlisted' | 'rejected' | 'hired'

export interface Job {
  id: string
  slug: string
  title: string  // Localized based on x-sheen-locale header
  title_ar?: string  // Optional for admin views
  title_en?: string  // Optional for admin views
  description: string  // Localized HTML content
  description_ar?: string  // Optional for admin views
  description_en?: string  // Optional for admin views
  requirements: string  // Localized HTML content
  requirements_ar?: string  // Optional for admin views
  requirements_en?: string  // Optional for admin views
  benefits: string  // Localized HTML content
  benefits_ar?: string  // Optional for admin views
  benefits_en?: string  // Optional for admin views
  location: string  // Localized
  location_ar?: string  // Optional for admin views
  location_en?: string  // Optional for admin views
  department: string
  employment_type: EmploymentType
  experience_level: ExperienceLevel
  salary_range?: string  // Localized
  salary_range_ar?: string  // Optional for admin views
  salary_range_en?: string  // Optional for admin views
  posted_at: string
  application_deadline?: string
  is_remote: boolean
  is_featured: boolean
  is_active?: boolean  // Optional, mainly for admin
  created_at?: string  // Optional, mainly for admin
  updated_at?: string  // Optional, mainly for admin
}

export interface JobApplication {
  id: string
  job_id: string
  full_name: string
  email: string
  phone: string
  cover_letter?: string
  linkedin_url?: string
  portfolio_url?: string
  years_of_experience?: number
  resume_file_url?: string
  status: ApplicationStatus
  applied_at: string
  reviewed_at?: string
  reviewer_notes?: string
  created_at: string
  updated_at: string
}

export interface JobStats {
  total_jobs: number
  active_jobs: number
  total_applications: number
  pending_applications: number
  applications_this_week: number
  applications_by_status: Record<ApplicationStatus, number>
  applications_by_department: Record<string, number>
}