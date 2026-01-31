/**
 * Advisor Dashboard Types and Zod Schemas
 * Based on API specification: docs/Advisor_Dashboard_APIs.md
 */

import { z } from 'zod'

// ==========================================
// Dashboard Overview Types & Schema
// ==========================================

export const AdvisorOverviewProfileSchema = z.object({
  name: z.string(),
  approval_status: z.string(),
  is_accepting_bookings: z.boolean(),
  available_languages: z.array(z.string()),
  average_rating: z.number()
})

export const AdvisorOverviewCurrentMonthSchema = z.object({
  total_consultations: z.number(),
  free_consultations: z.number(),
  earnings_cents: z.number(),
  upcoming_consultations: z.number()
})

export const AdvisorOverviewQuickStatsSchema = z.object({
  total_lifetime_consultations: z.number(),
  lifetime_earnings_cents: z.number(),
  profile_views_this_month: z.number()
})

export const AdvisorOverviewSchema = z.object({
  profile: AdvisorOverviewProfileSchema,
  current_month: AdvisorOverviewCurrentMonthSchema,
  quick_stats: AdvisorOverviewQuickStatsSchema
})

export type AdvisorOverview = z.infer<typeof AdvisorOverviewSchema>
export type AdvisorOverviewProfile = z.infer<typeof AdvisorOverviewProfileSchema>
export type AdvisorOverviewCurrentMonth = z.infer<typeof AdvisorOverviewCurrentMonthSchema>
export type AdvisorOverviewQuickStats = z.infer<typeof AdvisorOverviewQuickStatsSchema>

// ==========================================
// Consultation Management Types & Schema
// ==========================================

export const AdvisorConsultationSchema = z.object({
  id: z.string(),
  client_name: z.string(), // First name only for privacy
  duration_minutes: z.number(),
  start_time: z.string(), // ISO timestamp
  is_free_consultation: z.boolean(),
  status: z.enum(['scheduled', 'completed', 'cancelled']),
  cal_booking_url: z.string().optional(),
  advisor_notes: z.string().optional()
})

export const ConsultationPaginationSchema = z.object({
  has_more: z.boolean(),
  next_cursor: z.string().optional(),
  total: z.number().optional() // Only for first page
})

export const AdvisorConsultationsResponseSchema = z.object({
  consultations: z.array(AdvisorConsultationSchema),
  pagination: ConsultationPaginationSchema
})

export type AdvisorConsultation = z.infer<typeof AdvisorConsultationSchema>
export type ConsultationPagination = z.infer<typeof ConsultationPaginationSchema>
export type AdvisorConsultationsResponse = z.infer<typeof AdvisorConsultationsResponseSchema>

// ==========================================
// Availability Management Types & Schema
// ==========================================

export const TimeSlotSchema = z.object({
  start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (expected HH:MM)'),
  end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (expected HH:MM)')
})

export const WeeklyScheduleSchema = z.object({
  monday: z.array(TimeSlotSchema).optional(),
  tuesday: z.array(TimeSlotSchema).optional(),
  wednesday: z.array(TimeSlotSchema).optional(),
  thursday: z.array(TimeSlotSchema).optional(),
  friday: z.array(TimeSlotSchema).optional(),
  saturday: z.array(TimeSlotSchema).optional(),
  sunday: z.array(TimeSlotSchema).optional()
})

export const BookingPreferencesSchema = z.object({
  min_notice_hours: z.number().min(1).max(168), // 1 hour to 1 week
  max_advance_days: z.number().min(1).max(365), // 1 day to 1 year
  buffer_minutes: z.number().min(0).max(120) // 0 to 2 hours
})

export const CalComSyncSchema = z.object({
  last_synced_at: z.string().optional(),
  last_sync_status: z.enum(['success', 'failed', 'pending']).optional()
})

export const AdvisorAvailabilitySchema = z.object({
  timezone: z.string(), // IANA timezone - validated separately
  weekly_schedule: WeeklyScheduleSchema,
  blackout_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD)')),
  booking_preferences: BookingPreferencesSchema,
  cal_com_sync: CalComSyncSchema
})

export type TimeSlot = z.infer<typeof TimeSlotSchema>
export type WeeklySchedule = z.infer<typeof WeeklyScheduleSchema>
export type BookingPreferences = z.infer<typeof BookingPreferencesSchema>
export type CalComSync = z.infer<typeof CalComSyncSchema>
export type AdvisorAvailability = z.infer<typeof AdvisorAvailabilitySchema>

// ==========================================
// Analytics Types & Schema
// ==========================================

export const AnalyticsPeriodSchema = z.object({
  start: z.string(),
  end: z.string()
})

export const AnalyticsConsultationsSchema = z.object({
  total: z.number(),
  by_duration: z.record(z.string(), z.number()), // { '15': 5, '30': 8, '60': 3 }
  by_type: z.object({
    free: z.number(),
    paid: z.number()
  }),
  conversion_rate: z.number() // % of free consultations that led to paid
})

export const AnalyticsEarningsMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Invalid month format (expected YYYY-MM)'),
  earnings_cents: z.number()
})

export const AnalyticsEarningsSchema = z.object({
  total_cents: z.number(),
  by_month: z.array(AnalyticsEarningsMonthSchema)
})

export const AnalyticsPerformanceSchema = z.object({
  reviews: z.object({
    average: z.number(),
    count: z.number()
  }),
  profile_views: z.number()
})

export const AnalyticsTrendsSchema = z.object({
  consultation_growth: z.string(), // e.g., '+23%'
  earnings_growth: z.string() // e.g., '+15%'
})

export const AdvisorAnalyticsSchema = z.object({
  period: AnalyticsPeriodSchema,
  consultations: AnalyticsConsultationsSchema,
  earnings: AnalyticsEarningsSchema,
  performance: AnalyticsPerformanceSchema,
  trends: AnalyticsTrendsSchema
})

export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriodSchema>
export type AnalyticsConsultations = z.infer<typeof AnalyticsConsultationsSchema>
export type AnalyticsEarnings = z.infer<typeof AnalyticsEarningsSchema>
export type AnalyticsEarningsMonth = z.infer<typeof AnalyticsEarningsMonthSchema>
export type AnalyticsPerformance = z.infer<typeof AnalyticsPerformanceSchema>
export type AnalyticsTrends = z.infer<typeof AnalyticsTrendsSchema>
export type AdvisorAnalytics = z.infer<typeof AdvisorAnalyticsSchema>

// ==========================================
// Pricing Settings Types & Schema
// ==========================================

export const FreeDurationSettingsSchema = z.object({
  15: z.boolean(), // Offers free 15-min consultations
  30: z.boolean(), // 30-min consultations setting
  60: z.boolean() // 60-min consultations setting
})

export const AdvisorPricingSettingsSchema = z.object({
  pricing_model: z.enum(['platform_fixed', 'free_only', 'hybrid']),
  free_consultation_durations: FreeDurationSettingsSchema
})

export type FreeDurationSettings = z.infer<typeof FreeDurationSettingsSchema>
export type AdvisorPricingSettings = z.infer<typeof AdvisorPricingSettingsSchema>

// ==========================================
// Request Filter Types
// ==========================================

export interface ConsultationFilters {
  status?: 'upcoming' | 'completed' | 'all'
  limit?: number
  cursor?: string
}

export interface AnalyticsFilters {
  period?: '30d' | '90d' | '1y'
}

// ==========================================
// Default Fallback Data (for parseWithFallback)
// ==========================================

export const defaultAdvisorOverview: AdvisorOverview = {
  profile: {
    name: 'Unknown Advisor',
    approval_status: 'pending',
    is_accepting_bookings: false,
    available_languages: ['en'],
    average_rating: 0
  },
  current_month: {
    total_consultations: 0,
    free_consultations: 0,
    earnings_cents: 0,
    upcoming_consultations: 0
  },
  quick_stats: {
    total_lifetime_consultations: 0,
    lifetime_earnings_cents: 0,
    profile_views_this_month: 0
  }
}

export const defaultAdvisorConsultationsResponse: AdvisorConsultationsResponse = {
  consultations: [],
  pagination: {
    has_more: false,
    total: 0
  }
}

export const defaultAdvisorAvailability: AdvisorAvailability = {
  timezone: 'UTC',
  weekly_schedule: {},
  blackout_dates: [],
  booking_preferences: {
    min_notice_hours: 24,
    max_advance_days: 30,
    buffer_minutes: 15
  },
  cal_com_sync: {}
}

export const defaultAdvisorAnalytics: AdvisorAnalytics = {
  period: {
    start: new Date().toISOString(),
    end: new Date().toISOString()
  },
  consultations: {
    total: 0,
    by_duration: {},
    by_type: { free: 0, paid: 0 },
    conversion_rate: 0
  },
  earnings: {
    total_cents: 0,
    by_month: []
  },
  performance: {
    reviews: { average: 0, count: 0 },
    profile_views: 0
  },
  trends: {
    consultation_growth: '0%',
    earnings_growth: '0%'
  }
}

export const defaultAdvisorPricingSettings: AdvisorPricingSettings = {
  pricing_model: 'platform_fixed',
  free_consultation_durations: {
    15: false,
    30: false,
    60: false
  }
}