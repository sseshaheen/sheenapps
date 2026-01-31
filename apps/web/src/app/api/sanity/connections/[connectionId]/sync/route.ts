/**
 * Sanity Document Sync API Route
 * Handles synchronization of documents from Sanity
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSanityAPIClient } from '@/services/sanity-api-client';
import { getCurrentUserId } from '@/lib/server/auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import type { SyncDocumentsRequest } from '@/types/sanity-integration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Sync documents from Sanity
 * POST /api/sanity/connections/[connectionId]/sync
 */
export async function POST(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401);
    }

    const { connectionId } = params;
    const { searchParams } = new URL(request.url);
    
    const options: SyncDocumentsRequest = {
      force: searchParams.get('force') === 'true'
    };

    logger.info('🔄 Starting Sanity document sync', { 
      userId, 
      connectionId,
      force: options.force
    });

    const sanityClient = getSanityAPIClient();
    const result = await sanityClient.syncDocuments(connectionId, options);

    logger.info('✅ Sanity document sync completed', { 
      userId, 
      connectionId,
      synced: result.documents_synced,
      created: result.documents_created,
      updated: result.documents_updated,
      deleted: result.documents_deleted,
      duration: result.sync_duration_ms,
      errors: result.errors.length
    });

    return noCacheResponse(result);

  } catch (error) {
    logger.error('🚨 Sanity document sync failed', {
      connectionId: params?.connectionId,
      error: error instanceof Error ? error.message : String(error)
    });

    if (error instanceof Error && error.message.includes('CONNECTION_NOT_FOUND')) {
      return noCacheErrorResponse(
        { error: 'Connection not found or access denied' },
        404
      );
    }

    if (error instanceof Error && error.message.includes('CIRCUIT_BREAKER_OPEN')) {
      return noCacheErrorResponse(
        { error: 'Connection temporarily unavailable due to too many errors' },
        503
      );
    }

    return noCacheErrorResponse(
      { error: 'Document sync failed' },
      500
    );
  }
}