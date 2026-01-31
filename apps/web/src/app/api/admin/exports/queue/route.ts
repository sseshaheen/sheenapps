/**
 * Admin Export Queue Status API Route
 * GET /api/admin/exports/queue - Get export queue status and metrics
 * Admin only endpoint for monitoring export system health
 */

import { NextRequest } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import { AdminAuthService } from '@/lib/admin/admin-auth-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Get export queue status and worker metrics (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    // Validate admin session
    const session = await AdminAuthService.getAdminSession();
    if (!session) {
      return noCacheErrorResponse(
        { error: 'Admin authentication required' },
        401
      );
    }

    logger.info(`📊 Admin export queue status request`, {
      adminId: session.adminId?.slice(0, 8)
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

    const endpoint = '/api/admin/exports/queue';

    // Generate HMAC authentication headers
    const authHeaders = createWorkerAuthHeaders('GET', endpoint, '');

    // Forward request to backend worker service
    const workerResponse = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'GET',
      headers: authHeaders,
    });

    const responseData = await workerResponse.json();

    if (!workerResponse.ok) {
      logger.error(`❌ Admin export queue status failed:`, {
        status: workerResponse.status,
        error: responseData,
        adminId: session.adminId?.slice(0, 8)
      });

      return noCacheErrorResponse(responseData, workerResponse.status);
    }

    logger.info(`✅ Admin export queue status retrieved`, {
      adminId: session.adminId?.slice(0, 8),
      queueWaiting: responseData.queue?.waiting,
      queueActive: responseData.queue?.active,
      workerRunning: responseData.worker?.isRunning
    });

    return noCacheResponse(responseData);

  } catch (error) {
    logger.error('❌ Admin export queue status API error:', error);
    
    return noCacheErrorResponse(
      {
        error: 'Failed to get export queue status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
}