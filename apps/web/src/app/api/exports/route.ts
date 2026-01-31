/**
 * Exports List API Route
 * GET /api/exports - List user's export jobs with pagination and filtering
 * Proxies requests to the backend worker export service
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/utils/auth';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * List user's export jobs with optional filtering
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = await getCurrentUserId();
    
    // Extract query parameters
    const projectId = searchParams.get('projectId');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    logger.info(`📋 Export list request`, {
      userId: userId.slice(0, 8),
      projectId: projectId?.slice(0, 8),
      limit,
      offset
    });

    // Prepare request for backend worker
    const workerBaseUrl = process.env.WORKER_BASE_URL;
    if (!workerBaseUrl) {
      logger.error('WORKER_BASE_URL not configured');
      return noCacheErrorResponse(
        { error: 'Export service not available' },
        503
      );
    }

    // Build query parameters for backend request
    const params_query = new URLSearchParams({ userId });
    if (projectId) params_query.set('projectId', projectId);
    if (limit) params_query.set('limit', limit);
    if (offset) params_query.set('offset', offset);

    const endpoint = `/api/exports?${params_query.toString()}`;

    // Generate HMAC authentication headers
    const authHeaders = createWorkerAuthHeaders('GET', endpoint, '');

    // Forward request to backend worker service
    const workerResponse = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'GET',
      headers: authHeaders,
    });

    const responseData = await workerResponse.json();

    if (!workerResponse.ok) {
      logger.error(`❌ Worker export list failed:`, {
        status: workerResponse.status,
        error: responseData,
        userId: userId.slice(0, 8)
      });

      return noCacheErrorResponse(responseData, workerResponse.status);
    }

    logger.info(`✅ Export list retrieved`, {
      userId: userId.slice(0, 8),
      count: responseData.exports?.length || 0,
      totalCount: responseData.totalCount,
      hasMore: responseData.hasMore
    });

    return noCacheResponse(responseData);

  } catch (error) {
    logger.error('❌ Export list API error:', error);
    
    return noCacheErrorResponse(
      {
        error: 'Failed to list exports',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
}