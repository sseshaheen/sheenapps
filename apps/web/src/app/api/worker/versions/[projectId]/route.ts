/**
 * API Route: Version History
 * Provides client-safe access to version management operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/server/supabase';
import { versionService } from '@/server/services/version-management';
import { logger } from '@/utils/logger';

// Force dynamic to prevent caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/worker/versions/[projectId]
 * Fetch version history for a project
 */
export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  try {
    // Authenticate user
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { projectId } = await params;
    const searchParams = req.nextUrl.searchParams;

    // Parse query parameters
    const queryParams = {
      state: searchParams.get('state') as 'all' | 'published' | 'unpublished' || 'all',
      limit: parseInt(searchParams.get('limit') || '20'),
      offset: parseInt(searchParams.get('offset') || '0'),
      includePatches: searchParams.get('includePatches') === 'true',
      showDeleted: searchParams.get('showDeleted') === 'true'
    };

    logger.info(`📋 Fetching version history for project ${projectId}`, {
      userId: user.id,
      params: queryParams
    });

    // Fetch version history from Worker API
    const response = await versionService.getVersionHistory(projectId, queryParams);

    logger.info(`✅ Retrieved ${response.versions.length} versions for project ${projectId}`);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to fetch version history:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch version history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}