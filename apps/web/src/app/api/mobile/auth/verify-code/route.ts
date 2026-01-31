/**
 * Mobile Auth: Verify OTP Code
 *
 * Verifies the 6-digit OTP code and returns session tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';

const WORKER_BASE_URL =
  process.env.WORKER_BASE_URL || 'https://worker.sheenapps.com';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, code, deviceId } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json(
        { error: 'Valid 6-digit code is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json(
        { error: 'Device ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Normalize
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = code.replace(/\D/g, '');

    // Forward to worker
    const workerPath = '/v1/platform/auth/verify-code';
    const workerBody = JSON.stringify({
      email: normalizedEmail,
      code: normalizedCode,
      deviceId,
      platform: 'mobile',
    });

    const headers = createWorkerAuthHeaders('POST', workerPath, workerBody, {
      'Content-Type': 'application/json',
      'User-Agent': 'SheenApps-Mobile-Auth/1.0',
    });

    logger.info(`📱 Mobile auth: verifying code for ${normalizedEmail}`);

    const response = await fetch(`${WORKER_BASE_URL}${workerPath}`, {
      method: 'POST',
      headers,
      body: workerBody,
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn(`📱 Mobile auth: code verification failed`, {
        email: normalizedEmail,
        status: response.status,
      });

      // Map worker error codes to mobile-friendly responses
      if (response.status === 400) {
        return NextResponse.json(
          { error: 'Invalid code', code: 'INVALID_CODE' },
          { status: 400 }
        );
      }
      if (response.status === 410) {
        return NextResponse.json(
          { error: 'Code expired', code: 'CODE_EXPIRED' },
          { status: 410 }
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'Too many attempts', code: 'RATE_LIMITED' },
          { status: 429 }
        );
      }
    }

    logger.info(`📱 Mobile auth: verified ${normalizedEmail}`);

    // Return session tokens
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('❌ Mobile auth verify-code error:', error);

    return NextResponse.json(
      {
        error: 'Failed to verify code',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
