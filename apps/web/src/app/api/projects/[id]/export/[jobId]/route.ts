/**
 * Export Job Status API Route
 * GET /api/projects/[id]/export/[jobId] - Get export job status and progress
 * DELETE /api/projects/[id]/export/[jobId] - Cancel export job
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/utils/auth';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import { getLocaleFromRequest } from '@/lib/server-locale-utils';
import { createLocalizedErrorResponse } from '@/lib/api/error-messages';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Get export job status and progress
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const locale = await getLocaleFromRequest(req);

  try {
    const { id: projectId, jobId } = await params;
    const { searchParams } = new URL(req.url);
    const userId = await getCurrentUserId();

    logger.info(`🔍 Export status check for project: ${projectId}, job: ${jobId}`, {
      userId: userId.slice(0, 8),
      projectId: projectId.slice(0, 8),
      jobId: jobId.slice(0, 8)
    });

    // Validate IDs
    if (!projectId || !jobId) {
      return noCacheErrorResponse(
        { error: 'Invalid project ID or job ID' },
        400
      );
    }

    // Prepare request for backend worker
    const workerBaseUrl = process.env.WORKER_BASE_URL;
    if (!workerBaseUrl) {
      logger.error('WORKER_BASE_URL not configured');
      return noCacheErrorResponse(
        { error: 'Export service not available' },
        503
      );
    }

    // Build endpoint with query parameters
    const params_query = new URLSearchParams({ userId });
    const endpoint = `/api/projects/${projectId}/export/${jobId}?${params_query.toString()}`;

    // Generate HMAC authentication headers
    const authHeaders = createWorkerAuthHeaders('GET', endpoint, '');

    // Forward request to backend worker service
    const workerResponse = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'GET',
      headers: authHeaders,
    });

    const responseData = await workerResponse.json();

    if (!workerResponse.ok) {
      logger.error(`❌ Worker export status failed for project ${projectId}, job ${jobId}:`, {
        status: workerResponse.status,
        error: responseData
      });

      return noCacheErrorResponse(responseData, workerResponse.status);
    }

    logger.info(`✅ Export status retrieved for project ${projectId}, job ${jobId}`, {
      status: responseData.status,
      phase: responseData.progress?.phase
    });

    return noCacheResponse(responseData);

  } catch (error) {
    logger.error('❌ Export status API error:', error);
    
    return noCacheErrorResponse(
      {
        error: 'Failed to get export status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
}

/**
 * Cancel export job
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: projectId, jobId } = await params;
    const userId = await getCurrentUserId();

    logger.info(`🛑 Cancel export for project: ${projectId}, job: ${jobId}`, {
      userId: userId.slice(0, 8),
      projectId: projectId.slice(0, 8),
      jobId: jobId.slice(0, 8)
    });

    // Validate IDs
    if (!projectId || !jobId) {
      return noCacheErrorResponse(
        { error: 'Invalid project ID or job ID' },
        400
      );
    }

    // Prepare request for backend worker
    const workerBaseUrl = process.env.WORKER_BASE_URL;
    if (!workerBaseUrl) {
      logger.error('WORKER_BASE_URL not configured');
      return noCacheErrorResponse(
        { error: 'Export service not available' },
        503
      );
    }

    const endpoint = `/api/projects/${projectId}/export/${jobId}`;
    const requestBody = JSON.stringify({ userId });

    // Generate HMAC authentication headers
    const authHeaders = createWorkerAuthHeaders('DELETE', endpoint, requestBody);

    // Forward request to backend worker service
    const workerResponse = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'DELETE',
      body: requestBody,
      headers: authHeaders,
    });

    const responseData = await workerResponse.json();

    if (!workerResponse.ok) {
      logger.error(`❌ Worker export cancel failed for project ${projectId}, job ${jobId}:`, {
        status: workerResponse.status,
        error: responseData
      });

      return noCacheErrorResponse(responseData, workerResponse.status);
    }

    logger.info(`✅ Export cancelled for project ${projectId}, job ${jobId}`);

    return noCacheResponse(responseData);

  } catch (error) {
    logger.error('❌ Export cancel API error:', error);
    
    return noCacheErrorResponse(
      {
        error: 'Failed to cancel export',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
}