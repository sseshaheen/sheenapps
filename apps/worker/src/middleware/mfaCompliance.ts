/**
 * MFA Compliance Middleware
 * Gates privileged actions while allowing login with redirect to MFA setup
 *
 * Features:
 * - Non-blocking for login/authentication
 * - Blocks privileged actions (payments, admin functions, sensitive operations)
 * - Grace period support for MFA setup
 * - Clear error messages with setup instructions
 * - Audit logging for compliance monitoring
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { mfaEnforcementService } from '../services/mfaEnforcement';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

export interface MFAComplianceOptions {
  /**
   * Actions that require MFA compliance
   * Examples: 'payment', 'admin_action', 'sensitive_data_access'
   */
  actionType: string;

  /**
   * Whether to log all compliance checks (default: true)
   */
  logChecks?: boolean;

  /**
   * Custom redirect URL for MFA setup (optional)
   */
  mfaSetupUrl?: string;
}

/**
 * Middleware to enforce MFA compliance for privileged actions
 * Follows CLAUDE.md pattern: uses explicit userId from query/body parameters
 */
export function requireMFACompliance(options: MFAComplianceOptions) {
  const {
    actionType,
    logChecks = true,
    mfaSetupUrl = '/account/mfa-setup'
  } = options;

  return async function mfaComplianceMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Extract userId following CLAUDE.md pattern
      const userId = extractUserIdFromRequest(request);

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing user identification',
          code: 'MISSING_USER_ID',
          message: 'userId parameter required for MFA compliance check',
          timestamp: new Date().toISOString()
        });
      }

      // Check MFA compliance
      const complianceCheck = await mfaEnforcementService.checkMFACompliance(userId);

      // Log compliance check if enabled
      if (logChecks) {
        await loggingService.logServerEvent(
          'capacity',
          'info',
          'MFA compliance check performed',
          {
            userId,
            actionType,
            isCompliant: complianceCheck.isCompliant,
            mfaRequired: complianceCheck.mfaRequired,
            mfaEnabled: complianceCheck.mfaEnabled,
            graceExpired: complianceCheck.graceExpired,
            path: request.url,
            method: request.method,
            checkDurationMs: Date.now() - startTime
          }
        );
      }

      // Allow action if user is compliant
      if (complianceCheck.isCompliant) {
        return; // Continue to next middleware/handler
      }

      // Block action if MFA is required but not set up (and grace period expired)
      if (complianceCheck.mfaRequired && !complianceCheck.mfaEnabled) {
        // Log access denial
        await loggingService.logServerEvent(
          'capacity',
          'warn',
          'Privileged action blocked - MFA required',
          {
            userId,
            actionType,
            path: request.url,
            method: request.method,
            mfaRequired: complianceCheck.mfaRequired,
            mfaEnabled: complianceCheck.mfaEnabled,
            graceExpired: complianceCheck.graceExpired,
            graceExpiresAt: complianceCheck.graceExpiresAt?.toISOString()
          }
        );

        return reply.code(403).send({
          error: 'MFA_REQUIRED',
          code: 'MFA_COMPLIANCE_REQUIRED',
          message: 'Multi-factor authentication setup required for this action',
          details: {
            actionType,
            mfaSetupRequired: true,
            graceExpired: complianceCheck.graceExpired,
            graceExpiresAt: complianceCheck.graceExpiresAt?.toISOString()
          },
          actions: {
            setupMFA: {
              url: mfaSetupUrl,
              description: 'Set up multi-factor authentication'
            },
            contactSupport: {
              url: '/support',
              description: 'Contact support if you need assistance'
            }
          },
          timestamp: new Date().toISOString()
        });
      }

      // If we get here, something unexpected happened
      console.warn('Unexpected MFA compliance state:', complianceCheck);
      return reply.code(500).send({
        error: 'MFA compliance check failed',
        code: 'MFA_CHECK_ERROR',
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      // Log middleware error
      await loggingService.logCriticalError(
        'mfa_compliance_middleware_error',
        error,
        {
          actionType,
          path: request.url,
          method: request.method,
          durationMs: Date.now() - startTime
        }
      );

      return reply.code(500).send({
        error: 'MFA compliance check failed',
        code: 'MFA_MIDDLEWARE_ERROR',
        message: 'Unable to verify MFA compliance',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Extract userId from request following CLAUDE.md authentication patterns
 */
function extractUserIdFromRequest(request: FastifyRequest): string | null {
  // Check query parameters first (GET requests)
  const queryUserId = (request.query as any)?.userId;
  if (queryUserId) {
    return queryUserId;
  }

  // Check body parameters (POST/PUT/DELETE requests)
  const bodyUserId = (request.body as any)?.userId;
  if (bodyUserId) {
    return bodyUserId;
  }

  // Check URL parameters (e.g., /users/:userId/action)
  const paramsUserId = (request.params as any)?.userId;
  if (paramsUserId) {
    return paramsUserId;
  }

  return null;
}

/**
 * Convenience functions for common privileged actions
 */

export function requireMFAForPayments() {
  return requireMFACompliance({
    actionType: 'payment',
    mfaSetupUrl: '/account/mfa-setup?reason=payment_security'
  });
}

export function requireMFAForAdminActions() {
  return requireMFACompliance({
    actionType: 'admin_action',
    mfaSetupUrl: '/account/mfa-setup?reason=admin_security'
  });
}

export function requireMFAForSensitiveData() {
  return requireMFACompliance({
    actionType: 'sensitive_data_access',
    mfaSetupUrl: '/account/mfa-setup?reason=data_security'
  });
}

export function requireMFAForAccountChanges() {
  return requireMFACompliance({
    actionType: 'account_changes',
    mfaSetupUrl: '/account/mfa-setup?reason=account_security'
  });
}