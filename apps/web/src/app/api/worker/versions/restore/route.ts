/**
 * API Route: Restore Version
 * Restore a previous version (creates a new version from an old one)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/server/supabase';
import { versionService } from '@/server/services/version-management';
import { logger } from '@/utils/logger';

// Force dynamic to prevent caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/worker/versions/restore
 * Restore from a specific version (creates new version)
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
    const { projectId, sourceVersionId, createBackup, comment } = body;

    if (!projectId || !sourceVersionId) {
      return NextResponse.json(
        { error: 'Project ID and Source Version ID are required' },
        { status: 400 }
      );
    }

    logger.info(`🔄 Restoring project ${projectId} from version ${sourceVersionId}`, {
      userId: user.id,
      createBackup,
      comment
    });

    // Worker API uses rollback endpoint for version restore operations
    const result = await versionService.restoreVersion(
      projectId,
      sourceVersionId,
      user.id,
      {
        createBackup,
        comment
      }
    );

    logger.info(`✅ Version restored successfully - new version: ${result.newVersionId}`);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to restore version:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to restore version',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}