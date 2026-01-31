/**
 * Worker API Proxy Routes
 * Handles proxying requests to the Worker service with proper HMAC authentication
 * Supports both GET and POST requests with path parameters
 */

import { NextRequest, NextResponse } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'https://worker.sheenapps.com';

/**
 * Handle GET requests to worker endpoints
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathWithQuery = `/v1/${path.join('/')}${req.nextUrl.search}`;
    const body = '';

    const headers = createWorkerAuthHeaders('GET', pathWithQuery, body, {
      'User-Agent': 'SheenApps-NextJS/1.0'
    });

    logger.info(`🔄 Proxying GET request to Worker API: ${pathWithQuery}`);

    const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
      method: 'GET',
      headers,
    });

    // Handle non-JSON responses (like file downloads)
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // For non-JSON responses (binary data, etc.)
      const buffer = await response.arrayBuffer();
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Content-Length': buffer.byteLength.toString(),
        },
      });
    }

    return NextResponse.json(data, { 
      status: response.status,
      headers: {
        // Pass through rate limiting headers
        'x-ratelimit-limit': response.headers.get('x-ratelimit-limit') || '',
        'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining') || '',
        'x-ratelimit-reset': response.headers.get('x-ratelimit-reset') || '',
      }
    });

  } catch (error) {
    logger.error('❌ Worker API proxy GET error:', error);
    
    return NextResponse.json(
      { 
        error: 'Worker API proxy failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST requests to worker endpoints
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathWithQuery = `/v1/${path.join('/')}${req.nextUrl.search}`;
    const body = await req.text();

    const headers = createWorkerAuthHeaders('POST', pathWithQuery, body, {
      'User-Agent': 'SheenApps-NextJS/1.0'
    });

    logger.info(`🔄 Proxying POST request to Worker API: ${pathWithQuery}`, {
      bodyLength: body.length,
      hasBody: body.length > 0
    });

    const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
      method: 'POST',
      headers,
      body: body || undefined,
    });

    const data = await response.json();

    return NextResponse.json(data, { 
      status: response.status,
      headers: {
        // Pass through rate limiting headers
        'x-ratelimit-limit': response.headers.get('x-ratelimit-limit') || '',
        'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining') || '',
        'x-ratelimit-reset': response.headers.get('x-ratelimit-reset') || '',
      }
    });

  } catch (error) {
    logger.error('❌ Worker API proxy POST error:', error);
    
    return NextResponse.json(
      { 
        error: 'Worker API proxy failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle PUT requests to worker endpoints
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathWithQuery = `/v1/${path.join('/')}${req.nextUrl.search}`;
    const body = await req.text();

    const headers = createWorkerAuthHeaders('PUT', pathWithQuery, body, {
      'User-Agent': 'SheenApps-NextJS/1.0'
    });

    logger.info(`🔄 Proxying PUT request to Worker API: ${pathWithQuery}`);

    const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
      method: 'PUT',
      headers,
      body: body || undefined,
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });

  } catch (error) {
    logger.error('❌ Worker API proxy PUT error:', error);
    
    return NextResponse.json(
      { 
        error: 'Worker API proxy failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle DELETE requests to worker endpoints
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathWithQuery = `/v1/${path.join('/')}${req.nextUrl.search}`;
    const body = '';

    const headers = createWorkerAuthHeaders('DELETE', pathWithQuery, body, {
      'User-Agent': 'SheenApps-NextJS/1.0'
    });

    logger.info(`🔄 Proxying DELETE request to Worker API: ${pathWithQuery}`);

    const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
      method: 'DELETE',
      headers,
    });

    // Handle responses that might not have a body
    let data;
    try {
      data = await response.json();
    } catch {
      data = { success: response.ok };
    }

    return NextResponse.json(data, { status: response.status });

  } catch (error) {
    logger.error('❌ Worker API proxy DELETE error:', error);
    
    return NextResponse.json(
      { 
        error: 'Worker API proxy failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}