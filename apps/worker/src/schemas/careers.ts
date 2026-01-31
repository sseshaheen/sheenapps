/**
 * Career Portal Validation Schemas
 * 
 * Zod schemas for validating career portal API requests
 * Ensures data integrity and type safety across all endpoints
 */

import { z } from 'zod';

// =====================================================
// Enums and Constants
// =====================================================

export const CareerLocale = z.enum(['ar', 'en']);
export type CareerLocale = z.infer<typeof CareerLocale>;

export const EmploymentType = z.enum(['full_time', 'part_time', 'contract', 'internship']);
export type EmploymentType = z.infer<typeof EmploymentType>;

export const ExperienceLevel = z.enum(['entry', 'mid', 'senior', 'executive']);
export type ExperienceLevel = z.infer<typeof ExperienceLevel>;

export const JobStatus = z.enum(['draft', 'published', 'paused', 'closed', 'expired']);
export type JobStatus = z.infer<typeof JobStatus>;

export const ApplicationStatus = z.enum(['pending', 'reviewing', 'shortlisted', 'rejected', 'hired']);
export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

export const SalaryPeriod = z.enum(['hourly', 'monthly', 'yearly']);
export type SalaryPeriod = z.infer<typeof SalaryPeriod>;

// =====================================================
// Shared Schemas
// =====================================================

export const MultilingualTextSchema = z.object({
  ar: z.string(),
  en: z.string().optional()
});

export const LocationSchema = z.object({
  country: z.string().length(2), // ISO 2-letter country code
  city: z.string().optional(),
  remote_ok: z.boolean().default(false)
});

export const SalarySchema = z.object({
  min: z.number().int().positive().optional(),
  max: z.number().int().positive().optional(),
  currency: z.string().length(3).default('EGP'), // ISO currency code
  period: SalaryPeriod.default('monthly')
});

// =====================================================
// Category Schemas
// =====================================================

export const CreateCategorySchema = z.object({
  slug: z.string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  multilingual_name: z.object({
    ar: z.string().min(2).max(100),
    en: z.string().min(2).max(100).optional()
  }),
  multilingual_description: z.object({
    ar: z.string().optional(),
    en: z.string().optional()
  }).default({}),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0)
});

export const UpdateCategorySchema = CreateCategorySchema.partial();

// =====================================================
// Company Schemas
// =====================================================

export const CreateCompanySchema = z.object({
  slug: z.string()
    .min(2)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  multilingual_name: z.object({
    ar: z.string().min(2).max(200),
    en: z.string().min(2).max(200).optional()
  }),
  multilingual_description: z.object({
    ar: z.string().optional(),
    en: z.string().optional()
  }).default({}),
  logo_url: z.string().url().optional(),
  website_url: z.string().url().optional(),
  industry: z.string().max(100).optional(),
  company_size: z.string().max(50).optional(), // "1-10", "11-50", etc.
  location: LocationSchema.optional(),
  social_links: z.object({
    linkedin: z.string().url().optional(),
    twitter: z.string().url().optional(),
    facebook: z.string().url().optional(),
    instagram: z.string().url().optional()
  }).default({}),
  is_featured: z.boolean().default(false),
  is_active: z.boolean().default(true)
});

export const UpdateCompanySchema = CreateCompanySchema.partial();

// =====================================================
// Job Schemas
// =====================================================

// For public API
export const JobListingQuerySchema = z.object({
  search: z.string().optional(),
  department: z.string().optional(),
  location: z.string().optional(),
  employment_type: EmploymentType.optional(),
  experience_level: ExperienceLevel.optional(),
  is_remote: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true')
  ]).optional(),
  limit: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10))
  ]).pipe(z.number().int().min(1).max(100)).default(20),
  offset: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10))
  ]).pipe(z.number().int().min(0)).default(0)
});

export const JobApplicationSchema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(20),
  cover_letter: z.string().optional(),
  linkedin_url: z.string().url().optional(),
  portfolio_url: z.string().url().optional(),
  years_of_experience: z.number().int().min(0).max(50).optional(),
  resume_file: z.string().optional(), // Base64 encoded file
  captcha_token: z.string()
});

// For admin API - renamed from CreateJobSchema
export const JobCreationSchema = z.object({
  // Multilingual content - Arabic is required
  multilingual_title: z.object({
    ar: z.string().min(3).max(200),
    en: z.string().min(3).max(200).optional()
  }),
  multilingual_description: z.object({
    ar: z.string().min(10), // HTML content
    en: z.string().min(10).optional()
  }),
  multilingual_requirements: z.object({
    ar: z.string().optional(),
    en: z.string().optional()
  }).default({}),
  multilingual_benefits: z.object({
    ar: z.string().optional(),
    en: z.string().optional()
  }).default({}),
  multilingual_location: z.object({
    ar: z.string().min(2).max(200),
    en: z.string().min(2).max(200).optional()
  }),
  
  // Job details
  department: z.string().min(2).max(100),
  employment_type: EmploymentType,
  experience_level: ExperienceLevel,
  salary: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().optional(),
    period: z.enum(['hourly', 'monthly', 'yearly']).optional()
  }).optional(),
  posted_at: z.string().optional(), // ISO date
  application_deadline: z.string().optional(), // ISO date
  is_remote: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  is_active: z.boolean().optional(),
  
  // SEO
  multilingual_meta_description: z.object({
    ar: z.string().optional(),
    en: z.string().optional()
  }).optional(),
  multilingual_meta_keywords: z.object({
    ar: z.string().optional(),
    en: z.string().optional()
  }).optional()
});

// Keep original name for backward compatibility
export const CreateJobSchema = JobCreationSchema;

export const JobUpdateSchema = JobCreationSchema.partial().extend({
  status: JobStatus.optional()
});

export const UpdateJobSchema = JobUpdateSchema; // Alias for compatibility

export const ApplicationStatusUpdateSchema = z.object({
  status: ApplicationStatus,
  reviewer_notes: z.string().optional()
});

export const JobStatusUpdateSchema = z.object({
  status: z.enum(['published', 'paused', 'closed'])
});

// =====================================================
// Query Schemas
// =====================================================

export const JobQuerySchema = z.object({
  q: z.string().max(100).optional(), // Search query
  category: z.string().uuid().optional(),
  company: z.string().uuid().optional(),
  country: z.string().length(2).optional(),
  remote_ok: z.coerce.boolean().optional(),
  employment_type: EmploymentType.optional(),
  experience_level: ExperienceLevel.optional(),
  featured: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export const ApplicationQuerySchema = z.object({
  status: ApplicationStatus.optional(),
  job_id: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

// =====================================================
// Application Schemas
// =====================================================

export const SubmitApplicationSchema = z.object({
  applicant_name: z.string().min(2).max(120),
  applicant_email: z.string().email(),
  applicant_phone: z.string().max(50).optional(),
  cover_letter: z.string().max(5000).optional(),
  portfolio_url: z.string().url().optional(),
  linkedin_url: z.string().url().optional(),
  captcha_token: z.string().min(10) // For CAPTCHA validation
});

export const ReviewApplicationSchema = z.object({
  status: ApplicationStatus.optional(),
  rating: z.number().int().min(1).max(5).optional(),
  admin_notes: z.string().max(1000).optional()
});

// =====================================================
// File Upload Validation
// =====================================================

export const ResumeFileSchema = z.object({
  mimetype: z.enum([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  size: z.number().max(5 * 1024 * 1024, 'File size must be less than 5MB')
});

// =====================================================
// Type Exports
// =====================================================

// Public API types
export type JobListingQuery = z.infer<typeof JobListingQuerySchema>;
export type JobApplication = z.infer<typeof JobApplicationSchema>;

// Admin API types
export type JobCreation = z.infer<typeof JobCreationSchema>;
export type JobUpdate = z.infer<typeof JobUpdateSchema>;
export type ApplicationStatusUpdate = z.infer<typeof ApplicationStatusUpdateSchema>;

// Original types (for compatibility)
export type CreateJob = z.infer<typeof CreateJobSchema>;
export type UpdateJob = z.infer<typeof UpdateJobSchema>;
export type JobQuery = z.infer<typeof JobQuerySchema>;
export type SubmitApplication = z.infer<typeof SubmitApplicationSchema>;
export type ReviewApplication = z.infer<typeof ReviewApplicationSchema>;
export type CreateCategory = z.infer<typeof CreateCategorySchema>;
export type CreateCompany = z.infer<typeof CreateCompanySchema>;