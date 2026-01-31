/**
 * Admin Sanity Breakglass Request API Route
 * Handles emergency access credential requests for specific connections
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthService } from '@/lib/admin/admin-auth-service';
import { getSanityAPIClient } from '@/services/sanity-api-client';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import type { BreakglassCredentialsRequest } from '@/types/sanity-integration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Request breakglass credentials for emergency access
 * POST /api/admin/sanity/breakglass/[connectionId]
 */
export async function POST(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    // Authenticate admin user
    const session = await AdminAuthService.getAdminSession();
    
    if (!session?.isValid) {
      return noCacheErrorResponse(
        { error: 'Admin authentication required' },
        401
      );
    }

    // Check permissions - breakglass requires special permission
    if (!session.permissions.includes('sanity.breakglass') && session.role !== 'super_admin') {
      return noCacheErrorResponse(
        { error: 'Insufficient permissions for breakglass access' },
        403
      );
    }

    const { connectionId } = params;
    const body: BreakglassCredentialsRequest = await request.json();

    // Validate required fields
    if (!body.justification || typeof body.justification !== 'string' || body.justification.trim().length < 10) {
      return noCacheErrorResponse(
        { error: 'Justification must be at least 10 characters long' },
        400
      );
    }

    // Validate justification length (prevent abuse)
    if (body.justification.length > 1000) {
      return noCacheErrorResponse(
        { error: 'Justification too long (max 1000 characters)' },
        400
      );
    }

    logger.info('🚨 Admin requesting breakglass credentials', { 
      adminId: session.adminId,
      role: session.role,
      connectionId,
      justificationLength: body.justification.length
    });

    // Log the breakglass request for audit purposes
    logger.warn('🚨 BREAKGLASS ACCESS REQUESTED', {
      admin_id: session.adminId,
      admin_email: session.email,
      connection_id: connectionId,
      justification: body.justification,
      timestamp: new Date().toISOString(),
      ip_address: request.headers.get('x-forwarded-for') || 'unknown'
    });

    try {
      const sanityClient = getSanityAPIClient();
      const credentials = await sanityClient.getBreakglassCredentials(connectionId, body);

      // Log successful breakglass credential issuance
      logger.warn('🚨 BREAKGLASS CREDENTIALS ISSUED', {
        admin_id: session.adminId,
        admin_email: session.email,
        connection_id: connectionId,
        sanity_project_id: credentials.sanity_project_id,
        expires_at: credentials.expires_at,
        max_remaining_uses: credentials.max_remaining_uses,
        timestamp: new Date().toISOString()
      });

      // Remove sensitive token from logs
      const safeCredentials = {
        ...credentials,
        auth_token: credentials.auth_token ? '***REDACTED***' : undefined,
        robot_token: credentials.robot_token ? '***REDACTED***' : undefined
      };

      logger.info('✅ Breakglass credentials issued', { 
        adminId: session.adminId,
        connectionId,
        expires: credentials.expires_at,
        maxUses: credentials.max_remaining_uses
      });

      return noCacheResponse(credentials);

    } catch (error) {
      logger.error('🚨 Failed to issue breakglass credentials', {
        adminId: session.adminId,
        connectionId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('CONNECTION_NOT_FOUND')) {
          return noCacheErrorResponse(
            { error: 'Connection not found or access denied' },
            404
          );
        }

        if (error.message.includes('INSUFFICIENT_PERMISSIONS')) {
          return noCacheErrorResponse(
            { error: 'Insufficient permissions for this connection' },
            403
          );
        }

        if (error.message.includes('RATE_LIMITED')) {
          return noCacheErrorResponse(
            { error: 'Too many breakglass requests. Please try again later.' },
            429
          );
        }
      }

      return noCacheErrorResponse(
        { error: 'Failed to issue breakglass credentials' },
        500
      );
    }

  } catch (error) {
    logger.error('🚨 Admin breakglass request endpoint error', {
      connectionId: params?.connectionId,
      error: error instanceof Error ? error.message : String(error)
    });

    return noCacheErrorResponse(
      { error: 'Internal server error' },
      500
    );
  }
}