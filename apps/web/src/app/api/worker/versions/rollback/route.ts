/**
 * API Route: Rollback Version
 * Rollback to a previous version with immediate preview update
 */

import { getServerUser } from '@/lib/server/supabase';
import { versionService } from '@/server/services/version-management';
import { logger } from '@/utils/logger';
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic to prevent caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /v1/versions/rollback
 * Rollback to a specific version
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
    const { projectId, targetVersionId, skipWorkingDirectory } = body;

    if (!projectId || !targetVersionId) {
      return NextResponse.json(
        { error: 'Project ID and Target Version ID are required' },
        { status: 400 }
      );
    }

    logger.info(`⏪ Rolling back project ${projectId} to version ${targetVersionId}`, {
      userId: user.id,
      skipWorkingDirectory
    });

    // Generate idempotency key
    const idempotencyKey = versionService.generateIdempotencyKey('rollback', projectId);

    // Perform the rollback
    const result = await versionService.rollbackVersion(
      projectId,
      targetVersionId,
      user.id,
      idempotencyKey,
      skipWorkingDirectory
    );

    logger.info(`✅ Rollback initiated for project ${projectId}`);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to rollback:', error);

    return NextResponse.json(
      {
        error: 'Failed to rollback',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
