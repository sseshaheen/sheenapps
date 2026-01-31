/**
 * Admin Sanity Breakglass API Route
 * Handles emergency access requests and history for admin users
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthService } from '@/lib/admin/admin-auth-service';
import { getSanityAPIClient } from '@/services/sanity-api-client';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Get breakglass access history
 * GET /api/admin/sanity/breakglass
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const expired = searchParams.get('expired') === 'true';
    const projectId = searchParams.get('project_id');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const options = {
      user_id: userId || undefined,
      expired: expired,
      project_id: projectId || undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    };

    logger.info('📋 Admin fetching breakglass entries', { 
      adminId: session.adminId,
      role: session.role,
      options
    });

    try {
      const sanityClient = getSanityAPIClient();
      const result = await sanityClient.listBreakglassEntries(options);

      logger.info('✅ Breakglass entries retrieved', { 
        adminId: session.adminId,
        count: result.entries.length,
        total: result.total
      });

      return noCacheResponse(result);

    } catch (error) {
      logger.error('🚨 Failed to fetch breakglass entries', {
        adminId: session.adminId,
        error: error instanceof Error ? error.message : String(error)
      });

      return noCacheErrorResponse(
        { error: 'Failed to retrieve breakglass entries' },
        500
      );
    }

  } catch (error) {
    logger.error('🚨 Admin breakglass endpoint error', {
      error: error instanceof Error ? error.message : String(error)
    });

    return noCacheErrorResponse(
      { error: 'Internal server error' },
      500
    );
  }
}