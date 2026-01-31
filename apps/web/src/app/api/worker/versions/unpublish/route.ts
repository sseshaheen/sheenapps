/**
 * API Route: Unpublish Version
 * Takes the current live version offline
 */

import { getServerUser } from '@/lib/server/supabase';
import { versionService } from '@/server/services/version-management';
import { logger } from '@/utils/logger';
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic to prevent caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /projects/:projectId/unpublish
 * Unpublish the current live version
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    logger.info(`🔻 Unpublishing project ${projectId}`, {
      userId: user.id
    });

    // Generate idempotency key
    const idempotencyKey = versionService.generateIdempotencyKey('unpublish', projectId);

    // Unpublish the version
    const result = await versionService.unpublishVersion(
      projectId,
      user.id,
      idempotencyKey
    );

    logger.info(`✅ Project ${projectId} unpublished successfully`);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to unpublish:', error);

    return NextResponse.json(
      {
        error: 'Failed to unpublish',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
