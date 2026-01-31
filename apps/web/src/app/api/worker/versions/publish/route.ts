/**
 * API Route: Publish Version
 * Makes a version live on all configured domains
 */

import { getServerUser } from '@/lib/server/supabase';
import { versionService } from '@/server/services/version-management';
import { logger } from '@/utils/logger';
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic to prevent caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /projects/:projectId/publish/:versionId
 * Publish a specific version
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
    const { projectId, versionId, comment } = body;

    if (!projectId || !versionId) {
      return NextResponse.json(
        { error: 'Project ID and Version ID are required' },
        { status: 400 }
      );
    }

    logger.info(`🚀 Publishing version ${versionId} for project ${projectId}`, {
      userId: user.id,
      comment
    });

    // Generate idempotency key
    const idempotencyKey = versionService.generateIdempotencyKey('publish', projectId);

    // Publish the version
    const result = await versionService.publishVersion(
      projectId,
      versionId,
      user.id,
      idempotencyKey,
      comment
    );

    logger.info(`✅ Version ${versionId} published successfully`);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to publish version:', error);

    return NextResponse.json(
      {
        error: 'Failed to publish version',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
