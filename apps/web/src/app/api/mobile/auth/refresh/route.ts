/**
 * Mobile Auth: Refresh Token
 *
 * Exchanges a valid refresh token for a new access token.
 * Called automatically by mobile app when access token expires.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';

const WORKER_BASE_URL =
  process.env.WORKER_BASE_URL || 'https://worker.sheenapps.com';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken, deviceId } = body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return NextResponse.json(
        { error: 'Refresh token is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json(
        { error: 'Device ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Forward to worker
    const workerPath = '/v1/platform/auth/refresh';
    const workerBody = JSON.stringify({
      refreshToken,
      deviceId,
      platform: 'mobile',
    });

    const headers = createWorkerAuthHeaders('POST', workerPath, workerBody, {
      'Content-Type': 'application/json',
      'User-Agent': 'SheenApps-Mobile-Auth/1.0',
    });

    logger.info(`📱 Mobile auth: refreshing token`);

    const response = await fetch(`${WORKER_BASE_URL}${workerPath}`, {
      method: 'POST',
      headers,
      body: workerBody,
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn(`📱 Mobile auth: token refresh failed`, {
        status: response.status,
      });

      // Map worker error codes to mobile-friendly responses
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Invalid refresh token', code: 'INVALID_TOKEN' },
          { status: 401 }
        );
      }
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'Token revoked', code: 'TOKEN_REVOKED' },
          { status: 403 }
        );
      }
    }

    logger.info(`📱 Mobile auth: token refreshed successfully`);

    // Return new tokens
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('❌ Mobile auth refresh error:', error);

    return NextResponse.json(
      {
        error: 'Failed to refresh token',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
