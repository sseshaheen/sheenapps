/**
 * Feedback Routes
 *
 * API endpoints for the feedback collection system.
 * See FEEDBACK-COLLECTION-PLAN.md - Backend Endpoints section
 *
 * Endpoints:
 *   POST /v1/feedback - Submit explicit feedback
 *   GET  /v1/feedback/eligibility - Check if user should see prompt
 *   POST /v1/feedback/eligibility/record - Record prompt shown/responded
 *   POST /v1/feedback/analytics/batch - Submit batch of implicit signals
 */

import { FastifyInstance } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { makeAdminCtx } from '../lib/supabase';
import { FeedbackService } from '../services/feedback/FeedbackService';
import {
  FeedbackSubmission,
  FeedbackType,
  FeedbackPlacement,
  FeedbackGoal,
  DeviceType,
  PromptType,
  EligibilityAction,
  ImplicitSignal,
  ImplicitSignalType,
} from '../services/feedback/types';

// Singleton service instance
let feedbackService: FeedbackService | null = null;

function getService(): FeedbackService {
  if (!feedbackService) {
    const supabase = makeAdminCtx();
    feedbackService = new FeedbackService(supabase);
  }
  return feedbackService;
}

// Validation helpers
const VALID_FEEDBACK_TYPES: FeedbackType[] = [
  'nps',
  'csat',
  'binary',
  'emoji',
  'text',
  'feature_request',
  'bug_report',
];
const VALID_PLACEMENTS: FeedbackPlacement[] = ['inline', 'toast', 'modal', 'tab', 'banner'];
const VALID_GOALS: FeedbackGoal[] = [
  'onboarding',
  'helpfulness',
  'satisfaction',
  'nps',
  'bug',
  'feature',
];
const VALID_DEVICE_TYPES: DeviceType[] = ['desktop', 'mobile', 'tablet'];
const VALID_PROMPT_TYPES: PromptType[] = [
  'nps',
  'csat',
  'micro_survey',
  'feature_helpful',
  'onboarding_ease',
  'exit_intent',
  'frustration_help',
];
const VALID_ELIGIBILITY_ACTIONS: EligibilityAction[] = ['shown', 'dismissed', 'responded'];
const VALID_SIGNAL_TYPES: ImplicitSignalType[] = [
  'rage_click',
  'dead_click',
  'scroll_depth',
  'time_on_page',
  'error',
  'drop_off',
  'thrashing_score',
];

/**
 * Allowlist regex for elementId (data-track attribute values)
 * Only allows alphanumeric, underscore, hyphen - max 64 chars
 * Prevents CSS selectors and other injection patterns
 */
const ELEMENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export default async function feedbackRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();

  // ===========================================================================
  // POST /v1/feedback - Submit explicit feedback
  // ===========================================================================

  fastify.post<{
    Body: {
      id: string;
      type: FeedbackType;
      value: number | string | boolean;
      textComment?: string;
      userId?: string;
      anonymousId: string;
      sessionId: string;
      pageUrl: string;
      featureId?: string;
      triggerPoint: string;
      promptId: string;
      placement: FeedbackPlacement;
      goal: FeedbackGoal;
      userAgent?: string;
      viewport?: { width: number; height: number };
      locale?: string;
      deviceType?: DeviceType;
      buildVersion?: string;
    };
    Reply: { success: boolean; id?: string; error?: string };
  }>('/v1/feedback', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const body = request.body;

      // Validate required fields
      if (!body.id || !body.type || body.value === undefined) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required fields: id, type, value',
        });
      }

      if (!body.anonymousId || !body.sessionId || !body.pageUrl || !body.triggerPoint) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required context fields',
        });
      }

      if (!body.promptId || !body.placement || !body.goal) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required prompt metadata fields',
        });
      }

      // Validate enums
      if (!VALID_FEEDBACK_TYPES.includes(body.type)) {
        return reply.status(400).send({
          success: false,
          error: `Invalid type. Must be one of: ${VALID_FEEDBACK_TYPES.join(', ')}`,
        });
      }

      if (!VALID_PLACEMENTS.includes(body.placement)) {
        return reply.status(400).send({
          success: false,
          error: `Invalid placement. Must be one of: ${VALID_PLACEMENTS.join(', ')}`,
        });
      }

      if (!VALID_GOALS.includes(body.goal)) {
        return reply.status(400).send({
          success: false,
          error: `Invalid goal. Must be one of: ${VALID_GOALS.join(', ')}`,
        });
      }

      if (body.deviceType && !VALID_DEVICE_TYPES.includes(body.deviceType)) {
        return reply.status(400).send({
          success: false,
          error: `Invalid deviceType. Must be one of: ${VALID_DEVICE_TYPES.join(', ')}`,
        });
      }

      // Submit feedback
      const service = getService();
      const result = await service.submitFeedback(body as FeedbackSubmission);

      if (!result.success) {
        return reply.status(500).send({
          success: false,
          error: result.error || 'Failed to submit feedback',
        });
      }

      // Return 200 for duplicates (idempotent), 201 for new
      const statusCode = result.duplicate ? 200 : 201;
      return reply.status(statusCode).send({
        success: true,
        id: result.id,
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to submit feedback');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  // ===========================================================================
  // GET /v1/feedback/eligibility - Check if user should see prompt
  // ===========================================================================

  fastify.get<{
    Querystring: {
      promptType: PromptType;
      userId?: string;
      anonymousId: string;
      featureId?: string;
    };
    Reply: { eligible: boolean; reason?: string; cooldownEnds?: string };
  }>('/v1/feedback/eligibility', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const { promptType, userId, anonymousId, featureId } = request.query;

      // Validate required fields
      if (!promptType || !anonymousId) {
        return reply.status(400).send({
          eligible: false,
          reason: 'Missing required fields: promptType, anonymousId',
        });
      }

      // Validate prompt type
      if (!VALID_PROMPT_TYPES.includes(promptType)) {
        return reply.status(400).send({
          eligible: false,
          reason: `Invalid promptType. Must be one of: ${VALID_PROMPT_TYPES.join(', ')}`,
        });
      }

      const service = getService();
      const result = await service.checkEligibility({
        promptType,
        ...(userId !== undefined && { userId }),
        anonymousId,
        ...(featureId !== undefined && { featureId }),
      });

      return reply.send(result);
    } catch (error) {
      request.log.error({ error }, 'Failed to check eligibility');
      // Fail closed: if we can't check, don't show prompt
      return reply.status(500).send({
        eligible: false,
        reason: 'check_failed',
      });
    }
  });

  // ===========================================================================
  // POST /v1/feedback/eligibility/record - Record prompt shown/responded
  // ===========================================================================

  fastify.post<{
    Body: {
      promptType: PromptType;
      userId?: string;
      anonymousId: string;
      featureId?: string;
      action: EligibilityAction;
    };
    Reply: { recorded: boolean };
  }>(
    '/v1/feedback/eligibility/record',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      try {
        const { promptType, userId, anonymousId, featureId, action } = request.body;

        // Validate required fields
        if (!promptType || !anonymousId || !action) {
          return reply.status(400).send({
            recorded: false,
          });
        }

        // Validate enums
        if (!VALID_PROMPT_TYPES.includes(promptType)) {
          return reply.status(400).send({
            recorded: false,
          });
        }

        if (!VALID_ELIGIBILITY_ACTIONS.includes(action)) {
          return reply.status(400).send({
            recorded: false,
          });
        }

        const service = getService();
        const result = await service.recordEligibility({
          promptType,
          ...(userId !== undefined && { userId }),
          anonymousId,
          ...(featureId !== undefined && { featureId }),
          action,
        });

        return reply.send({ recorded: result.success });
      } catch (error) {
        request.log.error({ error }, 'Failed to record eligibility');
        return reply.status(500).send({
          recorded: false,
        });
      }
    }
  );

  // ===========================================================================
  // POST /v1/feedback/analytics/batch - Submit batch of implicit signals
  // ===========================================================================

  fastify.post<{
    Body: {
      events: Array<{
        type: ImplicitSignalType;
        value: number | string | Record<string, unknown>;
        pageUrl: string;
        elementId?: string;
        sessionId: string;
        buildVersion?: string;
      }>;
    };
    Reply: { received: number; errors?: number };
  }>(
    '/v1/feedback/analytics/batch',
    {
      preHandler: hmacMiddleware as any,
      // Limit batch size - max 60 events per minute per performance budget
      bodyLimit: 64 * 1024, // 64KB
    },
    async (request, reply) => {
      try {
        const { events } = request.body;

        if (!events || !Array.isArray(events)) {
          return reply.status(400).send({
            received: 0,
            errors: 1,
          });
        }

        // Enforce max batch size
        if (events.length > 100) {
          return reply.status(400).send({
            received: 0,
            errors: 1,
          });
        }

        // Validate each event
        const validEvents: ImplicitSignal[] = [];
        for (const event of events) {
          if (
            !event.type ||
            !VALID_SIGNAL_TYPES.includes(event.type) ||
            event.value === undefined ||
            !event.pageUrl ||
            !event.sessionId
          ) {
            continue; // Skip invalid events
          }

          // Validate elementId uses allowlisted format (security + data cleanliness)
          // Only alphanumeric, underscore, hyphen - max 64 chars
          if (event.elementId && !ELEMENT_ID_REGEX.test(event.elementId)) {
            continue; // Skip - doesn't match data-track attribute format
          }

          validEvents.push(event as ImplicitSignal);
        }

        const service = getService();
        const result = await service.recordImplicitSignals(validEvents);

        return reply.send({
          received: result.received,
          errors: result.errors,
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to record implicit signals');
        return reply.status(500).send({
          received: 0,
          errors: 1,
        });
      }
    }
  );
}
