/**
 * Project Export API Route
 * Proxies requests to the backend worker export service with HMAC authentication
 * Integrates with the new backend worker export system
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/utils/auth';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import { getLocaleFromRequest } from '@/lib/server-locale-utils';
import { createLocalizedErrorResponse } from '@/lib/api/error-messages';
import type { CreateExportRequest } from '@/types/export';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Create export job - proxies to backend worker service
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getLocaleFromRequest(req);

  try {
    const { id: projectId } = await params;

    // Get current user
    const userId = await getCurrentUserId();
    
    // Parse request body
    const body = await req.json();
    const { versionId, clientRequestId } = body;

    logger.info(`📦 Export request for project: ${projectId}`, {
      userId: userId.slice(0, 8),
      projectId: projectId.slice(0, 8),
      versionId: versionId?.slice(0, 8)
    });

    // Validate project ID
    if (!projectId || projectId.length < 3) {
      const errorResponse = await createLocalizedErrorResponse(
        req,
        'export.invalidProject',
        'INVALID_PROJECT_ID'
      );

      const response = NextResponse.json(errorResponse, { status: 400 });
      response.headers.set('Content-Language', locale);
      response.headers.set('Vary', 'x-sheen-locale, Accept-Language');
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return response;
    }

    // Prepare request for backend worker
    const workerBaseUrl = process.env.WORKER_BASE_URL;
    if (!workerBaseUrl) {
      logger.error('WORKER_BASE_URL not configured');
      const errorResponse = await createLocalizedErrorResponse(
        req,
        'export.serviceUnavailable',
        'SERVICE_UNAVAILABLE'
      );

      const response = NextResponse.json(errorResponse, { status: 503 });
      response.headers.set('Content-Language', locale);
      response.headers.set('Vary', 'x-sheen-locale, Accept-Language');
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return response;
    }

    const exportRequest: CreateExportRequest = {
      userId,
      projectId,
      versionId,
      exportType: 'zip',
      clientRequestId: clientRequestId || crypto.randomUUID(),
    };

    const endpoint = `/api/projects/${projectId}/export`;
    const requestBody = JSON.stringify(exportRequest);

    // Generate HMAC authentication headers
    const authHeaders = createWorkerAuthHeaders(
      'POST',
      endpoint,
      requestBody
    );

    // Forward request to backend worker service
    const workerResponse = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'POST',
      body: requestBody,
      headers: authHeaders,
    });

    const responseData = await workerResponse.json();

    if (!workerResponse.ok) {
      logger.error(`❌ Worker export failed for project ${projectId}:`, {
        status: workerResponse.status,
        error: responseData
      });

      return noCacheErrorResponse(responseData, workerResponse.status);
    }

    logger.info(`✅ Export job created for project ${projectId}`, {
      jobId: responseData.jobId?.slice(0, 8),
      status: responseData.status
    });

    const response = NextResponse.json(responseData);
    response.headers.set('Content-Language', locale);
    response.headers.set('Vary', 'x-sheen-locale, Accept-Language');
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;

  } catch (error) {
    logger.error('❌ Export API error:', error);

    const errorResponse = await createLocalizedErrorResponse(
      req,
      'general.internalError',
      'INTERNAL_ERROR'
    );

    const response = NextResponse.json(errorResponse, { status: 500 });
    response.headers.set('Content-Language', locale);
    response.headers.set('Vary', 'x-sheen-locale, Accept-Language');
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  }
}

/**
 * GET method not used in new backend system
 * Use separate endpoints instead:
 * - GET /api/projects/[id]/export/[jobId] - for status
 * - GET /api/projects/[id]/export/[jobId]/download - for download
 * - GET /api/exports - for listing exports
 */
export async function GET(req: NextRequest) {
  const locale = await getLocaleFromRequest(req);

  const errorResponse = await createLocalizedErrorResponse(
    req,
    'general.invalidRequest',
    'METHOD_NOT_ALLOWED'
  );

  const response = NextResponse.json({
    ...errorResponse,
    endpoints: {
      status: '/api/projects/[projectId]/export/[jobId]',
      download: '/api/projects/[projectId]/export/[jobId]/download',
      list: '/api/exports'
    }
  }, { status: 405 });

  response.headers.set('Content-Language', locale);
  response.headers.set('Vary', 'x-sheen-locale, Accept-Language');
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}