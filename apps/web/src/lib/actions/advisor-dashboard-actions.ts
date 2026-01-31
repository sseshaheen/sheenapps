/**
 * Server Actions for Advisor Dashboard
 * Handles HMAC-authenticated API calls to worker endpoints
 * 
 * SERVER-ONLY MODULE - These are server actions
 */

'use server';

import { getAdvisorClient } from '@/services/advisor-api-client';
import { getCurrentUserId } from '@/utils/advisor-state';
import { logger } from '@/utils/logger';
import type {
  AdvisorOverview,
  AdvisorConsultationsResponse,
  AdvisorAvailability,
  AdvisorAnalytics,
  AdvisorPricingSettings,
  ConsultationFilters,
  AnalyticsFilters
} from '@/types/advisor-dashboard';

// ==========================================
// Query Actions (GET operations)
// ==========================================

/**
 * Get advisor dashboard overview
 */
export async function getAdvisorOverview(
  userId?: string,
  locale = 'en'
): Promise<AdvisorOverview> {
  try {
    // Use provided userId or get from session
    const advisorUserId = userId || await getCurrentUserId();
    if (!advisorUserId) {
      throw new Error('User ID is required for advisor overview');
    }

    logger.info('🔐 Server action: Getting advisor overview', { 
      userId: advisorUserId.slice(0, 8), 
      locale 
    });

    const advisorClient = getAdvisorClient();
    const overview = await advisorClient.getAdvisorOverview(advisorUserId, locale);

    return overview;
  } catch (error) {
    logger.error('❌ Server action failed: getAdvisorOverview', error);
    throw error; // Let React Query handle the error
  }
}

/**
 * Get advisor consultations with pagination
 */
export async function getAdvisorConsultations(
  userId?: string,
  filters: ConsultationFilters = {},
  locale = 'en'
): Promise<AdvisorConsultationsResponse> {
  try {
    const advisorUserId = userId || await getCurrentUserId();
    if (!advisorUserId) {
      throw new Error('User ID is required for advisor consultations');
    }

    logger.info('🔐 Server action: Getting advisor consultations', { 
      userId: advisorUserId.slice(0, 8), 
      filters,
      locale 
    });

    const advisorClient = getAdvisorClient();
    const consultations = await advisorClient.getAdvisorConsultations(advisorUserId, filters, locale);

    return consultations;
  } catch (error) {
    logger.error('❌ Server action failed: getAdvisorConsultations', error);
    throw error;
  }
}

/**
 * Get advisor analytics for specified period
 */
export async function getAdvisorAnalytics(
  userId?: string,
  filters: AnalyticsFilters = { period: '30d' },
  locale = 'en'
): Promise<AdvisorAnalytics> {
  try {
    const advisorUserId = userId || await getCurrentUserId();
    if (!advisorUserId) {
      throw new Error('User ID is required for advisor analytics');
    }

    logger.info('🔐 Server action: Getting advisor analytics', { 
      userId: advisorUserId.slice(0, 8), 
      period: filters.period,
      locale 
    });

    const advisorClient = getAdvisorClient();
    const analytics = await advisorClient.getAdvisorAnalytics(advisorUserId, filters, locale);

    return analytics;
  } catch (error) {
    logger.error('❌ Server action failed: getAdvisorAnalytics', error);
    throw error;
  }
}

/**
 * Get advisor availability settings
 */
export async function getAdvisorAvailability(
  userId?: string,
  locale = 'en'
): Promise<AdvisorAvailability> {
  try {
    const advisorUserId = userId || await getCurrentUserId();
    if (!advisorUserId) {
      throw new Error('User ID is required for advisor availability');
    }

    logger.info('🔐 Server action: Getting advisor availability', { 
      userId: advisorUserId.slice(0, 8), 
      locale 
    });

    const advisorClient = getAdvisorClient();
    const availability = await advisorClient.getAdvisorAvailability(advisorUserId, locale);

    return availability;
  } catch (error) {
    logger.error('❌ Server action failed: getAdvisorAvailability', error);
    throw error;
  }
}

/**
 * Get advisor pricing settings
 */
export async function getAdvisorPricingSettings(
  userId?: string,
  locale = 'en'
): Promise<AdvisorPricingSettings> {
  try {
    const advisorUserId = userId || await getCurrentUserId();
    if (!advisorUserId) {
      throw new Error('User ID is required for advisor pricing settings');
    }

    logger.info('🔐 Server action: Getting advisor pricing settings', { 
      userId: advisorUserId.slice(0, 8), 
      locale 
    });

    const advisorClient = getAdvisorClient();
    const settings = await advisorClient.getAdvisorPricingSettings(advisorUserId, locale);

    return settings;
  } catch (error) {
    logger.error('❌ Server action failed: getAdvisorPricingSettings', error);
    throw error;
  }
}

// ==========================================
// Mutation Actions (PUT operations)
// ==========================================

/**
 * Update advisor availability settings
 */
export async function updateAdvisorAvailability(
  availability: AdvisorAvailability,
  userId?: string,
  locale = 'en'
): Promise<AdvisorAvailability> {
  try {
    const advisorUserId = userId || await getCurrentUserId();
    if (!advisorUserId) {
      throw new Error('User ID is required to update advisor availability');
    }

    logger.info('🔐 Server action: Updating advisor availability', { 
      userId: advisorUserId.slice(0, 8),
      timezone: availability.timezone,
      blackoutDates: availability.blackout_dates.length,
      locale 
    });

    const advisorClient = getAdvisorClient();
    const updatedAvailability = await advisorClient.updateAdvisorAvailability(
      availability, 
      advisorUserId, 
      locale
    );

    return updatedAvailability;
  } catch (error) {
    logger.error('❌ Server action failed: updateAdvisorAvailability', error);
    throw error;
  }
}

/**
 * Update advisor pricing settings
 */
export async function updateAdvisorPricingSettings(
  settings: AdvisorPricingSettings,
  userId?: string,
  locale = 'en'
): Promise<AdvisorPricingSettings> {
  try {
    const advisorUserId = userId || await getCurrentUserId();
    if (!advisorUserId) {
      throw new Error('User ID is required to update advisor pricing settings');
    }

    logger.info('🔐 Server action: Updating advisor pricing settings', { 
      userId: advisorUserId.slice(0, 8),
      pricingModel: settings.pricing_model,
      locale 
    });

    const advisorClient = getAdvisorClient();
    const updatedSettings = await advisorClient.updateAdvisorPricingSettings(
      settings, 
      advisorUserId, 
      locale
    );

    return updatedSettings;
  } catch (error) {
    logger.error('❌ Server action failed: updateAdvisorPricingSettings', error);
    throw error;
  }
}

// ==========================================
// Utility Actions
// ==========================================

/**
 * Refresh all advisor dashboard data (useful for cache invalidation)
 */
export async function refreshAdvisorDashboard(userId?: string, locale = 'en') {
  try {
    const advisorUserId = userId || await getCurrentUserId();
    if (!advisorUserId) {
      throw new Error('User ID is required to refresh advisor dashboard');
    }

    logger.info('🔄 Server action: Refreshing advisor dashboard', { 
      userId: advisorUserId.slice(0, 8), 
      locale 
    });

    const advisorClient = getAdvisorClient();

    // Fetch all data in parallel
    const [overview, consultations, analytics, availability, settings] = await Promise.all([
      advisorClient.getAdvisorOverview(advisorUserId, locale),
      advisorClient.getAdvisorConsultations(advisorUserId, { limit: 10 }, locale),
      advisorClient.getAdvisorAnalytics(advisorUserId, { period: '30d' }, locale),
      advisorClient.getAdvisorAvailability(advisorUserId, locale),
      advisorClient.getAdvisorPricingSettings(advisorUserId, locale)
    ]);

    logger.info('✅ Server action: Advisor dashboard refreshed', { 
      userId: advisorUserId.slice(0, 8),
      overview: !!overview,
      consultations: consultations.consultations.length,
      analytics: !!analytics,
      availability: !!availability,
      settings: !!settings
    });

    return {
      overview,
      consultations,
      analytics,
      availability,
      settings
    };
  } catch (error) {
    logger.error('❌ Server action failed: refreshAdvisorDashboard', error);
    throw error;
  }
}