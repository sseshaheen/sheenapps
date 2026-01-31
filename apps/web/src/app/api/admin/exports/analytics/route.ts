/**
 * Admin Export Analytics API Route
 * GET /api/admin/exports/analytics - Get export analytics and usage statistics
 */

import { NextRequest } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import { AdminAuthService } from '@/lib/admin/admin-auth-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  try {
    const session = await AdminAuthService.getAdminSession();
    if (!session) {
      return noCacheErrorResponse({ error: 'Admin authentication required' }, 401);
    }

    const { searchParams } = new URL(req.url);
    const days = searchParams.get('days');
    const userId = searchParams.get('userId');
    const projectId = searchParams.get('projectId');

    const workerBaseUrl = process.env.WORKER_BASE_URL;
    if (!workerBaseUrl) {
      return noCacheErrorResponse({ error: 'Export service not available' }, 503);
    }

    const params = new URLSearchParams();
    if (days) params.set('days', days);
    if (userId) params.set('userId', userId);
    if (projectId) params.set('projectId', projectId);

    const endpoint = `/api/admin/exports/analytics?${params.toString()}`;
    const authHeaders = createWorkerAuthHeaders('GET', endpoint, '');

    const workerResponse = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'GET',
      headers: authHeaders,
    });

    const responseData = await workerResponse.json();

    if (!workerResponse.ok) {
      logger.error('Admin export analytics failed:', { status: workerResponse.status, error: responseData });
      return noCacheErrorResponse(responseData, workerResponse.status);
    }

    return noCacheResponse(responseData);

  } catch (error) {
    logger.error('Admin export analytics API error:', error);
    return noCacheErrorResponse({ error: 'Failed to get export analytics' }, 500);
  }
}