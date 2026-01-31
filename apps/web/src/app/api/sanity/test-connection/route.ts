/**
 * Sanity Test Connection API Route
 * Tests Sanity credentials before creating connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSanityAPIClient } from '@/services/sanity-api-client';
import { getCurrentUserId } from '@/lib/server/auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import type { TestSanityConnectionRequest } from '@/types/sanity-integration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Test Sanity connection credentials
 * POST /api/sanity/test-connection
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401);
    }

    const body: TestSanityConnectionRequest = await request.json();

    // Validate required fields
    if (!body.projectId || !body.dataset || !body.token) {
      return noCacheErrorResponse(
        { error: 'Missing required fields: projectId, dataset, token' },
        400
      );
    }

    logger.info('🔍 Testing Sanity connection', { 
      userId,
      projectId: body.projectId,
      dataset: body.dataset
    });

    const sanityClient = getSanityAPIClient();
    const result = await sanityClient.testConnection(body);

    logger.info('✅ Sanity connection test completed', { 
      userId,
      success: result.success,
      projectId: body.projectId
    });

    return noCacheResponse(result);

  } catch (error) {
    logger.error('🚨 Sanity connection test failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    // Handle specific Sanity API errors
    if (error instanceof Error) {
      if (error.message.includes('SANITY_API_ERROR')) {
        return noCacheResponse({
          success: false,
          message: 'Invalid Sanity credentials or project not accessible',
          error: 'Authentication failed'
        });
      }
      
      if (error.message.includes('TOKEN_EXPIRED')) {
        return noCacheResponse({
          success: false,
          message: 'Sanity token has expired',
          error: 'Token expired'
        });
      }

      if (error.message.includes('RATE_LIMITED')) {
        return noCacheResponse({
          success: false,
          message: 'Rate limit exceeded. Please try again later.',
          error: 'Rate limited'
        }, { status: 429 });
      }
    }

    return noCacheResponse({
      success: false,
      message: 'Connection test failed due to network or server error',
      error: 'Test failed'
    });
  }
}