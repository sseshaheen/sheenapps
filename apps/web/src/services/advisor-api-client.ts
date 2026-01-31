/**
 * Advisor Network API Client
 * Handles communication with Worker advisor network endpoints
 * Extends existing WorkerAPIClient with HMAC authentication
 *
 * SERVER-ONLY MODULE - Do not import in client components
 */

import { isValidTimezone, parseWithFallback } from '@/lib/dashboard-utils';
import { getWorkerClient } from '@/server/services/worker-api-client';
import type {
  AdvisorAnalytics,
  AdvisorAvailability,
  AdvisorConsultationsResponse,
  AdvisorOverview,
  AdvisorPricingSettings,
  AnalyticsFilters,
  ConsultationFilters
} from '@/types/advisor-dashboard';
import {
  AdvisorAnalyticsSchema,
  AdvisorAvailabilitySchema,
  AdvisorConsultationsResponseSchema,
  AdvisorOverviewSchema,
  AdvisorPricingSettingsSchema,
  defaultAdvisorAnalytics,
  defaultAdvisorAvailability,
  defaultAdvisorConsultationsResponse,
  defaultAdvisorOverview,
  defaultAdvisorPricingSettings
} from '@/types/advisor-dashboard';
import type {
  Advisor,
  AdvisorApplication,
  AdvisorApplicationRequest,
  AdvisorBookingError,
  AdvisorEarnings,
  AdvisorNetworkError,
  AdvisorSearchRequest,
  AdvisorSearchResponse,
  BookConsultationRequest,
  BookConsultationResponse,
  Consultation,
  LocalizedPricing
} from '@/types/advisor-network';
import { InsufficientBalanceError, WorkerAPIError } from '@/types/worker-api';
import { logger } from '@/utils/logger';
import 'server-only';

export class AdvisorAPIClient {
  private workerClient = getWorkerClient();

  // ==========================================
  // Public APIs (No Authentication Required)
  // ==========================================

  /**
   * Get platform consultation pricing for a locale (optionally for specific advisor)
   */
  async getConsultationPricing(locale = 'en', advisorUserId?: string): Promise<LocalizedPricing> {
    try {
      logger.info('📊 Fetching consultation pricing', { locale, advisorUserId });

      const queryParams = new URLSearchParams({ locale: locale });
      if (advisorUserId) {
        queryParams.set('advisor_user_id', advisorUserId);
      }

      const response = await this.workerClient.get<any>(
        `/api/v1/consultations/pricing?${queryParams.toString()}`,
        {
          'x-sheen-locale': locale
        }
      );

      logger.info('🔍 Raw pricing response:', response);

      // Transform Worker API response format to our expected format
      const transformedResponse: LocalizedPricing = {
        currency: response.currency || 'USD',
        locale: locale,
        advisor_pricing_model: response.advisor_pricing_model,
        platform_fee_percentage: response.platform_fee_percentage,
        free_consultations_available: response.free_consultations_available,
        prices: {
          duration_15: { amount_cents: 0, display: '', is_free: false },
          duration_30: { amount_cents: 0, display: '', is_free: false },
          duration_60: { amount_cents: 0, display: '', is_free: false }
        }
      };

      if (response.pricing) {
        // Transform from {"15": {price_cents, price_display}} to {"duration_15": {amount_cents, display}}
        Object.entries(response.pricing).forEach(([duration, priceInfo]: [string, any]) => {
          const isFree = response.free_consultations_available?.[duration] === true;
          transformedResponse.prices[`duration_${duration}`] = {
            amount_cents: isFree ? 0 : priceInfo.price_cents,
            display: isFree ? this.getLocalizedFreeText(locale) : priceInfo.price_display,
            is_free: isFree
          };
        });
      }

      logger.info('✅ Consultation pricing transformed', {
        locale,
        advisorUserId,
        currency: transformedResponse.currency,
        advisor_pricing_model: transformedResponse.advisor_pricing_model,
        prices: Object.keys(transformedResponse.prices).length,
        priceKeys: Object.keys(transformedResponse.prices),
        freeConsultations: transformedResponse.free_consultations_available
      });

      return transformedResponse;
    } catch (error) {
      logger.error('❌ Failed to fetch consultation pricing', error);
      throw this.handleAdvisorError(error, 'PRICING_FETCH_FAILED');
    }
  }

  /**
   * Search for available advisors
   */
  async searchAdvisors(request: AdvisorSearchRequest): Promise<AdvisorSearchResponse> {
    try {
      logger.info('🔍 Searching advisors', request);

      const queryParams = new URLSearchParams();
      if (request.skills?.length) queryParams.set('skills', request.skills.join(','));
      if (request.specialties?.length) queryParams.set('specialties', request.specialties.join(','));
      if (request.languages?.length) queryParams.set('languages', request.languages.join(','));
      if (request.rating_min) queryParams.set('rating_min', request.rating_min.toString());
      if (request.available_only) queryParams.set('available_only', 'true');
      if (request.limit) queryParams.set('limit', request.limit.toString());
      if (request.offset) queryParams.set('offset', request.offset.toString());

      const path = `/api/v1/advisors/search${queryParams.toString() ? `?${queryParams}` : ''}`;
      const response = await this.workerClient.get<AdvisorSearchResponse>(path);

      logger.info('✅ Advisors found', {
        count: response.advisors.length,
        total: response.total,
        hasMore: response.has_more
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to search advisors', error);
      throw this.handleAdvisorError(error, 'ADVISOR_SEARCH_FAILED');
    }
  }

  /**
   * Get specific advisor profile
   */
  async getAdvisor(advisorUserId: string, locale = 'en'): Promise<Advisor> {
    try {
      logger.info('👤 Fetching advisor profile', { advisorUserId, locale });

      // Add locale parameter as backend team specified: ?lang=ar
      const queryParams = new URLSearchParams({ lang: locale });
      const url = `/api/v1/advisors/${encodeURIComponent(advisorUserId)}?${queryParams.toString()}`;


      const response = await this.workerClient.get<any>(
        url,
        {
          'x-sheen-locale': locale
        }
      );

      // Handle wrapped response structure from backend
      const advisorData = response.advisor || response;

      logger.info('✅ Advisor profile fetched', {
        advisorUserId,
        locale,
        name: advisorData.display_name,
        rating: advisorData.rating,
        reviewCount: advisorData.review_count,
        languages: advisorData.languages,
        responseLanguage: response.language
      });

      return advisorData;
    } catch (error) {
      logger.error('❌ Failed to fetch advisor profile', error);
      throw this.handleAdvisorError(error, 'ADVISOR_FETCH_FAILED');
    }
  }

  // ==========================================
  // Authenticated APIs (HMAC Signature Required)
  // ==========================================

  /**
   * Submit advisor application
   */
  async submitAdvisorApplication(
    request: AdvisorApplicationRequest,
    userId: string
  ): Promise<{ application_id: string; status: string }> {
    try {
      logger.info('📝 Submitting advisor application', {
        userId: userId.slice(0, 8),
        name: request.display_name,
        skills: request.skills.length,
        specialties: request.specialties.length
      });

      const response = await this.workerClient.postWithoutCorrelation(
        '/api/v1/advisors/apply',
        request,
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId)
        }
      ) as { application_id: string; status: string };

      logger.info('✅ Advisor application submitted', {
        userId: userId.slice(0, 8),
        applicationId: response.application_id
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to submit advisor application', error);
      throw this.handleAdvisorError(error, 'APPLICATION_SUBMIT_FAILED');
    }
  }

  /**
   * Get advisor's own profile
   */
  async getAdvisorProfile(userId: string): Promise<Advisor> {
    try {
      logger.info('👤 Fetching advisor own profile', { userId: userId.slice(0, 8) });

      const response = await this.workerClient.get<Advisor>(
        '/api/v1/advisors/profile',
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId)
        }
      );

      logger.info('✅ Advisor profile fetched', {
        userId: userId.slice(0, 8),
        name: response.display_name,
        status: response.approval_status
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to fetch advisor profile', error);
      throw this.handleAdvisorError(error, 'ADVISOR_PROFILE_FETCH_FAILED');
    }
  }

  /**
   * Update advisor profile
   */
  async updateAdvisorProfile(
    updates: Partial<Advisor>,
    userId: string
  ): Promise<Advisor> {
    try {
      logger.info('✏️ Updating advisor profile', {
        userId: userId.slice(0, 8),
        fields: Object.keys(updates)
      });

      const response = await this.workerClient.request<Advisor>(
        '/api/v1/advisors/profile',
        {
          method: 'PUT',
          body: JSON.stringify(updates),
          headers: {
            'x-sheen-user-id': userId,
            'x-sheen-claims': this.createUserClaims(userId)
          }
        }
      );

      logger.info('✅ Advisor profile updated', {
        userId: userId.slice(0, 8),
        name: response.display_name
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to update advisor profile', error);
      throw this.handleAdvisorError(error, 'ADVISOR_PROFILE_UPDATE_FAILED');
    }
  }

  /**
   * Update advisor booking availability status
   */
  async updateBookingStatus(
    isAcceptingBookings: boolean,
    userId: string
  ): Promise<{ success: boolean; is_accepting_bookings: boolean }> {
    try {
      logger.info('🔄 Updating advisor booking status', {
        userId: userId.slice(0, 8),
        acceptingBookings: isAcceptingBookings
      });

      const response = await this.workerClient.request(
        '/api/v1/advisors/booking-status',
        {
          method: 'PUT',
          body: JSON.stringify({ is_accepting_bookings: isAcceptingBookings }),
          headers: {
            'x-sheen-user-id': userId,
            'x-sheen-claims': this.createUserClaims(userId)
          }
        }
      ) as { success: boolean; is_accepting_bookings: boolean };

      logger.info('✅ Advisor booking status updated', {
        userId: userId.slice(0, 8),
        status: response.is_accepting_bookings
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to update advisor booking status', error);
      throw this.handleAdvisorError(error, 'BOOKING_STATUS_UPDATE_FAILED');
    }
  }

  /**
   * Get advisor earnings summary
   */
  async getAdvisorEarnings(userId: string): Promise<AdvisorEarnings> {
    try {
      logger.info('💰 Fetching advisor earnings', { userId: userId.slice(0, 8) });

      const response = await this.workerClient.get<AdvisorEarnings>(
        '/api/v1/advisors/earnings',
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId)
        }
      );

      logger.info('✅ Advisor earnings fetched', {
        userId: userId.slice(0, 8),
        currentMonth: response.formatted_current_month,
        consultations: response.consultations_this_month
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to fetch advisor earnings', error);
      throw this.handleAdvisorError(error, 'EARNINGS_FETCH_FAILED');
    }
  }

  /**
   * Book a consultation with payment
   */
  async bookConsultation(
    request: BookConsultationRequest,
    userId: string
  ): Promise<BookConsultationResponse> {
    try {
      logger.info('📅 Booking consultation', {
        userId: userId.slice(0, 8),
        advisorId: request.advisor_user_id,
        duration: request.duration_minutes,
        projectId: request.project_id
      });

      const response = await this.workerClient.postWithoutCorrelation(
        '/api/v1/consultations/book',
        request,
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId),
          'x-sheen-locale': request.locale || 'en'
        }
      ) as BookConsultationResponse;

      logger.info('✅ Consultation booked', {
        userId: userId.slice(0, 8),
        consultationId: response.consultation_id,
        requiresPayment: response.requires_payment,
        amount: response.total_amount_cents
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to book consultation', error);

      // Handle specific booking errors
      if (error instanceof InsufficientBalanceError) {
        // @ts-expect-error - Backend response shape differs from type definition - AdvisorBookingError class instantiation
        throw new AdvisorBookingError(
          'INSUFFICIENT_BALANCE',
          'Insufficient credits to book consultation. Please add more credits.',
          error.data
        );
      }

      throw this.handleAdvisorError(error, 'CONSULTATION_BOOKING_FAILED');
    }
  }

  /**
   * Get consultation details
   */
  async getConsultation(
    consultationId: string,
    userId: string
  ): Promise<Consultation> {
    try {
      logger.info('📋 Fetching consultation details', {
        userId: userId.slice(0, 8),
        consultationId
      });

      const response = await this.workerClient.get<Consultation>(
        `/api/v1/consultations/${encodeURIComponent(consultationId)}`,
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId)
        }
      );

      logger.info('✅ Consultation details fetched', {
        userId: userId.slice(0, 8),
        consultationId,
        status: response.status,
        duration: response.duration_minutes
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to fetch consultation details', error);
      throw this.handleAdvisorError(error, 'CONSULTATION_FETCH_FAILED');
    }
  }

  /**
   * Cancel a consultation
   */
  async cancelConsultation(
    consultationId: string,
    reason: string,
    userId: string
  ): Promise<{
    success: boolean;
    refund_issued: boolean;
    refund_amount_cents?: number;
    message: string;
  }> {
    try {
      logger.info('❌ Cancelling consultation', {
        userId: userId.slice(0, 8),
        consultationId,
        reason
      });

      const response = await this.workerClient.request(
        `/api/v1/consultations/${encodeURIComponent(consultationId)}/cancel`,
        {
          method: 'PUT',
          body: JSON.stringify({ reason }),
          headers: {
            'x-sheen-user-id': userId,
            'x-sheen-claims': this.createUserClaims(userId)
          }
        }
      ) as {
        success: boolean;
        refund_issued: boolean;
        refund_amount_cents?: number;
        message: string;
      };

      logger.info('✅ Consultation cancelled', {
        userId: userId.slice(0, 8),
        consultationId,
        refundIssued: response.refund_issued,
        refundAmount: response.refund_amount_cents
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to cancel consultation', error);
      throw this.handleAdvisorError(error, 'CONSULTATION_CANCEL_FAILED');
    }
  }

  /**
   * Submit consultation review
   */
  async submitConsultationReview(
    consultationId: string,
    review: {
      rating: number;
      review_text?: string;
      expertise_rating?: number;
      communication_rating?: number;
      helpfulness_rating?: number;
    },
    userId: string
  ): Promise<{ success: boolean; review_id: string }> {
    try {
      logger.info('⭐ Submitting consultation review', {
        userId: userId.slice(0, 8),
        consultationId,
        rating: review.rating
      });

      const response = await this.workerClient.postWithoutCorrelation(
        `/api/v1/consultations/${encodeURIComponent(consultationId)}/review`,
        review,
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId)
        }
      ) as { success: boolean; review_id: string };

      logger.info('✅ Consultation review submitted', {
        userId: userId.slice(0, 8),
        consultationId,
        reviewId: response.review_id
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to submit consultation review', error);
      throw this.handleAdvisorError(error, 'REVIEW_SUBMIT_FAILED');
    }
  }

  // ==========================================
  // Dashboard APIs (Authenticated Advisors Only)
  // ==========================================

  /**
   * Get advisor dashboard overview
   */
  async getAdvisorOverview(
    userId: string,
    locale = 'en'
  ): Promise<AdvisorOverview> {
    try {
      logger.info('📊 Fetching advisor dashboard overview', {
        userId: userId.slice(0, 8),
        locale
      });

      const response = await this.workerClient.get(
        '/api/v1/advisors/me/overview',
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId),
          'x-sheen-locale': locale
        }
      );

      // Parse with Zod and graceful fallback
      const parsedData = parseWithFallback(
        AdvisorOverviewSchema,
        response,
        defaultAdvisorOverview,
        'getAdvisorOverview'
      );

      logger.info('✅ Advisor overview fetched', {
        userId: userId.slice(0, 8),
        locale,
        consultations: parsedData.current_month.total_consultations,
        earnings: parsedData.current_month.earnings_cents
      });

      return parsedData;
    } catch (error) {
      logger.error('❌ Failed to fetch advisor overview', error);
      throw this.handleAdvisorError(error, 'OVERVIEW_FETCH_FAILED');
    }
  }

  /**
   * Get advisor consultations with cursor-based pagination
   */
  async getAdvisorConsultations(
    userId: string,
    filters: ConsultationFilters = {},
    locale = 'en'
  ): Promise<AdvisorConsultationsResponse> {
    try {
      logger.info('📅 Fetching advisor consultations', {
        userId: userId.slice(0, 8),
        filters,
        locale
      });

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (filters.status) queryParams.set('status', filters.status);
      if (filters.limit) queryParams.set('limit', filters.limit.toString());
      if (filters.cursor) queryParams.set('cursor', filters.cursor);

      const path = `/api/v1/advisors/me/consultations${queryParams.toString() ? `?${queryParams}` : ''}`;
      const response = await this.workerClient.get(
        path,
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId),
          'x-sheen-locale': locale
        }
      );

      // Parse with Zod and graceful fallback
      const parsedData = parseWithFallback(
        AdvisorConsultationsResponseSchema,
        response,
        defaultAdvisorConsultationsResponse,
        'getAdvisorConsultations'
      );

      logger.info('✅ Advisor consultations fetched', {
        userId: userId.slice(0, 8),
        count: parsedData.consultations.length,
        hasMore: parsedData.pagination.has_more,
        total: parsedData.pagination.total
      });

      return parsedData;
    } catch (error) {
      logger.error('❌ Failed to fetch advisor consultations', error);
      throw this.handleAdvisorError(error, 'CONSULTATIONS_FETCH_FAILED');
    }
  }

  /**
   * Get advisor analytics for specified period
   */
  async getAdvisorAnalytics(
    userId: string,
    filters: AnalyticsFilters = { period: '30d' },
    locale = 'en'
  ): Promise<AdvisorAnalytics> {
    try {
      logger.info('📈 Fetching advisor analytics', {
        userId: userId.slice(0, 8),
        period: filters.period,
        locale
      });

      const queryParams = new URLSearchParams();
      if (filters.period) queryParams.set('period', filters.period);

      const path = `/api/v1/advisors/me/analytics${queryParams.toString() ? `?${queryParams}` : ''}`;
      const response = await this.workerClient.get(
        path,
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId),
          'x-sheen-locale': locale
        }
      );

      // Parse with Zod and graceful fallback
      const parsedData = parseWithFallback(
        AdvisorAnalyticsSchema,
        response,
        defaultAdvisorAnalytics,
        'getAdvisorAnalytics'
      );

      logger.info('✅ Advisor analytics fetched', {
        userId: userId.slice(0, 8),
        period: filters.period,
        totalConsultations: parsedData.consultations.total,
        totalEarnings: parsedData.earnings.total_cents,
        averageRating: parsedData.performance.reviews.average
      });

      return parsedData;
    } catch (error) {
      logger.error('❌ Failed to fetch advisor analytics', error);
      throw this.handleAdvisorError(error, 'ANALYTICS_FETCH_FAILED');
    }
  }

  /**
   * Get advisor availability settings
   */
  async getAdvisorAvailability(
    userId: string,
    locale = 'en'
  ): Promise<AdvisorAvailability> {
    try {
      logger.info('🗓️ Fetching advisor availability', {
        userId: userId.slice(0, 8),
        locale
      });

      const response = await this.workerClient.get(
        '/api/v1/advisors/me/availability',
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId),
          'x-sheen-locale': locale
        }
      );

      // Parse with Zod and graceful fallback
      const parsedData = parseWithFallback(
        AdvisorAvailabilitySchema,
        response,
        defaultAdvisorAvailability,
        'getAdvisorAvailability'
      );

      // Additional timezone validation
      if (!isValidTimezone(parsedData.timezone)) {
        logger.warn('Invalid timezone in availability data', {
          userId: userId.slice(0, 8),
          timezone: parsedData.timezone
        });
        parsedData.timezone = 'UTC'; // Fallback to UTC
      }

      logger.info('✅ Advisor availability fetched', {
        userId: userId.slice(0, 8),
        timezone: parsedData.timezone,
        blackoutDates: parsedData.blackout_dates.length,
        minNoticeHours: parsedData.booking_preferences.min_notice_hours
      });

      return parsedData;
    } catch (error) {
      logger.error('❌ Failed to fetch advisor availability', error);
      throw this.handleAdvisorError(error, 'AVAILABILITY_FETCH_FAILED');
    }
  }

  /**
   * Update advisor availability settings
   */
  async updateAdvisorAvailability(
    availability: AdvisorAvailability,
    userId: string,
    locale = 'en'
  ): Promise<AdvisorAvailability> {
    try {
      logger.info('🔄 Updating advisor availability', {
        userId: userId.slice(0, 8),
        timezone: availability.timezone,
        blackoutDates: availability.blackout_dates.length,
        locale
      });

      // Validate timezone before sending
      if (!isValidTimezone(availability.timezone)) {
        throw new Error(`Invalid timezone: ${availability.timezone}`);
      }

      // Validate time slots using dashboard utils
      const { hasTimeSlotOverlap } = await import('@/lib/dashboard-utils');
      for (const [day, slots] of Object.entries(availability.weekly_schedule)) {
        if (slots && hasTimeSlotOverlap(slots)) {
          throw new Error(`Overlapping time slots found for ${day}`);
        }
      }

      const response = await this.workerClient.request(
        '/api/v1/advisors/me/availability',
        {
          method: 'PUT',
          body: JSON.stringify(availability),
          headers: {
            'x-sheen-user-id': userId,
            'x-sheen-claims': this.createUserClaims(userId),
            'x-sheen-locale': locale
          }
        }
      );

      // Parse with Zod and graceful fallback
      const parsedData = parseWithFallback(
        AdvisorAvailabilitySchema,
        response,
        availability, // Use input as fallback
        'updateAdvisorAvailability'
      );

      logger.info('✅ Advisor availability updated', {
        userId: userId.slice(0, 8),
        timezone: parsedData.timezone
      });

      return parsedData;
    } catch (error) {
      logger.error('❌ Failed to update advisor availability', error);
      throw this.handleAdvisorError(error, 'AVAILABILITY_UPDATE_FAILED');
    }
  }

  /**
   * Get advisor pricing settings
   */
  async getAdvisorPricingSettings(
    userId: string,
    locale = 'en'
  ): Promise<AdvisorPricingSettings> {
    try {
      logger.info('💰 Fetching advisor pricing settings', {
        userId: userId.slice(0, 8),
        locale
      });

      const response = await this.workerClient.get(
        '/api/v1/advisors/me/pricing-settings',
        {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createUserClaims(userId),
          'x-sheen-locale': locale
        }
      );

      // Parse with Zod and graceful fallback
      const parsedData = parseWithFallback(
        AdvisorPricingSettingsSchema,
        response,
        defaultAdvisorPricingSettings,
        'getAdvisorPricingSettings'
      );

      logger.info('✅ Advisor pricing settings fetched', {
        userId: userId.slice(0, 8),
        pricingModel: parsedData.pricing_model,
        freeDurations: Object.entries(parsedData.free_consultation_durations)
          .filter(([_, enabled]) => enabled)
          .map(([duration]) => `${duration}min`)
      });

      return parsedData;
    } catch (error) {
      logger.error('❌ Failed to fetch advisor pricing settings', error);
      throw this.handleAdvisorError(error, 'PRICING_SETTINGS_FETCH_FAILED');
    }
  }

  /**
   * Update advisor pricing settings
   */
  async updateAdvisorPricingSettings(
    settings: AdvisorPricingSettings,
    userId: string,
    locale = 'en'
  ): Promise<AdvisorPricingSettings> {
    try {
      logger.info('🔄 Updating advisor pricing settings', {
        userId: userId.slice(0, 8),
        pricingModel: settings.pricing_model,
        locale
      });

      // Validate duration keys (only 15, 30, 60 allowed)
      const validDurations = ['15', '30', '60'];
      const providedDurations = Object.keys(settings.free_consultation_durations);
      const invalidDurations = providedDurations.filter(d => !validDurations.includes(d));

      if (invalidDurations.length > 0) {
        throw new Error(`Invalid consultation durations: ${invalidDurations.join(', ')}. Only 15, 30, 60 minutes allowed.`);
      }

      const response = await this.workerClient.request(
        '/api/v1/advisors/me/pricing-settings',
        {
          method: 'PUT',
          body: JSON.stringify(settings),
          headers: {
            'x-sheen-user-id': userId,
            'x-sheen-claims': this.createUserClaims(userId),
            'x-sheen-locale': locale
          }
        }
      );

      // Parse with Zod and graceful fallback
      const parsedData = parseWithFallback(
        AdvisorPricingSettingsSchema,
        response,
        settings, // Use input as fallback
        'updateAdvisorPricingSettings'
      );

      logger.info('✅ Advisor pricing settings updated', {
        userId: userId.slice(0, 8),
        pricingModel: parsedData.pricing_model
      });

      return parsedData;
    } catch (error) {
      logger.error('❌ Failed to update advisor pricing settings', error);
      throw this.handleAdvisorError(error, 'PRICING_SETTINGS_UPDATE_FAILED');
    }
  }

  // ==========================================
  // Admin APIs (Admin Users Only)
  // ==========================================

  /**
   * Get pending advisor applications (Admin only)
   */
  async getAdvisorApplications(
    status?: 'pending' | 'approved' | 'rejected',
    userId?: string
  ): Promise<AdvisorApplication[]> {
    try {
      logger.info('📋 Fetching advisor applications', { status, adminUserId: userId?.slice(0, 8) });

      const queryParams = new URLSearchParams();
      if (status) queryParams.set('status', status);

      const path = `/api/v1/admin/advisor-applications${queryParams.toString() ? `?${queryParams}` : ''}`;
      const response = await this.workerClient.get<AdvisorApplication[]>(
        path,
        userId ? {
          'x-sheen-user-id': userId,
          'x-sheen-claims': this.createAdminClaims(userId)
        } : {}
      );

      logger.info('✅ Advisor applications fetched', {
        count: response.length,
        status
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to fetch advisor applications', error);
      throw this.handleAdvisorError(error, 'APPLICATIONS_FETCH_FAILED');
    }
  }

  /**
   * Approve or reject advisor application (Admin only)
   */
  async reviewAdvisorApplication(
    advisorId: string,
    action: 'approve' | 'reject',
    adminNotes?: string,
    userId?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('👨‍⚖️ Reviewing advisor application', {
        advisorId,
        action,
        adminUserId: userId?.slice(0, 8)
      });

      const response = await this.workerClient.request(
        `/api/v1/admin/advisors/${encodeURIComponent(advisorId)}/approve`,
        {
          method: 'PUT',
          body: JSON.stringify({
            action,
            admin_notes: adminNotes
          }),
          headers: userId ? {
            'x-sheen-user-id': userId,
            'x-sheen-claims': this.createAdminClaims(userId)
          } : {}
        }
      ) as { success: boolean; message: string };

      logger.info('✅ Advisor application reviewed', {
        advisorId,
        action,
        success: response.success
      });

      return response;
    } catch (error) {
      logger.error('❌ Failed to review advisor application', error);
      throw this.handleAdvisorError(error, 'APPLICATION_REVIEW_FAILED');
    }
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  /**
   * Create user claims for HMAC authentication
   * Simplified version for advisor network
   */
  private createUserClaims(userId: string): string {
    const claims = {
      userId,
      roles: ['user'],
      issued: Math.floor(Date.now() / 1000),
      expires: Math.floor(Date.now() / 1000) + 300 // 5 minutes
    };

    return Buffer.from(JSON.stringify(claims)).toString('base64');
  }

  /**
   * Create admin claims for HMAC authentication
   */
  private createAdminClaims(userId: string): string {
    const claims = {
      userId,
      roles: ['admin'],
      issued: Math.floor(Date.now() / 1000),
      expires: Math.floor(Date.now() / 1000) + 300 // 5 minutes
    };

    return Buffer.from(JSON.stringify(claims)).toString('base64');
  }

  /**
   * Get localized "Free" text based on locale
   */
  private getLocalizedFreeText(locale: string): string {
    const freeTranslations: Record<string, string> = {
      'ar': 'مجاني',
      'ar-eg': 'مجاني',
      'ar-sa': 'مجاني',
      'ar-ae': 'مجاني',
      'en': 'Free',
      'es': 'Gratis',
      'fr': 'Gratuit',
      'fr-ma': 'Gratuit',
      'de': 'Kostenlos'
    };

    return freeTranslations[locale] || 'Free';
  }

  /**
   * Handle and transform advisor network specific errors
   */
  private handleAdvisorError(error: unknown, fallbackCode: string): AdvisorNetworkError {
    if (error instanceof WorkerAPIError) {
      return {
        code: error.code || fallbackCode,
        message: error.message,
        details: error.data
      };
    }

    if (error instanceof Error) {
      return {
        code: fallbackCode,
        message: error.message
      };
    }

    return {
      code: fallbackCode,
      message: 'An unexpected error occurred'
    };
  }
}

// Export singleton instance
let advisorClient: AdvisorAPIClient | null = null;

export const getAdvisorClient = (): AdvisorAPIClient => {
  if (typeof window !== 'undefined') {
    throw new Error('AdvisorAPIClient cannot be used in browser context. Use server actions instead.');
  }

  if (!advisorClient) {
    advisorClient = new AdvisorAPIClient();
  }

  return advisorClient;
};

// Default export for convenience
export default AdvisorAPIClient;
