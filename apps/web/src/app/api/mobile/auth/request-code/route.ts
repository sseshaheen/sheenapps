/**
 * Mobile Auth: Request OTP Code
 *
 * Sends a 6-digit OTP code to the user's email.
 * Also includes a magic link as a fallback option.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';

const WORKER_BASE_URL =
  process.env.WORKER_BASE_URL || 'https://worker.sheenapps.com';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, deviceId } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json(
        { error: 'Device ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Forward to worker
    const workerPath = '/v1/platform/auth/request-code';
    const workerBody = JSON.stringify({
      email: normalizedEmail,
      deviceId,
      platform: 'mobile',
    });

    const headers = createWorkerAuthHeaders('POST', workerPath, workerBody, {
      'Content-Type': 'application/json',
      'User-Agent': 'SheenApps-Mobile-Auth/1.0',
    });

    logger.info(`📱 Mobile auth: requesting code for ${normalizedEmail}`);

    const response = await fetch(`${WORKER_BASE_URL}${workerPath}`, {
      method: 'POST',
      headers,
      body: workerBody,
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn(`📱 Mobile auth: code request failed`, {
        email: normalizedEmail,
        status: response.status,
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('❌ Mobile auth request-code error:', error);

    return NextResponse.json(
      {
        error: 'Failed to send code',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
