/**
 * Export Download API Route
 * GET /api/projects/[id]/export/[jobId]/download - Download export file
 * Handles 302 redirects to signed URLs from the backend worker service
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
 * Download export file - handles redirect to signed URL
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: projectId, jobId } = await params;
    const { searchParams } = new URL(req.url);
    const userId = await getCurrentUserId();
    
    // Optional session ID for tracking
    const sessionId = searchParams.get('sessionId');

    logger.info(`⬇️ Export download request for project: ${projectId}, job: ${jobId}`, {
      userId: userId.slice(0, 8),
      projectId: projectId.slice(0, 8),
      jobId: jobId.slice(0, 8),
      hasSessionId: !!sessionId
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
    if (sessionId) {
      params_query.set('sessionId', sessionId);
    }
    const endpoint = `/api/projects/${projectId}/export/${jobId}/download?${params_query.toString()}`;

    // Generate HMAC authentication headers
    const authHeaders = createWorkerAuthHeaders('GET', endpoint, '');

    // Forward request to backend worker service
    const workerResponse = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'GET',
      headers: authHeaders,
      redirect: 'manual', // Handle redirects manually
    });

    // Handle successful redirect (302) - this means the download URL is ready
    if (workerResponse.status === 302) {
      const redirectUrl = workerResponse.headers.get('Location');
      
      if (redirectUrl) {
        logger.info(`✅ Export download redirect for project ${projectId}, job ${jobId}`, {
          hasRedirectUrl: true
        });

        // Return redirect to the signed download URL
        return NextResponse.redirect(redirectUrl, 302);
      } else {
        logger.error(`❌ No redirect URL provided for project ${projectId}, job ${jobId}`);
        return noCacheErrorResponse(
          { error: 'Download URL not available' },
          500
        );
      }
    }

    // Handle other response statuses
    let responseData;
    try {
      responseData = await workerResponse.json();
    } catch {
      responseData = { error: 'Invalid response from export service' };
    }

    if (!workerResponse.ok) {
      logger.error(`❌ Worker export download failed for project ${projectId}, job ${jobId}:`, {
        status: workerResponse.status,
        error: responseData
      });

      return noCacheErrorResponse(responseData, workerResponse.status);
    }

    // Should not reach here with current backend implementation, but handle gracefully
    logger.warn(`⚠️ Unexpected success response for export download (expected 302):`, {
      status: workerResponse.status,
      projectId: projectId.slice(0, 8),
      jobId: jobId.slice(0, 8)
    });

    return noCacheResponse(responseData);

  } catch (error) {
    logger.error('❌ Export download API error:', error);
    
    return noCacheErrorResponse(
      {
        error: 'Failed to download export',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
}