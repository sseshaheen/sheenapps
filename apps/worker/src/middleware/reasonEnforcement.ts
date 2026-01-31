import { FastifyRequest, FastifyReply } from 'fastify';
import { adminErrorResponse } from './correlationIdMiddleware';

/**
 * Reason Enforcement Middleware
 * 
 * Enforces that sensitive admin actions include a mandatory reason
 * Based on expert specifications for admin compliance system
 */

/**
 * List of actions that require mandatory reasons
 * Can be extended as needed
 */
const ACTIONS_REQUIRING_REASON = new Set([
  'refund.issue',
  'ban.permanent', 
  'user.suspend.temporary',
  'advisor.reject',
  'payment.void',
  'account.close'
]);

/**
 * Validates that a reason is provided and meets minimum requirements
 */
function validateReason(reason: string | undefined): boolean {
  if (!reason || typeof reason !== 'string') {
    return false;
  }
  
  const trimmedReason = reason.trim();
  return trimmedReason.length >= 10; // Minimum 10 characters as per expert spec
}

/**
 * Extracts action from request path or body
 * This is a simple implementation - can be enhanced based on routing patterns
 */
function extractActionFromRequest(request: FastifyRequest): string | null {
  const body = request.body as any;
  
  // Check if action is explicitly provided in body
  if (body && typeof body.action === 'string') {
    return body.action;
  }
  
  // Try to infer from URL path
  const url = request.url;
  if (url.includes('/refund')) return 'refund.issue';
  if (url.includes('/ban')) return 'ban.permanent';
  if (url.includes('/suspend')) return 'user.suspend.temporary';
  if (url.includes('/reject')) return 'advisor.reject';
  if (url.includes('/void')) return 'payment.void';
  
  return null;
}

/**
 * Middleware that enforces reason requirements for sensitive actions
 * 
 * Usage:
 * fastify.post('/v1/admin/refund', {
 *   preHandler: [requireAdminAuth(), enforceReason]
 * }, handler);
 */
export async function enforceReason(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const action = extractActionFromRequest(request);
  
  if (!action || !ACTIONS_REQUIRING_REASON.has(action)) {
    // No reason enforcement needed for this action
    return;
  }
  
  const body = request.body as any;
  const reason = body?.reason || request.headers['x-admin-reason'] as string;
  
  if (!validateReason(reason)) {
    reply.code(400).send(
      adminErrorResponse(
        request, 
        `Reason required for action '${action}' (minimum 10 characters)`,
        'REASON_REQUIRED'
      )
    );
    return;
  }
}

/**
 * Helper to check if an action requires a reason
 */
export function actionRequiresReason(action: string): boolean {
  return ACTIONS_REQUIRING_REASON.has(action);
}

/**
 * Helper to add new actions that require reasons
 */
export function addActionRequiringReason(action: string): void {
  ACTIONS_REQUIRING_REASON.add(action);
}

/**
 * Get all actions that require reasons (for documentation/testing)
 */
export function getActionsRequiringReason(): string[] {
  return Array.from(ACTIONS_REQUIRING_REASON);
}