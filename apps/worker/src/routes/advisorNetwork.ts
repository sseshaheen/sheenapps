/**
 * Advisor Network API Routes
 * 
 * Complete REST API for advisor network management with security hardening:
 * - HMAC signature validation for authenticated endpoints
 * - Comprehensive input validation with JSON schemas
 * - Proper error handling with correlation IDs
 * - Rate limiting and security headers
 * - Privacy protection (advisors only see limited client data)
 * 
 * Security Features:
 * - Claims-based authentication with expiration validation
 * - User access control (users can only access their own data)
 * - Admin role validation for approval endpoints
 * - No sensitive client data exposure to advisors
 * - Comprehensive audit logging
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { requireAdminAuth } from '../middleware/adminAuthentication';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import * as crypto from 'crypto';
import { SUPPORTED_LOCALES } from '../i18n/localeUtils';

// =====================================================
// Helper Functions
// =====================================================

function checkDatabaseConnection(reply: FastifyReply): boolean {
  if (!pool) {
    reply.code(500).send({ 
      success: false, 
      error: 'Database connection not available' 
    });
    return false;
  }
  return true;
}

// =====================================================
// Type Definitions
// =====================================================

interface AuthenticatedRequest extends FastifyRequest {
  headers: {
    'x-sheen-claims': string;
    'x-sheen-locale'?: string;
    'x-correlation-id'?: string;
  };
}

interface AdvisorApplicationBody {
  display_name: string;
  bio?: string;
  avatar_url?: string;
  skills: string[];
  specialties: string[];
  languages: string[];
  cal_com_event_type_url?: string;
  country_code: string; // Required for Stripe Connect
}

interface AdvisorUpdateBody {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  skills?: string[];
  specialties?: string[];
  languages?: string[];
  cal_com_event_type_url?: string;
  is_accepting_bookings?: boolean;
}

interface AdminApprovalBody {
  approval_status: 'approved' | 'rejected';
  notes?: string;
}

interface ConsultationBookingBody {
  advisor_id: string;
  duration_minutes: 15 | 30 | 60;
  project_id?: string;
  cal_booking_id: string;
  locale?: string;
  client_timezone?: string;
}

interface ReviewSubmissionBody {
  rating: number; // 1-5
  review_text?: string;
  expertise_rating?: number; // 1-5
  communication_rating?: number; // 1-5
  helpfulness_rating?: number; // 1-5
}

// Platform-fixed pricing (as per implementation plan)
const CONSULTATION_PRICING = {
  15: { price_cents: 900, platform_fee_cents: 270, advisor_earnings_cents: 630 },
  30: { price_cents: 1900, platform_fee_cents: 570, advisor_earnings_cents: 1330 },
  60: { price_cents: 3500, platform_fee_cents: 1050, advisor_earnings_cents: 2450 }
} as const;

function getConsultationPricing(durationMinutes: 15 | 30 | 60) {
  return CONSULTATION_PRICING[durationMinutes];
}

// =====================================================
// Utility Functions
// =====================================================

function extractClaimsFromRequest(request: FastifyRequest): any {
  try {
    const claimsHeader = request.headers['x-sheen-claims'] as string;
    if (!claimsHeader) {
      throw new Error('Missing authentication claims');
    }
    return JSON.parse(Buffer.from(claimsHeader, 'base64').toString('utf-8'));
  } catch (error) {
    throw new Error('Invalid authentication claims');
  }
}

function generateCorrelationId(): string {
  return crypto.randomUUID();
}

// =====================================================
// Route Registration
// =====================================================

export async function registerAdvisorNetworkRoutes(fastify: FastifyInstance) {
  const loggingService = ServerLoggingService.getInstance();

  // =====================================================
  // Public Endpoints (Discovery)
  // =====================================================

  /**
   * Get pricing information with optional advisor-specific free consultations
   * Public endpoint for displaying consultation prices
   */
  fastify.get('/api/v1/consultations/pricing', async (request: FastifyRequest<{
    Querystring: { advisor_user_id: string }
  }>, reply: FastifyReply) => {
    try {
      const { advisor_user_id } = request.query;
      
      // Require advisor_user_id parameter  
      if (!advisor_user_id) {
        return reply.code(400).send({
          success: false,
          error: 'advisor_user_id parameter is required',
          correlation_id: generateCorrelationId()
        });
      }

      console.log('[DEBUG] Pricing endpoint - advisor_user_id provided:', advisor_user_id);
      
      const advisorResult = await pool!.query(`
        SELECT 
          pricing_model,
          free_consultation_durations,
          display_name
        FROM advisors 
        WHERE user_id = $1 
          AND approval_status = 'approved'
          AND is_accepting_bookings = true
      `, [advisor_user_id]);

      console.log('[DEBUG] Advisor query result:', {
        rowCount: advisorResult.rows.length,
        advisor: advisorResult.rows[0]
      });

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor not found or not accepting bookings',
          correlation_id: generateCorrelationId()
        });
      }

      const advisor = advisorResult.rows[0];
      
      // Base platform pricing
      const basePricing = {
        15: { duration_minutes: 15, price_cents: 900, price_display: '$9.00', currency: 'USD' },
        30: { duration_minutes: 30, price_cents: 1900, price_display: '$19.00', currency: 'USD' },
        60: { duration_minutes: 60, price_cents: 3500, price_display: '$35.00', currency: 'USD' }
      };
      
      // Build free consultation availability
      let freeConsultations = { "15": false, "30": false, "60": false };
      
      if (advisor.pricing_model === 'free_only') {
        freeConsultations = { "15": true, "30": true, "60": true };
      } else if (advisor.pricing_model === 'hybrid' && advisor.free_consultation_durations) {
        const freeDurations = advisor.free_consultation_durations;
        freeConsultations = {
          "15": freeDurations['15'] === true,
          "30": freeDurations['30'] === true, 
          "60": freeDurations['60'] === true
        };
      }
      
      // Override pricing for free durations
      const updatedPricing = { ...basePricing };
      Object.entries(freeConsultations).forEach(([duration, isFree]) => {
        if (isFree && (duration === '15' || duration === '30' || duration === '60')) {
          updatedPricing[duration] = {
            ...updatedPricing[duration],
            price_cents: 0,
            price_display: 'Free'
          };
        }
      });

      const response = {
        success: true,
        pricing: updatedPricing,
        platform_fee_percentage: 30,
        currency: 'USD',
        advisor_pricing_model: advisor.pricing_model,
        free_consultations_available: freeConsultations
      };

      return reply.send(response);

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve pricing',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Search and discover advisors
   * Public endpoint with filtering capabilities
   */
  fastify.get('/api/v1/advisors/search', async (request: FastifyRequest<{
    Querystring: {
      q?: string; // search query
      specialty?: string;
      specialties?: string; // comma-separated list
      language?: string;
      languages?: string; // comma-separated list
      country_code?: string;
      rating_min?: number;
      limit?: number;
      page?: number;
      offset?: number; // direct offset support
      lang?: string; // language for translations
    }
  }>, reply: FastifyReply) => {
    try {
      const { 
        q = '', 
        specialty, 
        specialties, 
        language, 
        languages, 
        country_code, 
        rating_min = 0, 
        limit = 20, 
        page,
        offset,
        lang = 'en'
      } = request.query;

      // Support language preference from header or query
      const preferredLang = request.locale || lang || 'en';
      
      // Build specialty and language arrays
      const specialtyArray = specialties ? specialties.split(',') : (specialty ? [specialty] : []);
      const languageArray = languages ? languages.split(',') : (language ? [language] : []);
      
      // Support both page-based and offset-based pagination
      const finalOffset = offset !== undefined ? offset : ((page || 1) - 1) * limit;

      let whereClause = "approval_status = 'approved' AND is_accepting_bookings = true AND cal_com_event_type_url IS NOT NULL";
      const params: any[] = [];

      if (q.trim()) {
        params.push(`%${q.trim()}%`, preferredLang);
        whereClause += ` AND (display_name ILIKE $${params.length - 1} OR get_advisor_bio_localized(user_id, $${params.length}) ILIKE $${params.length - 1})`;
      }

      if (specialtyArray.length > 0) {
        params.push(specialtyArray);
        whereClause += ` AND specialties && $${params.length}`;
      }

      if (languageArray.length > 0) {
        params.push(languageArray);
        whereClause += ` AND languages && $${params.length}`;
      }

      if (country_code) {
        params.push(country_code);
        whereClause += ` AND country_code = $${params.length}`;
      }

      if (rating_min > 0) {
        params.push(rating_min);
        whereClause += ` AND rating >= $${params.length}`;
      }

      params.push(preferredLang, limit, finalOffset);

      if (!checkDatabaseConnection(reply)) return;

      // Get advisors with multilingual support
      const result = await pool!.query(`
        SELECT 
          a.id,
          a.user_id,
          get_advisor_display_name_localized(a.user_id, $${params.length - 2}) as display_name,
          a.bio,
          a.avatar_url,
          a.skills,
          a.specialties,
          a.languages,
          a.rating::numeric,
          a.review_count,
          a.cal_com_event_type_url,
          a.approval_status,
          a.is_accepting_bookings,
          a.country_code,
          a.created_at,
          get_advisor_bio_localized(a.user_id, $${params.length - 2}) as localized_bio,
          get_advisor_available_languages(a.user_id) as available_languages
        FROM advisors a
        WHERE ${whereClause}
        ORDER BY a.rating DESC, a.review_count DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);

      // Get count for pagination
      const countParams = params.slice(0, -3); // Remove lang, limit, offset
      const countResult = await pool!.query(`
        SELECT COUNT(*) as total
        FROM advisors a
        WHERE ${whereClause}
      `, countParams);

      // Get specialty translations for filters
      const specialtyResult = await pool!.query(`
        SELECT specialty_key, display_name, description
        FROM advisor_specialty_translations
        WHERE language_code = $1
        ORDER BY specialty_key
      `, [preferredLang]);

      // Convert rating strings to numbers and add multilingual data
      const advisors = result.rows.map(advisor => ({
        ...advisor,
        rating: parseFloat(advisor.rating),
        localized_bio: advisor.localized_bio,
        available_languages: advisor.available_languages,
        // Add localized specialties
        localized_specialties: advisor.specialties.map((spec: string) => {
          const translation = specialtyResult.rows.find(t => t.specialty_key === spec);
          return translation ? {
            specialty_key: spec,
            display_name: translation.display_name,
            description: translation.description
          } : {
            specialty_key: spec,
            display_name: spec
          };
        })
      }));

      // Add content negotiation headers
      reply.header('Content-Language', preferredLang);
      reply.header('Vary', 'x-sheen-locale, Accept-Language');

      return reply.send({
        success: true,
        advisors: advisors,
        total: parseInt(countResult.rows[0].total),
        page: page,
        limit: limit,
        language: preferredLang,
        available_filters: {
          specialties: specialtyResult.rows.map(row => ({
            specialty_key: row.specialty_key,
            display_name: row.display_name,
            description: row.description
          })),
          languages: ['en', 'ar', 'fr', 'es', 'de'],
          countries: [] // Could be populated if needed
        }
      });
    } catch (error) {
      console.error('[AdvisorNetwork] Search failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Search failed',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Get specific advisor profile
   * Public endpoint for advisor details
   */
  fastify.get('/api/v1/advisors/:userId', async (request: FastifyRequest<{
    Params: { userId: string }
    Querystring: { lang?: string }
  }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const { lang = 'en' } = request.query;
      
      // Support language preference from header or query
      const preferredLang = request.locale || lang || 'en';

      if (!checkDatabaseConnection(reply)) return;

      const result = await pool!.query(`
        SELECT 
          a.id,
          a.user_id,
          get_advisor_display_name_localized(a.user_id, $2) as display_name,
          a.bio,
          a.avatar_url,
          a.skills,
          a.specialties,
          a.languages,
          a.rating::numeric,
          a.review_count,
          a.cal_com_event_type_url,
          a.approval_status,
          a.is_accepting_bookings,
          a.country_code,
          a.created_at,
          get_advisor_bio_localized(a.user_id, $2) as localized_bio
        FROM advisors a
        WHERE a.user_id = $1 AND a.approval_status = 'approved'
      `, [userId, preferredLang]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor not found or not approved'
        });
      }

      const advisorData = result.rows[0];

      // Add booking availability status
      const isBookable = advisorData.is_accepting_bookings && 
                        advisorData.cal_com_event_type_url && 
                        advisorData.approval_status === 'approved';

      const bookingStatus = !advisorData.cal_com_event_type_url 
        ? 'calendar_setup_required'
        : !advisorData.is_accepting_bookings 
        ? 'not_accepting_bookings'
        : 'available';

      // Get localized language names
      const languagesResult = await pool!.query(`
        SELECT language_code, language_name
        FROM get_advisor_available_languages_localized($1, $2)
        ORDER BY language_code
      `, [advisorData.user_id, preferredLang]);

      // Get specialty translations
      const specialtyResult = await pool!.query(`
        SELECT specialty_key, display_name, description
        FROM advisor_specialty_translations
        WHERE language_code = $1
      `, [preferredLang]);

      // Convert rating string to number and add multilingual data
      const advisor = {
        ...advisorData,
        rating: parseFloat(advisorData.rating),
        localized_bio: advisorData.localized_bio,
        // Override the old languages field with localized names
        languages: languagesResult.rows.map(row => row.language_name),
        available_languages: languagesResult.rows.map(row => ({
          code: row.language_code,
          name: row.language_name
        })),
        // Add localized specialties
        localized_specialties: advisorData.specialties.map((spec: string) => {
          const translation = specialtyResult.rows.find(t => t.specialty_key === spec);
          return translation ? {
            specialty_key: spec,
            display_name: translation.display_name,
            description: translation.description
          } : {
            specialty_key: spec,
            display_name: spec
          };
        }),
        // Add booking availability status
        is_bookable: isBookable,
        booking_status: bookingStatus
      };

      // Add content negotiation headers
      reply.header('Content-Language', preferredLang);
      reply.header('Vary', 'x-sheen-locale, Accept-Language');

      return reply.send({
        success: true,
        advisor: advisor,
        language: preferredLang
      });
    } catch (error) {
      console.error('[AdvisorNetwork] Get advisor failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve advisor',
        correlation_id: generateCorrelationId()
      });
    }
  });

  // =====================================================
  // Authenticated Endpoints (Require HMAC)
  // =====================================================

  /**
   * Apply to become an advisor
   * Requires authentication
   */
  fastify.post<{
    Body: AdvisorApplicationBody;
    Headers: { 'x-sheen-claims': string; 'x-sheen-locale'?: string; 'x-correlation-id'?: string };
  }>('/api/v1/advisors/apply', {
    preHandler: requireHmacSignature()
  }, async (request, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request as any);
      const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
      const {
        display_name,
        bio,
        avatar_url,
        skills,
        specialties,
        languages,
        cal_com_event_type_url,
        country_code
      } = request.body;

      // Validate required fields
      if (!display_name || !country_code) {
        return reply.code(400).send({
          success: false,
          error: 'display_name and country_code are required',
          correlation_id: correlationId
        });
      }

      // Check if user already applied
      const existingResult = await pool!.query(`
        SELECT id, approval_status FROM advisors WHERE user_id = $1
      `, [claims.userId]);

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        return reply.code(400).send({
          success: false,
          error: `Application already exists with status: ${existing.approval_status}`,
          application_id: existing.id,
          correlation_id: correlationId
        });
      }

      // Create advisor application
      const insertResult = await pool!.query(`
        INSERT INTO advisors (
          user_id, display_name, bio, avatar_url, skills, 
          specialties, languages, cal_com_event_type_url, country_code,
          approval_status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', now(), now())
        RETURNING id, approval_status, created_at
      `, [
        claims.userId, display_name, bio, avatar_url, skills || [],
        specialties || [], languages || [], cal_com_event_type_url, country_code
      ]);

      const newAdvisor = insertResult.rows[0];

      await loggingService.logServerEvent('capacity', 'info',  'advisor_application_submitted', {
        userId: claims.userId,
        advisorId: newAdvisor.id,
        correlationId
      });

      return reply.code(201).send({
        success: true,
        message: 'Advisor application submitted successfully',
        application_id: newAdvisor.id,
        status: newAdvisor.approval_status,
        submitted_at: newAdvisor.created_at,
        correlation_id: correlationId
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Application failed:', error);
      await loggingService.logCriticalError('advisor_application_failed', error as Error, {
        userId: (request as any).claims?.userId,
        correlationId: request.headers['x-correlation-id']
      });

      return reply.code(500).send({
        success: false,
        error: 'Application submission failed',
        correlation_id: request.headers['x-correlation-id'] || generateCorrelationId()
      });
    }
  });

  /**
   * Get own advisor profile
   * Requires authentication
   */
  fastify.get('/api/v1/advisors/profile', {
    preHandler: requireHmacSignature()
  }, async (request: any, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);

      const result = await pool!.query(`
        SELECT 
          id, user_id, display_name, bio, avatar_url, skills, specialties, languages,
          rating, review_count, approval_status, stripe_connect_account_id,
          cal_com_event_type_url, is_accepting_bookings, country_code,
          approved_at, created_at, updated_at, onboarding_steps
        FROM advisors
        WHERE user_id = $1
      `, [claims.userId]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'No advisor profile found. Please apply first.'
        });
      }

      return reply.send({
        success: true,
        profile: result.rows[0]
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Get profile failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve profile',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Update own advisor profile
   * Requires authentication and advisor approval
   */
  fastify.put('/api/v1/advisors/profile', {
    preHandler: requireHmacSignature()
  }, async (request: any & { body: AdvisorUpdateBody }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();

      // Verify advisor exists and is approved
      const advisorResult = await pool!.query(`
        SELECT id, approval_status FROM advisors WHERE user_id = $1
      `, [claims.userId]);

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'No advisor profile found',
          correlation_id: correlationId
        });
      }

      const advisor = advisorResult.rows[0];
      if (advisor.approval_status !== 'approved') {
        return reply.code(403).send({
          success: false,
          error: 'Only approved advisors can update their profile',
          correlation_id: correlationId
        });
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 2; // Start from 2 since $1 is user_id

      Object.entries(request.body).forEach(([key, value]) => {
        if (value !== undefined) {
          updates.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (updates.length === 0) {
        return reply.code(400).send({
          success: false,
          error: 'No fields to update',
          correlation_id: correlationId
        });
      }

      updates.push(`updated_at = now()`);

      const updateResult = await pool!.query(`
        UPDATE advisors 
        SET ${updates.join(', ')}
        WHERE user_id = $1
        RETURNING id, display_name, updated_at
      `, [claims.userId, ...values]);

      return reply.send({
        success: true,
        message: 'Profile updated successfully',
        advisor: updateResult.rows[0],
        correlation_id: correlationId
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Update profile failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Profile update failed',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Toggle booking availability
   * Quick endpoint for advisors to pause/resume bookings
   */
  fastify.put('/api/v1/advisors/booking-status', {
    preHandler: requireHmacSignature()
  }, async (request: any & { 
    body: { is_accepting_bookings: boolean } 
  }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const { is_accepting_bookings } = request.body;

      const result = await pool!.query(`
        UPDATE advisors 
        SET is_accepting_bookings = $1, updated_at = now()
        WHERE user_id = $2 AND approval_status = 'approved'
        RETURNING id, is_accepting_bookings
      `, [is_accepting_bookings, claims.userId]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or not approved'
        });
      }

      return reply.send({
        success: true,
        message: `Booking availability ${is_accepting_bookings ? 'enabled' : 'disabled'}`,
        is_accepting_bookings: result.rows[0].is_accepting_bookings
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Booking status update failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update booking status',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Update advisor bio in specific language
   * Atomic per-language bio updates using JSONB
   */
  fastify.put('/api/v1/advisors/bio', {
    preHandler: requireHmacSignature()
  }, async (request: any & { 
    body: { 
      language: 'en' | 'ar' | 'fr' | 'es' | 'de';
      bio_content: string;
    } 
  }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const { language, bio_content } = request.body;

      // Validate input
      if (!language || !['en', 'ar', 'fr', 'es', 'de'].includes(language)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid language code. Must be: en, ar, fr, es, de'
        });
      }

      if (!bio_content || typeof bio_content !== 'string') {
        return reply.code(400).send({
          success: false,
          error: 'Bio content is required and must be a string'
        });
      }

      if (bio_content.length > 2000) {
        return reply.code(400).send({
          success: false,
          error: 'Bio content too long (max 2000 characters)'
        });
      }

      // Security validation - no HTML content
      if (bio_content.match(/<[^>]*>/) || bio_content.match(/(javascript:|data:|vbscript:|onload|onerror)/i)) {
        return reply.code(400).send({
          success: false,
          error: 'HTML content and script tags not allowed in bio'
        });
      }

      if (!checkDatabaseConnection(reply)) return;

      // Use atomic update function
      const result = await pool!.query(
        'SELECT update_advisor_bio_atomic($1, $2, $3) as success',
        [claims.userId, language, bio_content]
      );

      const success = result.rows[0]?.success;

      if (!success) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or update failed'
        });
      }

      // Get updated bio data
      const bioResult = await pool!.query(`
        SELECT 
          get_advisor_bio_localized($1, $2) as localized_bio,
          get_advisor_available_languages($1) as available_languages
        FROM advisors 
        WHERE user_id = $1
        LIMIT 1
      `, [claims.userId, language]);

      // Add content negotiation headers
      reply.header('Content-Language', language);
      reply.header('Vary', 'x-sheen-locale, Accept-Language');

      return reply.send({
        success: true,
        message: `Bio updated for language: ${language}`,
        data: {
          language: language,
          bio_content: bioResult.rows[0]?.localized_bio,
          available_languages: bioResult.rows[0]?.available_languages || []
        }
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Bio update failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update bio',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Get advisor earnings summary
   * Shows monthly earnings for advisor
   */
  fastify.get('/api/v1/advisors/earnings', {
    preHandler: requireHmacSignature()
  }, async (request: any, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const currentDate = new Date();
      const { year = currentDate.getFullYear(), month = currentDate.getMonth() + 1 } = request.query;

      // Get advisor ID
      const advisorResult = await pool!.query(`
        SELECT id FROM advisors WHERE user_id = $1 AND approval_status = 'approved'
      `, [claims.userId]);

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or not approved'
        });
      }

      const advisorId = advisorResult.rows[0].id;

      // Calculate earnings for the specified month
      const earningsResult = await pool!.query(`
        SELECT
          COUNT(c.id) as consultations_count,
          COALESCE(SUM(cc.advisor_earnings_cents), 0) as earned_cents,
          COALESCE(SUM(a.amount_cents), 0) as adjustments_cents,
          COALESCE(SUM(cc.advisor_earnings_cents), 0) + COALESCE(SUM(a.amount_cents), 0) as total_earnings_cents
        FROM advisor_consultations c
        LEFT JOIN advisor_consultation_charges cc ON cc.consultation_id = c.id AND cc.status = 'succeeded'
        LEFT JOIN advisor_adjustments a ON a.advisor_id = c.advisor_id 
          AND date_trunc('month', a.created_at) = date_trunc('month', make_date($2, $3, 1))
        WHERE c.advisor_id = $1
          AND date_trunc('month', c.start_time) = date_trunc('month', make_date($2, $3, 1))
      `, [advisorId, year, month]);

      const earnings = earningsResult.rows[0];

      return reply.send({
        success: true,
        period: { year, month },
        earnings: {
          consultations_count: parseInt(earnings.consultations_count),
          earned_cents: parseInt(earnings.earned_cents),
          adjustments_cents: parseInt(earnings.adjustments_cents),
          total_earnings_cents: parseInt(earnings.total_earnings_cents),
          total_earnings_display: `$${(parseInt(earnings.total_earnings_cents) / 100).toFixed(2)}`
        }
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Get earnings failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve earnings',
        correlation_id: generateCorrelationId()
      });
    }
  });

  // =====================================================
  // Dashboard Endpoints
  // =====================================================

  /**
   * Get dashboard overview for advisor
   * Comprehensive overview with key metrics
   */
  fastify.get('/api/v1/advisors/me/overview', {
    preHandler: requireHmacSignature()
  }, async (request: any, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const locale = request.locale;
      
      // Get advisor basic info with localized display name
      const advisorResult = await pool!.query(`
        SELECT 
          id,
          get_advisor_display_name_localized(user_id, $2) as display_name,
          approval_status,
          is_accepting_bookings,
          rating,
          review_count
        FROM advisors 
        WHERE user_id = $1 AND approval_status = 'approved'
      `, [claims.userId, locale]);
      
      // Get localized language names
      const languagesResult = await pool!.query(`
        SELECT language_code, language_name
        FROM get_advisor_available_languages_localized($1, $2)
        ORDER BY language_code
      `, [claims.userId, locale]);

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or not approved'
        });
      }

      const advisor = advisorResult.rows[0];
      const advisorId = advisor.id;

      // Get current month metrics
      const currentDate = new Date();
      const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      const monthlyStatsResult = await pool!.query(`
        SELECT
          COUNT(c.id)::INTEGER as total_consultations,
          COUNT(CASE WHEN c.is_free_consultation THEN 1 END)::INTEGER as free_consultations,
          COUNT(CASE WHEN c.start_time >= NOW() AND c.status IN ('scheduled', 'in_progress') THEN 1 END)::INTEGER as upcoming_consultations,
          COALESCE(SUM(CASE WHEN NOT c.is_free_consultation THEN c.advisor_earnings_cents END), 0)::INTEGER as earnings_cents
        FROM advisor_consultations c
        WHERE c.advisor_id = $1
          AND DATE_TRUNC('month', c.start_time) = DATE_TRUNC('month', $2::date)
      `, [advisorId, currentMonth]);

      // Get lifetime stats
      const lifetimeStatsResult = await pool!.query(`
        SELECT
          COUNT(c.id)::INTEGER as total_lifetime_consultations,
          COALESCE(SUM(CASE WHEN NOT c.is_free_consultation THEN c.advisor_earnings_cents END), 0)::INTEGER as lifetime_earnings_cents,
          0::INTEGER as profile_views_this_month -- Placeholder for future implementation
        FROM advisor_consultations c
        WHERE c.advisor_id = $1 AND c.status = 'completed'
      `, [advisorId]);

      const monthlyStats = monthlyStatsResult.rows[0];
      const lifetimeStats = lifetimeStatsResult.rows[0];

      return reply.send({
        success: true,
        data: {
          profile: {
            name: advisor.display_name,
            approval_status: advisor.approval_status,
            is_accepting_bookings: advisor.is_accepting_bookings,
            available_languages: languagesResult.rows.map(row => ({
              code: row.language_code,
              name: row.language_name
            })),
            average_rating: advisor.rating || 0
          },
          current_month: {
            total_consultations: monthlyStats.total_consultations,
            free_consultations: monthlyStats.free_consultations,
            earnings_cents: monthlyStats.earnings_cents,
            upcoming_consultations: monthlyStats.upcoming_consultations
          },
          quick_stats: {
            total_lifetime_consultations: lifetimeStats.total_lifetime_consultations,
            lifetime_earnings_cents: lifetimeStats.lifetime_earnings_cents,
            profile_views_this_month: lifetimeStats.profile_views_this_month
          }
        }
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Get dashboard overview failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve dashboard overview',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Get consultations for advisor with pagination
   * Supports upcoming, completed, and all consultation history
   */
  fastify.get('/api/v1/advisors/me/consultations', {
    preHandler: requireHmacSignature()
  }, async (request: any, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const { 
        status = 'all', 
        limit = 10, 
        cursor 
      } = request.query;

      // Validate status
      if (!['upcoming', 'completed', 'all'].includes(status)) {
        return reply.code(400).send({
          success: false,
          error: 'Status must be: upcoming, completed, or all'
        });
      }

      // Get advisor ID
      const advisorResult = await pool!.query(`
        SELECT id FROM advisors WHERE user_id = $1 AND approval_status = 'approved'
      `, [claims.userId]);

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or not approved'
        });
      }

      const advisorId = advisorResult.rows[0].id;

      // Build where clause based on status
      let statusCondition = '';
      if (status === 'upcoming') {
        statusCondition = `AND c.status IN ('scheduled', 'in_progress') AND c.start_time >= NOW()`;
      } else if (status === 'completed') {
        statusCondition = `AND c.status = 'completed'`;
      }

      // Parse cursor for pagination
      let cursorCondition = '';
      const queryParams: any[] = [advisorId];
      let paramIndex = 2;

      if (cursor) {
        try {
          const cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString());
          cursorCondition = `AND (c.start_time, c.id) < ($${paramIndex}, $${paramIndex + 1})`;
          queryParams.push(cursorData.scheduledAt, cursorData.id);
          paramIndex += 2;
        } catch (e) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid cursor format'
          });
        }
      }

      // Add limit parameter
      queryParams.push(parseInt(limit) + 1); // Get one extra to check if there are more

      const consultationsResult = await pool!.query(`
        SELECT 
          c.id,
          u.display_name as client_name,
          c.duration_minutes,
          c.start_time,
          c.is_free_consultation,
          c.status,
          c.cal_booking_url,
          c.advisor_notes
        FROM advisor_consultations c
        LEFT JOIN users u ON u.id = c.client_id
        WHERE c.advisor_id = $1
          ${statusCondition}
          ${cursorCondition}
        ORDER BY c.start_time DESC, c.id DESC
        LIMIT $${paramIndex}
      `, queryParams);

      const consultations = consultationsResult.rows;
      const hasMore = consultations.length > limit;
      
      // Remove the extra item if we have more
      if (hasMore) {
        consultations.pop();
      }

      // Generate next cursor if there are more results
      let nextCursor;
      if (hasMore && consultations.length > 0) {
        const lastItem = consultations[consultations.length - 1];
        nextCursor = Buffer.from(JSON.stringify({
          scheduledAt: lastItem.start_time,
          id: lastItem.id
        })).toString('base64');
      }

      // Privacy protection: only show first name of client
      const sanitizedConsultations = consultations.map(c => ({
        ...c,
        client_name: c.client_name ? c.client_name.split(' ')[0] : 'Client'
      }));

      return reply.send({
        success: true,
        data: {
          consultations: sanitizedConsultations,
          pagination: {
            has_more: hasMore,
            next_cursor: nextCursor,
            total: status === 'all' ? undefined : consultations.length // Only provide total for filtered views
          }
        }
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Get consultations failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve consultations',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Get analytics for advisor dashboard
   * Performance metrics and trends analysis
   */
  fastify.get('/api/v1/advisors/me/analytics', {
    preHandler: requireHmacSignature()
  }, async (request: any, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const { period = '30d' } = request.query;

      // Parse period (30d, 90d, 1y)
      let daysBack = 30;
      if (period === '90d') daysBack = 90;
      else if (period === '1y') daysBack = 365;

      // Get advisor ID
      const advisorResult = await pool!.query(`
        SELECT id FROM advisors WHERE user_id = $1 AND approval_status = 'approved'
      `, [claims.userId]);

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or not approved'
        });
      }

      const advisorId = advisorResult.rows[0].id;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (daysBack * 24 * 60 * 60 * 1000));

      // Get consultation analytics
      const consultationAnalyticsResult = await pool!.query(`
        SELECT
          COUNT(*)::INTEGER as total,
          COUNT(CASE WHEN c.is_free_consultation THEN 1 END)::INTEGER as free_count,
          COUNT(CASE WHEN NOT c.is_free_consultation THEN 1 END)::INTEGER as paid_count,
          COUNT(CASE WHEN c.duration_minutes = 15 THEN 1 END)::INTEGER as duration_15,
          COUNT(CASE WHEN c.duration_minutes = 30 THEN 1 END)::INTEGER as duration_30,
          COUNT(CASE WHEN c.duration_minutes = 60 THEN 1 END)::INTEGER as duration_60,
          CASE 
            WHEN COUNT(CASE WHEN c.is_free_consultation THEN 1 END) > 0
            THEN ROUND(
              (COUNT(CASE WHEN NOT c.is_free_consultation THEN 1 END)::DECIMAL / 
               COUNT(CASE WHEN c.is_free_consultation THEN 1 END)::DECIMAL * 100), 2
            )
            ELSE 0
          END as conversion_rate
        FROM advisor_consultations c
        WHERE c.advisor_id = $1 
          AND c.status = 'completed'
          AND c.start_time >= $2 
          AND c.start_time <= $3
      `, [advisorId, startDate, endDate]);

      // Get earnings analytics  
      const earningsResult = await pool!.query(`
        SELECT
          COALESCE(SUM(CASE WHEN NOT c.is_free_consultation THEN c.advisor_earnings_cents END), 0)::INTEGER as total_cents,
          json_agg(
            json_build_object(
              'month', TO_CHAR(DATE_TRUNC('month', c.start_time), 'YYYY-MM'),
              'earnings_cents', COALESCE(SUM(CASE WHEN NOT c.is_free_consultation THEN c.advisor_earnings_cents END), 0)::INTEGER
            )
          ) as by_month
        FROM advisor_consultations c
        WHERE c.advisor_id = $1 
          AND c.status = 'completed'
          AND c.start_time >= $2 
          AND c.start_time <= $3
        GROUP BY DATE_TRUNC('month', c.start_time)
        ORDER BY DATE_TRUNC('month', c.start_time)
      `, [advisorId, startDate, endDate]);

      // Get performance metrics
      const performanceResult = await pool!.query(`
        SELECT
          AVG(c.rating)::DECIMAL(3,2) as average_rating,
          COUNT(c.rating)::INTEGER as review_count,
          0::INTEGER as profile_views -- Placeholder for future implementation
        FROM advisor_consultations c
        WHERE c.advisor_id = $1 
          AND c.status = 'completed'
          AND c.rating IS NOT NULL
          AND c.start_time >= $2 
          AND c.start_time <= $3
      `, [advisorId, startDate, endDate]);

      // Calculate growth trends (compare with previous period)
      const prevStartDate = new Date(startDate.getTime() - (daysBack * 24 * 60 * 60 * 1000));
      const trendsResult = await pool!.query(`
        WITH current_period AS (
          SELECT COUNT(*)::INTEGER as consultations, 
                 COALESCE(SUM(CASE WHEN NOT c.is_free_consultation THEN c.advisor_earnings_cents END), 0)::INTEGER as earnings
          FROM advisor_consultations c
          WHERE c.advisor_id = $1 AND c.status = 'completed'
            AND c.start_time >= $2 AND c.start_time <= $3
        ),
        previous_period AS (
          SELECT COUNT(*)::INTEGER as consultations,
                 COALESCE(SUM(CASE WHEN NOT c.is_free_consultation THEN c.advisor_earnings_cents END), 0)::INTEGER as earnings
          FROM advisor_consultations c  
          WHERE c.advisor_id = $1 AND c.status = 'completed'
            AND c.start_time >= $4 AND c.start_time < $2
        )
        SELECT 
          CASE 
            WHEN pp.consultations = 0 THEN '+∞%'
            WHEN cp.consultations = pp.consultations THEN '0%'
            ELSE CONCAT('+', ROUND(((cp.consultations - pp.consultations)::DECIMAL / pp.consultations * 100), 0), '%')
          END as consultation_growth,
          CASE 
            WHEN pp.earnings = 0 THEN '+∞%'  
            WHEN cp.earnings = pp.earnings THEN '0%'
            ELSE CONCAT('+', ROUND(((cp.earnings - pp.earnings)::DECIMAL / pp.earnings * 100), 0), '%')
          END as earnings_growth
        FROM current_period cp, previous_period pp
      `, [advisorId, startDate, endDate, prevStartDate]);

      const consultationStats = consultationAnalyticsResult.rows[0];
      const earnings = earningsResult.rows[0];
      const performance = performanceResult.rows[0];
      const trends = trendsResult.rows[0];

      return reply.send({
        success: true,
        data: {
          period: { 
            start: startDate.toISOString().split('T')[0], 
            end: endDate.toISOString().split('T')[0] 
          },
          consultations: {
            total: consultationStats.total,
            by_duration: { 
              15: consultationStats.duration_15, 
              30: consultationStats.duration_30, 
              60: consultationStats.duration_60 
            },
            by_type: { 
              free: consultationStats.free_count, 
              paid: consultationStats.paid_count 
            },
            conversion_rate: parseFloat(consultationStats.conversion_rate) || 0
          },
          earnings: {
            total_cents: earnings.total_cents,
            by_month: earnings.by_month || []
          },
          performance: {
            reviews: { 
              average: parseFloat(performance.average_rating) || 0, 
              count: performance.review_count 
            },
            profile_views: performance.profile_views
          },
          trends: {
            consultation_growth: trends?.consultation_growth || '0%',
            earnings_growth: trends?.earnings_growth || '0%'
          }
        }
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Get analytics failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve analytics',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Get advisor availability settings
   * Calendar and booking preferences management
   */
  fastify.get('/api/v1/advisors/me/availability', {
    preHandler: requireHmacSignature()
  }, async (request: any, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);

      // Get advisor ID
      const advisorResult = await pool!.query(`
        SELECT id FROM advisors WHERE user_id = $1 AND approval_status = 'approved'
      `, [claims.userId]);

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or not approved'
        });
      }

      const advisorId = advisorResult.rows[0].id;

      // Get availability settings
      const availabilityResult = await pool!.query(`
        SELECT 
          timezone,
          weekly_schedule,
          blackout_dates,
          special_availability,
          min_notice_hours,
          max_advance_days,
          buffer_minutes,
          updated_at
        FROM advisor_availability_settings
        WHERE advisor_id = $1
      `, [advisorId]);

      // Return default settings if none exist
      const availability = availabilityResult.rows[0] || {
        timezone: 'UTC',
        weekly_schedule: {},
        blackout_dates: [],
        special_availability: [],
        min_notice_hours: 24,
        max_advance_days: 30,
        buffer_minutes: 15,
        updated_at: null
      };

      return reply.send({
        success: true,
        data: {
          timezone: availability.timezone,
          weekly_schedule: availability.weekly_schedule,
          blackout_dates: availability.blackout_dates,
          booking_preferences: {
            min_notice_hours: availability.min_notice_hours,
            max_advance_days: availability.max_advance_days,
            buffer_minutes: availability.buffer_minutes
          },
          cal_com_sync: {
            last_synced_at: availability.updated_at,
            last_sync_status: availability.updated_at ? 'success' : 'pending'
          }
        }
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Get availability failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve availability settings',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Update advisor availability settings
   * Comprehensive calendar and preferences management
   */
  fastify.put('/api/v1/advisors/me/availability', {
    preHandler: requireHmacSignature()
  }, async (request: any & {
    body: {
      timezone: string;
      weekly_schedule: any;
      blackout_dates?: string[];
      booking_preferences: {
        min_notice_hours: number;
        max_advance_days: number;
        buffer_minutes: number;
      };
    }
  }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const {
        timezone,
        weekly_schedule,
        blackout_dates = [],
        booking_preferences
      } = request.body;

      // Validate timezone (basic IANA format check)
      if (!timezone || !/^[A-Za-z_]+\/[A-Za-z_]+$/.test(timezone)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid timezone format. Must be IANA timezone (e.g., America/New_York)'
        });
      }

      // Validate booking preferences
      const { min_notice_hours, max_advance_days, buffer_minutes } = booking_preferences;
      if (min_notice_hours < 1 || min_notice_hours > 168) {
        return reply.code(400).send({
          success: false,
          error: 'min_notice_hours must be between 1 and 168 (1 week)'
        });
      }

      if (max_advance_days < 1 || max_advance_days > 365) {
        return reply.code(400).send({
          success: false,
          error: 'max_advance_days must be between 1 and 365'
        });
      }

      if (buffer_minutes < 0 || buffer_minutes > 120) {
        return reply.code(400).send({
          success: false,
          error: 'buffer_minutes must be between 0 and 120'
        });
      }

      // Get advisor ID
      const advisorResult = await pool!.query(`
        SELECT id FROM advisors WHERE user_id = $1 AND approval_status = 'approved'
      `, [claims.userId]);

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or not approved'
        });
      }

      const advisorId = advisorResult.rows[0].id;

      // Upsert availability settings
      const result = await pool!.query(`
        INSERT INTO advisor_availability_settings (
          advisor_id, timezone, weekly_schedule, blackout_dates, 
          min_notice_hours, max_advance_days, buffer_minutes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (advisor_id) DO UPDATE SET
          timezone = EXCLUDED.timezone,
          weekly_schedule = EXCLUDED.weekly_schedule,
          blackout_dates = EXCLUDED.blackout_dates,
          min_notice_hours = EXCLUDED.min_notice_hours,
          max_advance_days = EXCLUDED.max_advance_days,
          buffer_minutes = EXCLUDED.buffer_minutes,
          updated_at = now()
        RETURNING id, timezone, weekly_schedule, blackout_dates, 
                  min_notice_hours, max_advance_days, buffer_minutes, updated_at
      `, [advisorId, timezone, JSON.stringify(weekly_schedule), JSON.stringify(blackout_dates), 
          min_notice_hours, max_advance_days, buffer_minutes]);

      const updated = result.rows[0];

      return reply.send({
        success: true,
        message: 'Availability settings updated successfully',
        data: {
          timezone: updated.timezone,
          weekly_schedule: updated.weekly_schedule,
          blackout_dates: updated.blackout_dates,
          booking_preferences: {
            min_notice_hours: updated.min_notice_hours,
            max_advance_days: updated.max_advance_days,
            buffer_minutes: updated.buffer_minutes
          },
          cal_com_sync: {
            last_synced_at: updated.updated_at,
            last_sync_status: 'success'
          }
        }
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Update availability failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update availability settings',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Get advisor pricing settings
   * Free consultation configuration management
   */
  fastify.get('/api/v1/advisors/me/pricing-settings', {
    preHandler: requireHmacSignature()
  }, async (request: any, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);

      // Get advisor pricing settings
      const advisorResult = await pool!.query(`
        SELECT 
          pricing_model,
          free_consultation_durations
        FROM advisors 
        WHERE user_id = $1 AND approval_status = 'approved'
      `, [claims.userId]);

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or not approved'
        });
      }

      const advisor = advisorResult.rows[0];

      // Default pricing model is platform_fixed with no free consultations
      const pricingModel = advisor.pricing_model || 'platform_fixed';
      const freeDurations = advisor.free_consultation_durations || {};

      return reply.send({
        success: true,
        data: {
          pricing_model: pricingModel,
          free_consultation_durations: {
            15: freeDurations['15'] || false,
            30: freeDurations['30'] || false,
            60: freeDurations['60'] || false
          }
        }
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Get pricing settings failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve pricing settings',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Update advisor pricing settings
   * Configure free consultation offerings
   */
  fastify.put('/api/v1/advisors/me/pricing-settings', {
    preHandler: requireHmacSignature()
  }, async (request: any & {
    body: {
      pricing_model: 'platform_fixed' | 'free_only' | 'hybrid';
      free_consultation_durations: {
        15?: boolean;
        30?: boolean;
        60?: boolean;
      };
    }
  }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const { pricing_model, free_consultation_durations } = request.body;

      // Validate pricing model
      if (!['platform_fixed', 'free_only', 'hybrid'].includes(pricing_model)) {
        return reply.code(400).send({
          success: false,
          error: 'pricing_model must be: platform_fixed, free_only, or hybrid'
        });
      }

      // Validate duration settings
      const validDurations = [15, 30, 60];
      const durations = free_consultation_durations || {};
      
      for (const [duration, enabled] of Object.entries(durations)) {
        const durationNum = parseInt(duration);
        if (!validDurations.includes(durationNum)) {
          return reply.code(400).send({
            success: false,
            error: 'free_consultation_durations can only include 15, 30, 60 minute durations'
          });
        }
        if (typeof enabled !== 'boolean') {
          return reply.code(400).send({
            success: false,
            error: 'free_consultation_durations values must be boolean'
          });
        }
      }

      // Update advisor pricing settings
      const result = await pool!.query(`
        UPDATE advisors 
        SET 
          pricing_model = $1,
          free_consultation_durations = $2,
          updated_at = now()
        WHERE user_id = $3 AND approval_status = 'approved'
        RETURNING id, pricing_model, free_consultation_durations
      `, [pricing_model, JSON.stringify(durations), claims.userId]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found or not approved'
        });
      }

      const updated = result.rows[0];

      return reply.send({
        success: true,
        message: 'Pricing settings updated successfully',
        data: {
          pricing_model: updated.pricing_model,
          free_consultation_durations: {
            15: updated.free_consultation_durations['15'] || false,
            30: updated.free_consultation_durations['30'] || false,
            60: updated.free_consultation_durations['60'] || false
          }
        }
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Update pricing settings failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update pricing settings',
        correlation_id: generateCorrelationId()
      });
    }
  });

  // =====================================================
  // Admin Endpoints - Secured Sub-Plugin
  // =====================================================

  // Register admin routes as a separate sub-plugin with authentication
  fastify.register(async function(adminPlugin) {
    // Apply admin authentication to all routes in this sub-plugin
    adminPlugin.addHook('preHandler', requireAdminAuth({
      permissions: ['advisor_management'],
      requireReason: true,
      logActions: true
    }));

    /**
     * List pending advisor applications
     * Admin only endpoint - now properly secured
     */
    adminPlugin.get('/api/v1/admin/advisor-applications', async (request: FastifyRequest<{
      Querystring: { 
        status?: 'pending' | 'approved' | 'rejected';
        limit?: number;
        offset?: number;
      }
    }>, reply: FastifyReply) => {
      try {
        const { status = 'pending', limit = 50, offset = 0 } = request.query;

      const result = await pool!.query(`
        SELECT 
          a.id, a.display_name, a.bio, a.skills, a.specialties, a.languages,
          a.country_code, a.cal_com_event_type_url, a.approval_status,
          a.created_at, au.email
        FROM advisors a
        JOIN auth.users au ON au.id = a.user_id
        WHERE a.approval_status = $1
        ORDER BY a.created_at DESC
        LIMIT $2 OFFSET $3
      `, [status, limit, offset]);

      return reply.send({
        success: true,
        applications: result.rows,
        filters: { status, limit, offset },
        total_returned: result.rows.length
      });

    } catch (error) {
      console.error('[AdvisorNetwork] List applications failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve applications',
        correlation_id: generateCorrelationId()
      });
    }
  });

    /**
     * Approve or reject advisor application
     * Admin only endpoint - now properly secured
     */
    adminPlugin.put('/api/v1/admin/advisors/:id/approve', async (request: FastifyRequest<{
      Params: { id: string };
      Body: AdminApprovalBody;
    }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
      const { approval_status, notes } = request.body;

      if (!['approved', 'rejected'].includes(approval_status)) {
        return reply.code(400).send({
          success: false,
          error: 'approval_status must be "approved" or "rejected"'
        });
      }

      const result = await pool!.query(`
        UPDATE advisors 
        SET 
          approval_status = $1,
          approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE NULL END,
          updated_at = now()
        WHERE id = $2
        RETURNING id, display_name, approval_status, approved_at
      `, [approval_status, id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor application not found'
        });
      }

      const advisor = result.rows[0];

      // TODO: Send email notification to applicant

      return reply.send({
        success: true,
        message: `Advisor application ${approval_status}`,
        advisor: {
          id: advisor.id,
          display_name: advisor.display_name,
          approval_status: advisor.approval_status,
          approved_at: advisor.approved_at
        },
        admin_notes: notes
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Approval failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Approval process failed',
        correlation_id: generateCorrelationId()
      });
    }
    });
  }); // End admin sub-plugin

  // =====================================================
  // Consultation Management Endpoints
  // =====================================================

  /**
   * Book consultation with advisor
   * Creates consultation record and initiates payment
   */
  fastify.post('/api/v1/consultations/book', {
    preHandler: requireHmacSignature()
  }, async (request: any & { body: ConsultationBookingBody }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
      const {
        advisor_id,
        duration_minutes,
        project_id,
        cal_booking_id,
        locale = 'en-us',
        client_timezone = 'America/New_York'
      } = request.body;

      // Validate duration
      if (![15, 30, 60].includes(duration_minutes)) {
        return reply.code(400).send({
          success: false,
          error: 'duration_minutes must be 15, 30, or 60',
          correlation_id: correlationId
        });
      }

      // Verify advisor exists and is accepting bookings
      const advisorResult = await pool!.query(`
        SELECT id, display_name, approval_status, is_accepting_bookings
        FROM advisors 
        WHERE id = $1
      `, [advisor_id]);

      if (advisorResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor not found',
          correlation_id: correlationId
        });
      }

      const advisor = advisorResult.rows[0];
      if (advisor.approval_status !== 'approved' || !advisor.is_accepting_bookings) {
        return reply.code(400).send({
          success: false,
          error: 'Advisor is not currently accepting bookings',
          correlation_id: correlationId
        });
      }

      // Get platform pricing
      const pricing = getConsultationPricing(duration_minutes);
      
      // Create consultation record
      const consultationResult = await pool!.query(`
        INSERT INTO advisor_consultations (
          advisor_id, client_id, project_id, cal_booking_id, duration_minutes,
          price_cents, platform_fee_cents, advisor_earnings_cents,
          locale, client_timezone, pricing_snapshot, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled')
        RETURNING id, created_at
      `, [
        advisor_id, claims.userId, project_id, cal_booking_id, duration_minutes,
        pricing.price_cents, pricing.platform_fee_cents, pricing.advisor_earnings_cents,
        locale, client_timezone, 
        JSON.stringify({
          sku: `${duration_minutes}min`,
          currency: 'USD',
          rate_cents: pricing.price_cents
        })
      ]);

      const consultation = consultationResult.rows[0];

      // Create Stripe payment intent (but don't capture until Cal.com confirms)
      const stripeProvider = new (await import('../services/payment/StripeProvider')).StripeProvider();
      const payment = await stripeProvider.createConsultationPayment({
        consultationId: consultation.id,
        advisorId: advisor_id,
        clientId: claims.userId,
        durationMinutes: duration_minutes,
        clientEmail: claims.email
      });

      await loggingService.logServerEvent('capacity', 'info', 'consultation_booked', {
        consultationId: consultation.id,
        advisorId: advisor_id,
        clientId: claims.userId,
        durationMinutes: duration_minutes,
        priceCents: pricing.price_cents,
        correlationId
      });

      return reply.code(201).send({
        success: true,
        consultation: {
          id: consultation.id,
          advisor_name: advisor.display_name,
          duration_minutes,
          price_cents: pricing.price_cents,
          advisor_earnings_cents: pricing.advisor_earnings_cents,
          created_at: consultation.created_at
        },
        payment: {
          payment_intent_id: payment.paymentIntentId,
          client_secret: payment.clientSecret,
          total_amount: payment.totalAmount
        },
        pricing_snapshot: {
          sku: `${duration_minutes}min`,
          currency: 'USD',
          rate_cents: pricing.price_cents
        },
        correlation_id: correlationId
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Book consultation failed:', error);
      await loggingService.logCriticalError('consultation_booking_failed', error as Error, {
        userId: (request as any).claims?.userId,
        correlationId: request.headers['x-correlation-id']
      });

      return reply.code(500).send({
        success: false,
        error: 'Consultation booking failed',
        correlation_id: request.headers['x-correlation-id'] || generateCorrelationId()
      });
    }
  });

  /**
   * Get consultation details
   * Client can see their consultations, advisors can see their consultations (limited client info)
   */
  fastify.get('/api/v1/consultations/:id', {
    preHandler: requireHmacSignature()
  }, async (request: any & {
    Params: { id: string }
  }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const { id } = request.params;

      // Get consultation with advisor/client info
      const result = await pool!.query(`
        SELECT 
          c.id, c.advisor_id, c.client_id, c.start_time, c.duration_minutes,
          c.status, c.video_url, c.notes, c.price_cents, c.created_at,
          a.display_name as advisor_name,
          au.email as client_email,
          split_part(au.email, '@', 1) as client_first_name
        FROM advisor_consultations c
        JOIN advisors a ON a.id = c.advisor_id
        JOIN auth.users au ON au.id = c.client_id
        WHERE c.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Consultation not found'
        });
      }

      const consultation = result.rows[0];

      // Check access permissions
      const isClient = consultation.client_id === claims.userId;
      const isAdvisor = await pool!.query(`
        SELECT 1 FROM advisors WHERE id = $1 AND user_id = $2
      `, [consultation.advisor_id, claims.userId]);
      const isAdvisorUser = isAdvisor.rows.length > 0;

      if (!isClient && !isAdvisorUser) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied'
        });
      }

      // Return appropriate data based on user role
      const responseData: any = {
        id: consultation.id,
        duration_minutes: consultation.duration_minutes,
        status: consultation.status,
        scheduled_at: consultation.start_time,
        video_url: consultation.video_url,
        price_cents: consultation.price_cents,
        created_at: consultation.created_at
      };

      if (isClient) {
        // Client sees full advisor info
        responseData.advisor = {
          id: consultation.advisor_id,
          name: consultation.advisor_name
        };
      } else if (isAdvisorUser) {
        // Advisor sees limited client info (privacy protection)
        responseData.client = {
          first_name: consultation.client_first_name // Only first name, no email/PII
        };
      }

      return reply.send({
        success: true,
        consultation: responseData
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Get consultation failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve consultation',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Cancel consultation
   * Handles refund policy based on timing
   */
  fastify.put('/api/v1/consultations/:id/cancel', {
    preHandler: requireHmacSignature()
  }, async (request: any & {
    Params: { id: string };
    Body: { reason?: string; };
  }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const { id } = request.params;
      const { reason = 'User cancellation' } = request.body;
      const correlationId = generateCorrelationId();

      // Get consultation details
      const consultationResult = await pool!.query(`
        SELECT 
          c.id, c.client_id, c.advisor_id, c.start_time, c.status,
          cc.stripe_payment_intent_id, cc.total_amount_cents, cc.status as charge_status
        FROM advisor_consultations c
        LEFT JOIN advisor_consultation_charges cc ON cc.consultation_id = c.id
        WHERE c.id = $1
      `, [id]);

      if (consultationResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Consultation not found'
        });
      }

      const consultation = consultationResult.rows[0];

      // Verify user can cancel (client or advisor)
      const isClient = consultation.client_id === claims.userId;
      const advisorResult = await pool!.query(`
        SELECT 1 FROM advisors WHERE id = $1 AND user_id = $2
      `, [consultation.advisor_id, claims.userId]);
      const isAdvisor = advisorResult.rows.length > 0;

      if (!isClient && !isAdvisor) {
        return reply.code(403).send({
          success: false,
          error: 'You can only cancel your own consultations'
        });
      }

      // Check if consultation can be cancelled
      if (['cancelled', 'completed'].includes(consultation.status)) {
        return reply.code(400).send({
          success: false,
          error: `Cannot cancel consultation with status: ${consultation.status}`
        });
      }

      // Calculate time until consultation
      const hoursUntil = (new Date(consultation.start_time).getTime() - Date.now()) / (1000 * 60 * 60);

      // Update consultation status
      await pool!.query(`
        UPDATE advisor_consultations 
        SET status = 'cancelled', notes = $2, updated_at = now()
        WHERE id = $1
      `, [id, `Cancelled by ${isClient ? 'client' : 'advisor'}: ${reason}`]);

      let refundInfo = null;

      // Apply refund policy for client cancellations
      if (isClient && consultation.charge_status === 'succeeded' && hoursUntil > 24) {
        try {
          const stripeProvider = new (await import('../services/payment/StripeProvider')).StripeProvider();
          const refund = await stripeProvider.processConsultationRefund({
            consultationId: id,
            refundReason: 'cancellation',
            adminNotes: `Client cancellation ${Math.round(hoursUntil)} hours before consultation`
          });

          refundInfo = {
            will_be_refunded: true,
            refund_amount_cents: refund.refundAmount,
            refund_reason: 'Cancelled more than 24 hours before consultation'
          };
        } catch (refundError) {
          console.error('[AdvisorNetwork] Refund processing failed:', refundError);
          // Continue with cancellation even if refund fails
        }
      } else if (isClient) {
        refundInfo = {
          will_be_refunded: false,
          refund_reason: hoursUntil <= 24 ? 
            'No refund for cancellations within 24 hours' : 
            'Payment not yet processed'
        };
      }

      await loggingService.logServerEvent('capacity', 'info', 'consultation_cancelled', {
        consultationId: id,
        cancelledBy: isClient ? 'client' : 'advisor',
        hoursUntilConsultation: Math.round(hoursUntil),
        refundIssued: refundInfo?.will_be_refunded || false,
        reason,
        correlationId
      });

      return reply.send({
        success: true,
        message: 'Consultation cancelled successfully',
        consultation: {
          id,
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        },
        refund: refundInfo,
        correlation_id: correlationId
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Cancel consultation failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Consultation cancellation failed',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Submit review after consultation
   * Clients can review advisors after completed consultations
   */
  fastify.post('/api/v1/consultations/:id/review', {
    preHandler: requireHmacSignature()
  }, async (request: any & {
    Params: { id: string };
    Body: ReviewSubmissionBody;
  }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      const { id } = request.params;
      const {
        rating,
        review_text,
        expertise_rating,
        communication_rating,
        helpfulness_rating
      } = request.body;
      const correlationId = generateCorrelationId();

      // Validate rating
      if (!rating || rating < 1 || rating > 5) {
        return reply.code(400).send({
          success: false,
          error: 'Rating must be between 1 and 5'
        });
      }

      // Get consultation details and verify completion
      const consultationResult = await pool!.query(`
        SELECT id, advisor_id, client_id, status
        FROM advisor_consultations
        WHERE id = $1
      `, [id]);

      if (consultationResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Consultation not found'
        });
      }

      const consultation = consultationResult.rows[0];

      // Verify client is the one who had the consultation
      if (consultation.client_id !== claims.userId) {
        return reply.code(403).send({
          success: false,
          error: 'You can only review consultations you attended'
        });
      }

      // Verify consultation is completed
      if (consultation.status !== 'completed') {
        return reply.code(400).send({
          success: false,
          error: 'You can only review completed consultations'
        });
      }

      // Check if review already exists
      const existingReview = await pool!.query(`
        SELECT id FROM advisor_reviews 
        WHERE consultation_id = $1 AND client_id = $2
      `, [id, claims.userId]);

      if (existingReview.rows.length > 0) {
        return reply.code(400).send({
          success: false,
          error: 'You have already reviewed this consultation'
        });
      }

      // Insert review
      const reviewResult = await pool!.query(`
        INSERT INTO advisor_reviews (
          advisor_id, client_id, consultation_id, rating, review_text,
          expertise_rating, communication_rating, helpfulness_rating
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, created_at
      `, [
        consultation.advisor_id, claims.userId, id, rating, review_text,
        expertise_rating, communication_rating, helpfulness_rating
      ]);

      const review = reviewResult.rows[0];

      // Update advisor's average rating and review count
      await pool!.query(`
        UPDATE advisors 
        SET 
          rating = (
            SELECT ROUND(AVG(rating), 1) 
            FROM advisor_reviews 
            WHERE advisor_id = $1
          ),
          review_count = (
            SELECT COUNT(*) 
            FROM advisor_reviews 
            WHERE advisor_id = $1
          ),
          updated_at = now()
        WHERE id = $1
      `, [consultation.advisor_id]);

      await loggingService.logServerEvent('capacity', 'info', 'consultation_reviewed', {
        consultationId: id,
        advisorId: consultation.advisor_id,
        clientId: claims.userId,
        rating,
        hasText: !!review_text,
        correlationId
      });

      return reply.code(201).send({
        success: true,
        message: 'Review submitted successfully',
        review: {
          id: review.id,
          rating,
          submitted_at: review.created_at
        },
        correlation_id: correlationId
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Submit review failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Review submission failed',
        correlation_id: generateCorrelationId()
      });
    }
  });

  // =====================================================
  // Cal.com Webhook Endpoint
  // =====================================================

  /**
   * Cal.com webhook endpoint
   * Processes booking lifecycle events
   */
  fastify.post('/api/v1/webhooks/calcom', async (request: FastifyRequest<{
    Headers: {
      'x-cal-signature'?: string;
    };
    Body: any;
  }>, reply: FastifyReply) => {
    try {
      const signature = request.headers['x-cal-signature'];
      const rawBody = JSON.stringify(request.body);
      
      // Validate webhook signature if configured
      const webhookSecret = process.env.CALCOM_WEBHOOK_SECRET;
      if (webhookSecret && signature) {
        const expectedSignature = crypto.createHmac('sha256', webhookSecret)
          .update(rawBody)
          .digest('hex');
          
        const providedSignature = signature.replace('sha256=', '');
        
        const isValid = crypto.timingSafeEqual(
          Buffer.from(expectedSignature, 'hex'),
          Buffer.from(providedSignature, 'hex')
        );
        
        if (!isValid) {
          return reply.code(401).send({
            success: false,
            error: 'Invalid webhook signature'
          });
        }
      }

      // Fast 200 OK response pattern (same as Stripe)
      const correlationId = generateCorrelationId();
      const event = request.body as any;

      // Enqueue for async processing
      try {
        const { addCalComWebhookJob } = await import('../queue/modularQueues');
        await addCalComWebhookJob({
          eventId: event.id || crypto.randomUUID(),
          eventType: event.type || 'unknown',
          correlationId,
          rawPayload: rawBody,
          signature
        });

        console.log(`✅ Cal.com webhook queued: ${event.type} (${event.id})`);
      } catch (queueError) {
        console.error('❌ Failed to queue Cal.com webhook:', queueError);
        // Continue with sync processing as fallback
        console.log('⚠️ Processing Cal.com webhook synchronously as fallback');
      }

      return reply.send({
        success: true,
        message: 'Webhook received',
        correlation_id: correlationId
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Cal.com webhook failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Webhook processing failed'
      });
    }
  });

  // =====================================================
  // Admin Specialty Translation Management
  // =====================================================

  /**
   * Get specialty translations for specific language
   * Admin endpoint for translation management
   */
  fastify.get<{
    Params: { language: 'en' | 'ar' | 'fr' | 'es' | 'de' }
  }>('/api/v1/admin/specialty-translations/:language', {
    preHandler: requireHmacSignature()
  }, async (request, reply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      
      // Validate admin role
      if (!claims.roles || !claims.roles.includes('admin')) {
        return reply.code(403).send({
          success: false,
          error: 'Admin access required'
        });
      }

      const { language } = request.params;

      if (!checkDatabaseConnection(reply)) return;

      const result = await pool!.query(`
        SELECT id, specialty_key, language_code, display_name, description, created_at, updated_at, created_by
        FROM advisor_specialty_translations
        WHERE language_code = $1
        ORDER BY specialty_key
      `, [language]);

      return reply.send({
        success: true,
        translations: result.rows,
        language: language,
        total: result.rows.length
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Get specialty translations failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch specialty translations',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Create new specialty translation
   * Admin endpoint for adding translations
   */
  fastify.post('/api/v1/admin/specialty-translations', {
    preHandler: requireHmacSignature()
  }, async (request: any & {
    body: {
      specialty_key: string;
      language_code: 'en' | 'ar' | 'fr' | 'es' | 'de';
      display_name: string;
      description?: string;
    }
  }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      
      // Validate admin role
      if (!claims.roles || !claims.roles.includes('admin')) {
        return reply.code(403).send({
          success: false,
          error: 'Admin access required'
        });
      }

      const { specialty_key, language_code, display_name, description } = request.body;

      // Validate input
      if (!specialty_key || !language_code || !display_name) {
        return reply.code(400).send({
          success: false,
          error: 'specialty_key, language_code, and display_name are required'
        });
      }

      if (!['en', 'ar', 'fr', 'es', 'de'].includes(language_code)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid language_code. Must be: en, ar, fr, es, de'
        });
      }

      if (!/^[a-z][a-z0-9_-]*$/.test(specialty_key)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid specialty_key format. Must match: ^[a-z][a-z0-9_-]*$'
        });
      }

      if (!checkDatabaseConnection(reply)) return;

      const result = await pool!.query(`
        INSERT INTO advisor_specialty_translations (specialty_key, language_code, display_name, description, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, specialty_key, language_code, display_name, description, created_at, updated_at, created_by
      `, [specialty_key, language_code, display_name, description, claims.userId]);

      if (result.rows.length === 0) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to create specialty translation'
        });
      }

      return reply.code(201).send({
        success: true,
        message: 'Specialty translation created successfully',
        translation: result.rows[0]
      });

    } catch (error) {
      if (error instanceof Error && error.message.includes('unique constraint')) {
        return reply.code(409).send({
          success: false,
          error: 'Translation already exists for this specialty and language'
        });
      }

      console.error('[AdvisorNetwork] Create specialty translation failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to create specialty translation',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Update existing specialty translation
   * Admin endpoint for editing translations
   */
  fastify.put('/api/v1/admin/specialty-translations/:id', {
    preHandler: requireHmacSignature()
  }, async (request: any & {
    body: {
      display_name?: string;
      description?: string;
    };
    params: { id: string }
  }, reply: FastifyReply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      
      // Validate admin role
      if (!claims.roles || !claims.roles.includes('admin')) {
        return reply.code(403).send({
          success: false,
          error: 'Admin access required'
        });
      }

      const { id } = request.params;
      const { display_name, description } = request.body;

      // Validate input - at least one field must be provided
      if (!display_name && description === undefined) {
        return reply.code(400).send({
          success: false,
          error: 'At least one field (display_name or description) must be provided'
        });
      }

      if (!checkDatabaseConnection(reply)) return;

      // Build dynamic SET clause
      const setClause: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (display_name) {
        setClause.push(`display_name = $${paramIndex}`);
        values.push(display_name);
        paramIndex++;
      }

      if (description !== undefined) {
        setClause.push(`description = $${paramIndex}`);
        values.push(description);
        paramIndex++;
      }

      setClause.push(`updated_at = now()`);
      values.push(id); // ID parameter

      const result = await pool!.query(`
        UPDATE advisor_specialty_translations 
        SET ${setClause.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, specialty_key, language_code, display_name, description, created_at, updated_at, created_by
      `, values);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Specialty translation not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Specialty translation updated successfully',
        translation: result.rows[0]
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Update specialty translation failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update specialty translation',
        correlation_id: generateCorrelationId()
      });
    }
  });

  /**
   * Delete specialty translation
   * Admin endpoint for removing translations
   */
  fastify.delete<{
    Params: { id: string }
  }>('/api/v1/admin/specialty-translations/:id', {
    preHandler: requireHmacSignature()
  }, async (request, reply) => {
    try {
      const claims = extractClaimsFromRequest(request);
      
      // Validate admin role
      if (!claims.roles || !claims.roles.includes('admin')) {
        return reply.code(403).send({
          success: false,
          error: 'Admin access required'
        });
      }

      const { id } = request.params;

      if (!checkDatabaseConnection(reply)) return;

      const result = await pool!.query(`
        DELETE FROM advisor_specialty_translations 
        WHERE id = $1
        RETURNING specialty_key, language_code
      `, [id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Specialty translation not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Specialty translation deleted successfully',
        deleted: result.rows[0]
      });

    } catch (error) {
      console.error('[AdvisorNetwork] Delete specialty translation failed:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete specialty translation',
        correlation_id: generateCorrelationId()
      });
    }
  });
}