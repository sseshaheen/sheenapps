/**
 * Sanity Connection Health Check API Route
 * Handles health verification for Sanity connections
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSanityAPIClient } from '@/services/sanity-api-client';
import { getCurrentUserId } from '@/lib/server/auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Check health of Sanity connection
 * POST /api/sanity/connections/[connectionId]/health
 */
export async function POST(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401);
    }

    const { connectionId } = params;

    logger.info('💓 Checking Sanity connection health', { 
      userId, 
      connectionId
    });

    const sanityClient = getSanityAPIClient();
    const result = await sanityClient.checkConnectionHealth(connectionId);

    logger.info('✅ Sanity connection health check completed', { 
      userId, 
      connectionId,
      success: result.success,
      message: result.message
    });

    return noCacheResponse(result);

  } catch (error) {
    logger.error('🚨 Sanity connection health check failed', {
      connectionId: params?.connectionId,
      error: error instanceof Error ? error.message : String(error)
    });

    if (error instanceof Error && error.message.includes('CONNECTION_NOT_FOUND')) {
      return noCacheErrorResponse(
        { error: 'Connection not found or access denied' },
        404
      );
    }

    // Return a failed health check result rather than error for consistency
    return noCacheResponse({
      success: false,
      message: 'Health check failed due to network or server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}