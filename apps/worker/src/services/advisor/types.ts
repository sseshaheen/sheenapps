/**
 * Advisor Service Types
 * 
 * Comprehensive type definitions for advisor application management, consultation booking,
 * and admin review workflows. Designed for type safety and Phase 2 implementation.
 */

// =====================================================
// Core Advisor Types
// =====================================================

export type AdvisorApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'returned_for_changes';
export type AdvisorApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ConsultationStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type AdvisorEventType = 'draft_created' | 'draft_updated' | 'profile_updated' | 'application_submitted' | 
  'review_started' | 'review_completed' | 'status_changed' | 'admin_note_added' | 
  'documents_uploaded' | 'interview_scheduled' | 'interview_completed';

// Supported languages for multilingual advisor profiles
export type SupportedLanguage = 'en' | 'ar' | 'fr' | 'es' | 'de';

// Multilingual content structure
export interface MultilingualContent {
  [key: string]: string | undefined; // Language code to content mapping
  en?: string;
  ar?: string;
  fr?: string;
  es?: string;
  de?: string;
}

// =====================================================
// Professional Data Structure
// =====================================================

export interface ProfessionalData {
  // Basic Information
  bio: string;
  multilingual_bio?: MultilingualContent; // New: multilingual bio support
  skills: string[];
  specialties: string[];
  languages: string[];
  
  // Experience & Portfolio
  yearsExperience: number;
  portfolioUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  
  // Availability & Pricing
  timezone: string;
  weeklyAvailabilityHours: number;
  preferredSessionDuration: number[];
  
  // Communication
  communicationStyle: string;
  preferredLanguages: string[];
  
  // Validation metadata
  isComplete: boolean;
  completedSections: string[];
}

export interface OnboardingSteps {
  profile_completed: boolean;
  skills_added: boolean;
  availability_set: boolean;
  stripe_connected: boolean;
  cal_connected: boolean;
  admin_approved: boolean;
}

// =====================================================
// Application Draft Types
// =====================================================

export interface AdvisorApplicationDraft {
  id: string;
  user_id: string;
  status: AdvisorApplicationStatus;
  submitted_at?: string;
  professional_data: ProfessionalData;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface CreateDraftParams {
  userId: string;
  professionalData: Partial<ProfessionalData>;
  status?: AdvisorApplicationStatus;
}

export interface UpdateDraftParams {
  draftId: string;
  professionalData: Partial<ProfessionalData>;
  status?: AdvisorApplicationStatus;
  authenticatedClaims: AdvisorClaims;
}

export interface DraftResult {
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  draftId?: string | undefined;
  data?: AdvisorApplicationDraft | undefined;
  error?: string | undefined;
}

// =====================================================
// Event Timeline Types
// =====================================================

export interface AdvisorEvent {
  id: string;
  user_id: string;
  advisor_id?: string;
  event_type: AdvisorEventType;
  event_data: Record<string, any>;
  created_by?: string;
  actor_type: 'system' | 'user' | 'admin';
  event_code?: string;
  created_at: string;
}

export interface CreateEventParams {
  userId: string;
  advisorId?: string;
  eventType: AdvisorEventType;
  eventData?: Record<string, any>;
  createdBy?: string;
  actorType?: 'system' | 'user' | 'admin';
  eventCode?: string;
}

// =====================================================
// Advisor Profile Types
// =====================================================

export interface Advisor {
  id: string;
  user_id: string;
  display_name: string;
  bio?: string; // Legacy single-language bio
  multilingual_bio?: MultilingualContent; // New: multilingual bio support
  avatar_url?: string;
  skills: string[];
  specialties: string[];
  languages: string[];
  rating: number;
  review_count: number;
  approval_status: AdvisorApprovalStatus;
  stripe_connect_account_id?: string;
  cal_com_event_type_url?: string;
  is_accepting_bookings: boolean;
  country_code?: string;
  approved_by?: string;
  approved_at?: string;
  onboarding_steps: OnboardingSteps;
  review_started_at?: string;
  review_completed_at?: string;
  created_at: string;
  updated_at: string;
  // Computed fields for API responses
  available_languages?: SupportedLanguage[]; // Languages with content
  localized_bio?: string; // Bio in requested language
  localized_specialties?: SpecialtyTranslation[]; // Translated specialties
}

export interface UpdateAdvisorParams {
  advisorId: string;
  updates: Partial<Omit<Advisor, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
  authenticatedClaims: AdvisorClaims;
}

// =====================================================
// Authentication & Authorization
// =====================================================

export interface AdvisorClaims {
  userId: string;
  email: string;
  roles: string[];
  issued: number;
  expires: number;
  // Future expansion
  organizationId?: string;
}

// =====================================================
// Service Interface
// =====================================================

export interface AdvisorService {
  // Draft Management
  createOrUpdateDraft(params: CreateDraftParams): Promise<DraftResult>;
  getDraft(userId: string): Promise<DraftResult>;
  submitApplication(userId: string): Promise<DraftResult>;
  
  // Profile Management
  getAdvisorProfile(userId: string, lang?: SupportedLanguage): Promise<Advisor | null>;
  updateAdvisorProfile(params: UpdateAdvisorParams): Promise<Advisor>;
  
  // Multilingual Bio Management
  updateAdvisorBio(userId: string, language: SupportedLanguage, bioContent: string): Promise<boolean>;
  getAdvisorBioLocalized(userId: string, language: SupportedLanguage): Promise<string | null>;
  getAdvisorAvailableLanguages(userId: string): Promise<SupportedLanguage[]>;
  
  // Specialty Translation Management
  getSpecialtyTranslations(language: SupportedLanguage): Promise<SpecialtyTranslation[]>;
  createSpecialtyTranslation(translation: Omit<SpecialtyTranslationFull, 'id' | 'created_at' | 'updated_at'>): Promise<SpecialtyTranslationFull>;
  updateSpecialtyTranslation(id: string, updates: Partial<SpecialtyTranslation>): Promise<SpecialtyTranslationFull>;
  
  // Search with Language Support
  searchAdvisors(request: AdvisorSearchRequest): Promise<AdvisorSearchResponse>;
  
  // Event Timeline
  addEvent(params: CreateEventParams): Promise<string>;
  getEventTimeline(userId: string, limit?: number): Promise<AdvisorEvent[]>;
  
  // Translation Metrics
  logTranslationMetric(metric: Omit<TranslationMetric, 'id' | 'created_at'>): Promise<string>;
  
  // Admin Functions
  getApplicationsForReview(status?: AdvisorApplicationStatus): Promise<AdvisorApplicationDraft[]>;
  startReview(userId: string, adminUserId: string): Promise<void>;
  completeReview(userId: string, adminUserId: string, approved: boolean, notes?: string): Promise<void>;
}

// =====================================================
// API Request/Response Types
// =====================================================

export interface GetDraftRequest {
  userId: string;
}

export interface CreateDraftRequest {
  professionalData: Partial<ProfessionalData>;
}

export interface UpdateDraftRequest {
  professionalData: Partial<ProfessionalData>;
  status?: AdvisorApplicationStatus;
}

export interface SubmitApplicationRequest {
  // No body required - uses auth claims for userId
}

export interface GetProfileRequest {
  userId?: string; // Optional - defaults to auth claims
}

export interface UpdateProfileRequest {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  skills?: string[];
  specialties?: string[];
  languages?: string[];
  cal_com_event_type_url?: string;
  is_accepting_bookings?: boolean;
  country_code?: string;
}

export interface AddEventRequest {
  userId: string;
  advisorId?: string;
  eventType: AdvisorEventType;
  eventData?: Record<string, any>;
  eventCode?: string;
}

export interface GetTimelineRequest {
  userId?: string;
  limit?: number;
}

export interface StartReviewRequest {
  userId: string;
}

export interface CompleteReviewRequest {
  userId: string;
  approved: boolean;
  notes?: string;
}

// Standard API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// =====================================================
// Specialty Translation Types
// =====================================================

export interface SpecialtyTranslation {
  specialty_key: string;
  language_code: SupportedLanguage;
  display_name: string;
  description?: string;
}

export interface SpecialtyTranslationFull {
  id: string;
  specialty_key: string;
  language_code: SupportedLanguage;
  display_name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// =====================================================
// Multilingual API Types
// =====================================================

export interface UpdateBioRequest {
  language: SupportedLanguage;
  bio_content: string;
}

export interface GetProfileRequest {
  userId?: string; // Optional - defaults to auth claims
  lang?: SupportedLanguage; // Language preference
}

export interface AdvisorSearchRequest {
  query?: string;
  specialties?: string[];
  languages?: SupportedLanguage[];
  country_code?: string;
  min_rating?: number;
  lang?: SupportedLanguage; // Language for translated content
  page?: number;
  limit?: number;
}

export interface AdvisorSearchResponse {
  advisors: Advisor[];
  total: number;
  page: number;
  limit: number;
  available_filters: {
    specialties: SpecialtyTranslation[];
    languages: SupportedLanguage[];
    countries: string[];
  };
}

// Translation metrics for business intelligence
export interface TranslationMetric {
  id: string;
  advisor_user_id: string;
  language_code: SupportedLanguage;
  action_type: 'bio_update' | 'specialty_view' | 'profile_view' | 'search_result';
  content_length?: number;
  metadata: Record<string, any>;
  created_at: string;
}

// =====================================================
// Error Types
// =====================================================

export class AdvisorError extends Error {
  constructor(
    public code: AdvisorErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AdvisorError';
  }
}

export type AdvisorErrorCode = 
  | 'DRAFT_NOT_FOUND'
  | 'ADVISOR_NOT_FOUND'
  | 'INVALID_APPLICATION_STATUS'
  | 'INCOMPLETE_PROFESSIONAL_DATA'
  | 'UNAUTHORIZED_UPDATE'
  | 'DRAFT_ALREADY_SUBMITTED'
  | 'REVIEW_ALREADY_STARTED'
  | 'REVIEW_NOT_STARTED'
  | 'DATABASE_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'VALIDATION_ERROR'
  | 'INVALID_LANGUAGE_CODE'
  | 'BIO_CONTENT_INVALID'
  | 'TRANSLATION_NOT_FOUND'
  | 'SPECIALTY_TRANSLATION_ERROR';

// =====================================================
// Validation Schemas (for runtime validation)
// =====================================================

export interface ValidationSchema {
  professionalData: {
    required: (keyof ProfessionalData)[];
    optional: (keyof ProfessionalData)[];
    minSkills: number;
    minSpecialties: number;
    minYearsExperience: number;
    maxYearsExperience: number;
  };
}

export const ADVISOR_VALIDATION: ValidationSchema = {
  professionalData: {
    required: ['bio', 'skills', 'specialties', 'languages', 'yearsExperience', 'timezone'],
    optional: ['portfolioUrl', 'linkedinUrl', 'githubUrl', 'communicationStyle', 'preferredLanguages'],
    minSkills: 3,
    minSpecialties: 1,
    minYearsExperience: 1,
    maxYearsExperience: 50
  }
};

// =====================================================
// Constants
// =====================================================

export const ADVISOR_SPECIALTIES = [
  'frontend', 'backend', 'fullstack', 'mobile', 'devops', 
  'data-science', 'machine-learning', 'blockchain', 'security',
  'ui-ux', 'product-management', 'ecommerce', 'apis'
] as const;

export const ADVISOR_SKILLS = [
  'javascript', 'typescript', 'react', 'vue', 'angular', 'node.js',
  'python', 'java', 'c#', 'go', 'rust', 'php', 'ruby',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform',
  'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch'
] as const;

export const COMMUNICATION_LANGUAGES = [
  'en', 'ar', 'fr', 'es', 'de', 'pt', 'it', 'zh', 'ja', 'ko'
] as const;

export type AdvisorSpecialty = typeof ADVISOR_SPECIALTIES[number];
export type AdvisorSkill = typeof ADVISOR_SKILLS[number];
export type CommunicationLanguage = typeof COMMUNICATION_LANGUAGES[number];