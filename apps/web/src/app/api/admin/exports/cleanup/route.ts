/**
 * Admin Export Cleanup API Route
 * POST /api/admin/exports/cleanup - Cleanup expired exports and old files
 */

import { NextRequest } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import { AdminAuthService } from '@/lib/admin/admin-auth-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  try {
    const session = await AdminAuthService.getAdminSession();
    if (!session) {
      return noCacheErrorResponse({ error: 'Admin authentication required' }, 401);
    }

    const workerBaseUrl = process.env.WORKER_BASE_URL;
    if (!workerBaseUrl) {
      return noCacheErrorResponse({ error: 'Export service not available' }, 503);
    }

    const endpoint = '/api/admin/exports/cleanup';
    const authHeaders = createWorkerAuthHeaders('POST', endpoint, '');

    const workerResponse = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: authHeaders,
    });

    const responseData = await workerResponse.json();

    if (!workerResponse.ok) {
      logger.error('Admin export cleanup failed:', { status: workerResponse.status, error: responseData });
      return noCacheErrorResponse(responseData, workerResponse.status);
    }

    logger.info('Admin export cleanup completed:', responseData);
    return noCacheResponse(responseData);

  } catch (error) {
    logger.error('Admin export cleanup API error:', error);
    return noCacheErrorResponse({ error: 'Failed to cleanup exports' }, 500);
  }
}