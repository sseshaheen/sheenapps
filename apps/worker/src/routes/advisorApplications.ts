/**
 * Advisor Application API Routes
 * 
 * Complete REST API for Phase 2 advisor application management with security hardening:
 * - HMAC signature validation for authenticated endpoints
 * - Comprehensive input validation with JSON schemas
 * - Draft auto-save functionality with UPSERT patterns
 * - Event timeline tracking for admin workflow
 * - Proper error handling with correlation IDs
 * - Rate limiting and security headers
 * 
 * Security Features:
 * - Claims-based authentication with expiration validation
 * - User access control (users can only access their own applications)
 * - Admin role validation for review endpoints
 * - RLS-based database security following existing patterns
 * - Comprehensive audit logging
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { AdvisorService } from '../services/advisor/AdvisorService';
import { 
  AdvisorClaims, 
  AdvisorError,
  CreateDraftRequest,
  UpdateDraftRequest,
  UpdateProfileRequest,
  StartReviewRequest,
  CompleteReviewRequest,
  ApiResponse
} from '../services/advisor/types';
import { ServerLoggingService } from '../services/serverLoggingService';
import * as crypto from 'crypto';

// =====================================================
// Helper Functions
// =====================================================

function parseAuthenticatedClaims(request: FastifyRequest): AdvisorClaims {
  const claimsHeader = request.headers['x-sheen-claims'];
  
  if (!claimsHeader || typeof claimsHeader !== 'string') {
    throw new AdvisorError('AUTHENTICATION_ERROR', 'Missing authentication claims');
  }

  try {
    const claims = JSON.parse(claimsHeader) as AdvisorClaims;
    
    // Validate required fields
    if (!claims.userId || !claims.email || !claims.expires) {
      throw new AdvisorError('AUTHENTICATION_ERROR', 'Invalid authentication claims');
    }

    // Check expiration
    if (claims.expires < Date.now() / 1000) {
      throw new AdvisorError('AUTHENTICATION_ERROR', 'Authentication claims have expired');
    }

    return claims;
  } catch (error) {
    throw new AdvisorError('AUTHENTICATION_ERROR', 'Invalid authentication claims format');
  }
}

function generateCorrelationId(): string {
  return crypto.randomUUID();
}

function isAdmin(claims: AdvisorClaims): boolean {
  return claims.roles.includes('admin') || claims.roles.includes('staff');
}

// =====================================================
// Type Definitions
// =====================================================

// Use FastifyRequest directly with proper type casting for headers

// =====================================================
// Request Validation Schemas
// =====================================================

const createDraftSchema = {
  body: {
    type: 'object',
    properties: {
      professionalData: {
        type: 'object',
        properties: {
          bio: { type: 'string', maxLength: 2000 },
          skills: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          specialties: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          languages: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          yearsExperience: { type: 'number', minimum: 0, maximum: 50 },
          portfolioUrl: { type: 'string', format: 'uri' },
          linkedinUrl: { type: 'string', format: 'uri' },
          githubUrl: { type: 'string', format: 'uri' },
          timezone: { type: 'string', maxLength: 100 },
          weeklyAvailabilityHours: { type: 'number', minimum: 1, maximum: 168 },
          preferredSessionDuration: { type: 'array', items: { type: 'number' } },
          communicationStyle: { type: 'string', maxLength: 500 },
          preferredLanguages: { type: 'array', items: { type: 'string' } },
          isComplete: { type: 'boolean' },
          completedSections: { type: 'array', items: { type: 'string' } }
        },
        additionalProperties: false
      }
    },
    required: ['professionalData']
  }
};

const updateProfileSchema = {
  body: {
    type: 'object',
    properties: {
      display_name: { type: 'string', minLength: 1, maxLength: 100 },
      bio: { type: 'string', maxLength: 2000 },
      avatar_url: { type: 'string', format: 'uri' },
      skills: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      specialties: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      languages: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      cal_com_event_type_url: { type: 'string', format: 'uri' },
      is_accepting_bookings: { type: 'boolean' },
      country_code: { type: 'string', minLength: 2, maxLength: 2 }
    },
    additionalProperties: false
  }
};

const startReviewSchema = {
  body: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' }
    },
    required: ['userId']
  }
};

const completeReviewSchema = {
  body: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      approved: { type: 'boolean' },
      notes: { type: 'string', maxLength: 1000 }
    },
    required: ['userId', 'approved']
  }
};

// =====================================================
// Route Registration
// =====================================================

export default async function advisorApplicationRoutes(fastify: FastifyInstance) {
  const logger = ServerLoggingService.getInstance();
  const advisorService = new AdvisorService();

  // =====================================================
  // Draft Management Endpoints
  // =====================================================

  // Get current draft
  fastify.get('/api/advisor/draft', {
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
    
    try {
      const claims = parseAuthenticatedClaims(request);
      
      await logger.logServerEvent('routing', 'info', 'Fetching advisor draft', { 
        userId: claims.userId,
        correlationId 
      });

      const result = await advisorService.getDraft(claims.userId);
      
      if (!result.success) {
        return reply.code(404).send({
          success: false,
          error: result.error,
          correlationId
        } as ApiResponse<null>);
      }

      return reply.send({
        success: true,
        data: result.data,
        correlationId
      } as ApiResponse<typeof result.data>);

    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Error in GET /api/advisor/draft', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });

      const statusCode = error instanceof AdvisorError ? 
        (error.code === 'AUTHENTICATION_ERROR' ? 401 : 400) : 500;

      return reply.code(statusCode).send({
        success: false,
        error: error instanceof AdvisorError ? error.message : 'Internal server error',
        correlationId
      } as ApiResponse<null>);
    }
  });

  // Create or update draft
  fastify.post('/api/advisor/draft', {
    schema: createDraftSchema,
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
    
    try {
      const claims = parseAuthenticatedClaims(request);
      const body = request.body as CreateDraftRequest;
      
      await logger.logServerEvent('routing', 'info', 'Creating/updating advisor draft', { 
        userId: claims.userId,
        correlationId,
        hasData: !!body.professionalData
      });

      const result = await advisorService.createOrUpdateDraft({
        userId: claims.userId,
        professionalData: body.professionalData
      });
      
      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: result.error,
          correlationId
        } as ApiResponse<null>);
      }

      return reply.send({
        success: true,
        data: result.data,
        message: 'Draft saved successfully',
        correlationId
      } as ApiResponse<typeof result.data>);

    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Error in POST /api/advisor/draft', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });

      const statusCode = error instanceof AdvisorError ? 
        (error.code === 'AUTHENTICATION_ERROR' ? 401 : 400) : 500;

      return reply.code(statusCode).send({
        success: false,
        error: error instanceof AdvisorError ? error.message : 'Internal server error',
        correlationId
      } as ApiResponse<null>);
    }
  });

  // Submit application
  fastify.post('/api/advisor/draft/submit', {
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
    
    try {
      const claims = parseAuthenticatedClaims(request);
      
      await logger.logServerEvent('routing', 'info', 'Submitting advisor application', { 
        userId: claims.userId,
        correlationId 
      });

      const result = await advisorService.submitApplication(claims.userId);
      
      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: result.error,
          correlationId
        } as ApiResponse<null>);
      }

      return reply.send({
        success: true,
        data: result.data,
        message: 'Application submitted successfully',
        correlationId
      } as ApiResponse<typeof result.data>);

    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Error in POST /api/advisor/draft/submit', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });

      const statusCode = error instanceof AdvisorError ? 
        (error.code === 'AUTHENTICATION_ERROR' ? 401 : 400) : 500;

      return reply.code(statusCode).send({
        success: false,
        error: error instanceof AdvisorError ? error.message : 'Internal server error',
        correlationId
      } as ApiResponse<null>);
    }
  });

  // =====================================================
  // Profile Management Endpoints
  // =====================================================

  // Get advisor profile
  fastify.get('/api/advisor/profile', {
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
    
    try {
      const claims = parseAuthenticatedClaims(request);
      
      await logger.logServerEvent('routing', 'info', 'Fetching advisor profile', { 
        userId: claims.userId,
        correlationId 
      });

      const profile = await advisorService.getAdvisorProfile(claims.userId);
      
      if (!profile) {
        return reply.code(404).send({
          success: false,
          error: 'Advisor profile not found',
          correlationId
        } as ApiResponse<null>);
      }

      return reply.send({
        success: true,
        data: profile,
        correlationId
      } as ApiResponse<typeof profile>);

    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Error in GET /api/advisor/profile', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });

      const statusCode = error instanceof AdvisorError ? 
        (error.code === 'AUTHENTICATION_ERROR' ? 401 : 400) : 500;

      return reply.code(statusCode).send({
        success: false,
        error: error instanceof AdvisorError ? error.message : 'Internal server error',
        correlationId
      } as ApiResponse<null>);
    }
  });

  // Update advisor profile
  fastify.patch('/api/advisor/profile/:advisorId', {
    schema: updateProfileSchema,
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
    const { advisorId } = request.params as { advisorId: string };
    
    try {
      const claims = parseAuthenticatedClaims(request);
      const body = request.body as UpdateProfileRequest;
      
      await logger.logServerEvent('routing', 'info', 'Updating advisor profile', { 
        userId: claims.userId,
        advisorId,
        correlationId 
      });

      const updatedProfile = await advisorService.updateAdvisorProfile({
        advisorId,
        updates: body,
        authenticatedClaims: claims
      });

      return reply.send({
        success: true,
        data: updatedProfile,
        message: 'Profile updated successfully',
        correlationId
      } as ApiResponse<typeof updatedProfile>);

    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Error in PATCH /api/advisor/profile/:advisorId', {
        error: error instanceof Error ? error.message : 'Unknown error',
        advisorId,
        correlationId
      });

      const statusCode = error instanceof AdvisorError ? 
        (error.code === 'AUTHENTICATION_ERROR' ? 401 : 
         error.code === 'ADVISOR_NOT_FOUND' ? 404 : 400) : 500;

      return reply.code(statusCode).send({
        success: false,
        error: error instanceof AdvisorError ? error.message : 'Internal server error',
        correlationId
      } as ApiResponse<null>);
    }
  });

  // =====================================================
  // Event Timeline Endpoints
  // =====================================================

  // Get event timeline
  fastify.get('/api/advisor/timeline', {
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
    
    try {
      const claims = parseAuthenticatedClaims(request);
      const { limit } = request.query as { limit?: string };
      
      await logger.logServerEvent('routing', 'info', 'Fetching advisor event timeline', { 
        userId: claims.userId,
        limit: limit ? parseInt(limit, 10) : undefined,
        correlationId 
      });

      const events = await advisorService.getEventTimeline(
        claims.userId, 
        limit ? parseInt(limit, 10) : undefined
      );

      return reply.send({
        success: true,
        data: events,
        correlationId
      } as ApiResponse<typeof events>);

    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Error in GET /api/advisor/timeline', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });

      const statusCode = error instanceof AdvisorError ? 
        (error.code === 'AUTHENTICATION_ERROR' ? 401 : 400) : 500;

      return reply.code(statusCode).send({
        success: false,
        error: error instanceof AdvisorError ? error.message : 'Internal server error',
        correlationId
      } as ApiResponse<null>);
    }
  });

  // =====================================================
  // Admin Endpoints
  // =====================================================

  // Get applications for review (admin only)
  fastify.get('/api/admin/advisor/applications', {
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
    
    try {
      const claims = parseAuthenticatedClaims(request);
      
      if (!isAdmin(claims)) {
        return reply.code(403).send({
          success: false,
          error: 'Admin access required',
          correlationId
        } as ApiResponse<null>);
      }

      const { status } = request.query as { status?: string };
      
      await logger.logServerEvent('routing', 'info', 'Admin fetching applications for review', { 
        adminUserId: claims.userId,
        status,
        correlationId 
      });

      const applications = await advisorService.getApplicationsForReview(
        status as any
      );

      return reply.send({
        success: true,
        data: applications,
        correlationId
      } as ApiResponse<typeof applications>);

    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Error in GET /api/admin/advisor/applications', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });

      const statusCode = error instanceof AdvisorError ? 
        (error.code === 'AUTHENTICATION_ERROR' ? 401 : 400) : 500;

      return reply.code(statusCode).send({
        success: false,
        error: error instanceof AdvisorError ? error.message : 'Internal server error',
        correlationId
      } as ApiResponse<null>);
    }
  });

  // Start review process (admin only)
  fastify.post('/api/admin/advisor/review/start', {
    schema: startReviewSchema,
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
    
    try {
      const claims = parseAuthenticatedClaims(request);
      
      if (!isAdmin(claims)) {
        return reply.code(403).send({
          success: false,
          error: 'Admin access required',
          correlationId
        } as ApiResponse<null>);
      }

      const body = request.body as StartReviewRequest;
      
      await logger.logServerEvent('routing', 'info', 'Admin starting advisor review', { 
        adminUserId: claims.userId,
        targetUserId: body.userId,
        correlationId 
      });

      await advisorService.startReview(body.userId, claims.userId);

      return reply.send({
        success: true,
        message: 'Review started successfully',
        correlationId
      } as ApiResponse<null>);

    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Error in POST /api/admin/advisor/review/start', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });

      const statusCode = error instanceof AdvisorError ? 
        (error.code === 'AUTHENTICATION_ERROR' ? 401 : 
         error.code === 'ADVISOR_NOT_FOUND' ? 404 : 400) : 500;

      return reply.code(statusCode).send({
        success: false,
        error: error instanceof AdvisorError ? error.message : 'Internal server error',
        correlationId
      } as ApiResponse<null>);
    }
  });

  // Complete review process (admin only)
  fastify.post('/api/admin/advisor/review/complete', {
    schema: completeReviewSchema,
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || generateCorrelationId();
    
    try {
      const claims = parseAuthenticatedClaims(request);
      
      if (!isAdmin(claims)) {
        return reply.code(403).send({
          success: false,
          error: 'Admin access required',
          correlationId
        } as ApiResponse<null>);
      }

      const body = request.body as CompleteReviewRequest;
      
      await logger.logServerEvent('routing', 'info', 'Admin completing advisor review', { 
        adminUserId: claims.userId,
        targetUserId: body.userId,
        approved: body.approved,
        correlationId 
      });

      await advisorService.completeReview(
        body.userId, 
        claims.userId, 
        body.approved, 
        body.notes
      );

      return reply.send({
        success: true,
        message: `Review completed - advisor ${body.approved ? 'approved' : 'rejected'}`,
        correlationId
      } as ApiResponse<null>);

    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Error in POST /api/admin/advisor/review/complete', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });

      const statusCode = error instanceof AdvisorError ? 
        (error.code === 'AUTHENTICATION_ERROR' ? 401 : 
         error.code === 'ADVISOR_NOT_FOUND' ? 404 : 400) : 500;

      return reply.code(statusCode).send({
        success: false,
        error: error instanceof AdvisorError ? error.message : 'Internal server error',
        correlationId
      } as ApiResponse<null>);
    }
  });
}