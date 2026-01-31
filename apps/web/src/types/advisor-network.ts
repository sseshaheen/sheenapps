/**
 * SheenApps Advisor Network Type Definitions
 * Based on the confirmed backend API implementation
 */

// Core Advisor Types
export interface Advisor {
  id: string;                          // Internal advisor table ID
  user_id: string;                     // User account ID (for public URLs and API calls)
  display_name: string;
  localized_display_name?: string;     // Localized display name (Arabic/French/etc)
  display_name_locale_used?: string;   // e.g., "ar", "en"
  display_name_available_languages?: string[]; // e.g., ["en", "ar", "fr"]
  bio?: string;                        // Default bio (usually English)
  localized_bio?: string;              // Localized bio content (Arabic/French/etc)
  bio_locale_used?: string;            // e.g., "ar", "en" 
  bio_available_languages?: string[];  // e.g., ["en", "ar", "fr"]
  avatar_url?: string;
  skills: string[];                    // ['React', 'Node.js']
  specialties?: Array<{
    key: string;                       // e.g., "frontend"
    label: string;                     // e.g., "Frontend Development" (default, usually English)
    label_locale_used?: string;
    label_available_languages?: string[];
  }>;
  localized_specialties?: Array<{
    specialty_key: string;             // e.g., "frontend"
    display_name: string;              // e.g., "تطوير الواجهة الأمامية" (localized)
    description?: string;              // e.g., "تطوير واجهة المستخدم..." (localized)
  }>;
  languages: string[];                 // ['English', 'Arabic']
  rating: number;                      // 0-5, calculated from reviews
  review_count: number;
  approval_status: 'pending' | 'approved' | 'rejected';
  is_accepting_bookings: boolean;
  booking_status: 'calendar_setup_required' | 'not_accepting_bookings' | 'available';
  country_code: string;                // For Stripe Connect (required)
  cal_com_event_type_url?: string;
  stripe_account_id?: string;          // Stripe Connect account ID
  hourly_rate?: number;                // Hourly rate in cents
  years_experience?: number;           // Years of experience
  timezone?: string;                   // Advisor's timezone
  availability_schedule?: string;      // JSON string of availability
  pricing_mode: 'platform' | 'custom'; // Always 'platform' for MVP
  created_at: string;                  // ISO timestamp
}

// Consultation Status and Duration
export type ConsultationStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type ConsultationDuration = 15 | 30 | 60;

// Consultation Interface
export interface Consultation {
  id: string;
  advisor_id: string;
  client_id: string;
  project_id?: string;
  cal_booking_id?: string;
  start_time: string;                  // ISO timestamp
  duration_minutes: ConsultationDuration;
  status: ConsultationStatus;
  video_url?: string;                  // From Cal.com
  notes?: string;
  price_cents: number;                 // What client pays: 900, 1900, or 3500
  currency: string;                    // 'USD', 'EUR', etc.
  pricing_snapshot?: any;              // Stored pricing info at booking time
  client_timezone?: string;            // Client's timezone at booking
  locale?: string;                     // Client's locale at booking
  dst_offset_minutes?: number;         // DST offset at booking
  created_at: string;                  // ISO timestamp
  
  // Privacy-safe fields for advisors
  client_first_name?: string;          // Only visible to advisors
  
  // Extended fields for UI
  advisor?: Advisor;                   // Populated advisor info for clients
  can_cancel?: boolean;                // Can be cancelled (>24h before)
  refund_eligible?: boolean;           // Eligible for refund
}

// Review Interface
export interface AdvisorReview {
  id: string;
  advisor_id: string;
  client_id: string;
  consultation_id?: string;
  rating: number;                      // 1-5
  review_text?: string;
  expertise_rating?: number;           // 1-5
  communication_rating?: number;       // 1-5
  helpfulness_rating?: number;         // 1-5
  created_at: string;                  // ISO timestamp
}

// Pricing Configuration
export interface ConsultationPricing {
  duration_minutes: ConsultationDuration;
  price_cents: number;
  currency: string;
  advisor_earnings_cents: number;      // 70% of price
  platform_fee_cents: number;         // 30% of price
  display_price: string;               // Formatted price for UI
  advisor_display_earnings: string;    // Formatted earnings for advisor UI
}

// Enhanced Pricing Response with Free Consultation Support
export interface AdvisorPricingResponse {
  pricing: {
    [duration: string]: {
      price_cents: number;
      price_display: string;
    };
  };
  platform_fee_percentage: number;
  currency: string;
  advisor_pricing_model: 'platform_fixed' | 'free_only' | 'hybrid';
  free_consultations_available: {
    [duration: string]: boolean;
  };
}

// API Request/Response Types
export interface AdvisorSearchRequest {
  skills?: string[];
  specialties?: string[];
  languages?: string[];
  rating_min?: number;
  available_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface AdvisorSearchResponse {
  advisors: Advisor[];
  total: number;
  has_more: boolean;
}

export interface AdvisorApplicationRequest {
  display_name: string;
  bio: string;
  skills: string[];
  specialties: string[];
  languages: string[];
  portfolio_url?: string;
  experience_years?: number;
  years_experience?: number;        // Alias for experience_years
  timezone?: string;
  availability_hours?: string;
}

export interface BookConsultationRequest {
  advisor_user_id: string;           // User ID of the advisor (public API uses user_id)
  duration_minutes: ConsultationDuration;
  project_id?: string;
  cal_booking_id?: string;           // From Cal.com widget
  locale?: string;                   // Client's locale
  client_timezone?: string;          // Client's timezone
  notes?: string;                    // Optional booking notes
}

export interface BookConsultationResponse {
  consultation_id: string;
  stripe_payment_intent_id: string;
  client_secret: string;             // For Stripe Elements
  total_amount_cents: number;
  requires_payment: boolean;
  cal_booking_url?: string;          // If Cal.com integration needed
}

export interface AdvisorEarnings {
  advisor_id: string;
  current_month_earnings_cents: number;
  last_month_earnings_cents: number;
  total_lifetime_earnings_cents: number;
  pending_payout_cents: number;
  next_payout_date?: string;
  consultations_this_month: number;
  average_rating: number;
  currency: string;
  formatted_current_month: string;   // For UI display
  formatted_pending: string;         // For UI display
}

// Admin Management Types  
export interface AdvisorWithMetrics extends Advisor {
  user_id: string;                  // User ID for admin operations (required for admin interfaces)
  total_consultations: number;
  total_earnings_cents: number;
  join_date: string;
}

export interface AdvisorApplication {
  id: string;
  user_id: string;
  display_name: string;
  bio: string;
  skills: string[];
  specialties: string[];
  languages: string[];
  portfolio_url?: string;
  experience_years?: number;
  years_experience?: number;        // Alias for experience_years
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  admin_notes?: string;
}

export interface ConsultationRefundRequest {
  consultation_id: string;
  reason: string;
  refund_amount_cents?: number;       // Optional partial refund
  admin_notes?: string;
}

// Chat Integration Types
export interface ChatAdvisorContext {
  advisor_id: string;
  advisor_name: string;
  advisor_avatar?: string;
  is_active: boolean;
  consultation_id?: string;           // If part of paid consultation
  guidance_rate_cents?: number;       // Cost per message/interaction
}

export interface ChatMessage {
  id: string;
  content: string;
  author_type: 'client' | 'advisor' | 'ai';
  author_id?: string;
  author_name?: string;
  author_avatar?: string;
  advisor_guided?: boolean;           // AI response guided by advisor
  cost_impact?: {
    type: 'session' | 'advised_minutes';
    rate_cents: number;
  };
  co_orchestrated_by?: string;        // advisor_id who guided the AI
  advisor_context?: {
    suggestion: string;
    reasoning: string;
  };
  created_at: string;
  project_id: string;
}

// Error Types Specific to Advisor Network
export interface AdvisorNetworkError {
  code: string;
  message: string;
  details?: any;
}

export class AdvisorBookingError extends Error {
  constructor(
    public code: string,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'AdvisorBookingError';
  }
}

// Utility Types for Frontend Components
export interface AdvisorCardProps {
  advisor: Advisor;
  showBookingButton?: boolean;
  showFullBio?: boolean;
  onBook?: (advisorId: string) => void;
  onViewProfile?: (advisorId: string) => void;
  className?: string;
}

export interface ConsultationCardProps {
  consultation: Consultation;
  viewType: 'client' | 'advisor' | 'admin';
  onCancel?: (consultationId: string) => void;
  onJoin?: (videoUrl: string) => void;
  onReview?: (consultationId: string) => void;
  className?: string;
}

// Filter and Sort Options
export type AdvisorSortOption = 'rating' | 'reviews' | 'availability' | 'recent';
export type ConsultationFilterOption = 'all' | 'scheduled' | 'completed' | 'cancelled';

// Localization Support
export interface LocalizedPricing {
  locale: string;
  currency: string;
  advisor_pricing_model?: 'platform_fixed' | 'free_only' | 'hybrid';
  platform_fee_percentage?: number;
  prices: {
    duration_15: {
      amount_cents: number;
      display: string;
      is_free?: boolean;
    };
    duration_30: {
      amount_cents: number;
      display: string;
      is_free?: boolean;
    };
    duration_60: {
      amount_cents: number;
      display: string;
      is_free?: boolean;
    };
  };
  free_consultations_available?: {
    [duration: string]: boolean;
  };
}