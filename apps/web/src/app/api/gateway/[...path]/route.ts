/**
 * Mobile API Gateway
 *
 * Thin BFF that proxies mobile app requests to the worker with HMAC authentication.
 * Mobile apps cannot safely store HMAC secrets, so this gateway:
 * 1. Validates mobile session token (from Authorization header)
 * 2. Signs requests with HMAC
 * 3. Forwards to worker with user context
 *
 * Path mapping: /api/gateway/projects/123 → /v1/inhouse/projects/123
 */

import { NextRequest, NextResponse } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';
import {
  validateMobileSession,
  type MobileSession,
} from '@/lib/auth/mobile-session';

const WORKER_BASE_URL =
  process.env.WORKER_BASE_URL || 'https://worker.sheenapps.com';

/**
 * Extract project ID from path for tenant scoping
 * e.g., /projects/123/kpi → 123
 */
function extractProjectId(path: string): string | null {
  const match = path.match(/\/projects\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Handle gateway request with HMAC signing
 */
async function handleGatewayRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // 1. Validate mobile session token against database
    const authHeader = req.headers.get('authorization');
    const session = await validateMobileSession(authHeader);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 2. Build worker path (gateway → inhouse namespace)
    const { path } = await params;
    const pathWithQuery = `/v1/inhouse/${path.join('/')}${req.nextUrl.search}`;

    // 3. Enforce tenant scope (cheap deny before hitting worker)
    const projectId = extractProjectId(pathWithQuery);
    if (projectId && session.projectIds.length > 0) {
      if (!session.projectIds.includes(projectId)) {
        logger.warn(
          `🚫 Mobile gateway: user ${session.userId} denied access to project ${projectId}`
        );
        return NextResponse.json(
          { error: 'Forbidden', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
    }

    // 4. Read body for non-GET requests
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let body = '';
    let contentType: string | null = null;

    if (hasBody) {
      body = await req.text();
      contentType = req.headers.get('content-type');
    }

    // 5. Create HMAC auth headers
    const headers = createWorkerAuthHeaders(req.method, pathWithQuery, body, {
      'User-Agent': 'SheenApps-Mobile-Gateway/1.0',
      'x-user-id': session.userId,
      'x-project-id': projectId || '',
      'x-device-id': req.headers.get('x-device-id') || '',
      ...(contentType ? { 'Content-Type': contentType } : {}),
    });

    logger.info(`🔄 Mobile gateway ${req.method} ${pathWithQuery}`, {
      userId: session.userId,
      projectId,
      hasBody: body.length > 0,
    });

    // 6. Forward to worker
    const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
      method: req.method,
      headers,
      body: hasBody ? body : undefined,
    });

    // 7. Handle response
    const responseContentType = response.headers.get('content-type');

    if (responseContentType?.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, {
        status: response.status,
        headers: {
          'x-ratelimit-limit': response.headers.get('x-ratelimit-limit') || '',
          'x-ratelimit-remaining':
            response.headers.get('x-ratelimit-remaining') || '',
          'x-ratelimit-reset': response.headers.get('x-ratelimit-reset') || '',
        },
      });
    } else if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    } else {
      // Non-JSON response (binary data)
      const buffer = await response.arrayBuffer();
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': responseContentType || 'application/octet-stream',
        },
      });
    }
  } catch (error) {
    logger.error('❌ Mobile gateway error:', error);

    return NextResponse.json(
      {
        error: 'Gateway error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Export handlers for all HTTP methods
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleGatewayRequest(req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleGatewayRequest(req, context);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleGatewayRequest(req, context);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleGatewayRequest(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleGatewayRequest(req, context);
}
