/**
 * Sanity Documents API Route
 * Handles document listing and filtering for a connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSanityAPIClient } from '@/services/sanity-api-client';
import { getCurrentUserId } from '@/lib/server/auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import type { GetDocumentsFilters } from '@/types/sanity-integration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Get documents for a Sanity connection
 * GET /api/sanity/connections/[connectionId]/documents
 */
export async function GET(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401);
    }

    const { connectionId } = params;
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters into filters
    const filters: GetDocumentsFilters = {};
    
    if (searchParams.get('document_type')) {
      filters.document_type = searchParams.get('document_type')!;
    }
    
    if (searchParams.get('version_type')) {
      const versionType = searchParams.get('version_type');
      if (versionType === 'draft' || versionType === 'published') {
        filters.version_type = versionType;
      }
    }
    
    if (searchParams.get('language')) {
      filters.language = searchParams.get('language')!;
    }
    
    if (searchParams.get('limit')) {
      const limit = parseInt(searchParams.get('limit')!);
      if (!isNaN(limit) && limit > 0 && limit <= 500) {
        filters.limit = limit;
      }
    }
    
    if (searchParams.get('offset')) {
      const offset = parseInt(searchParams.get('offset')!);
      if (!isNaN(offset) && offset >= 0) {
        filters.offset = offset;
      }
    }

    logger.info('📄 Getting Sanity documents', { 
      userId, 
      connectionId,
      filters
    });

    const sanityClient = getSanityAPIClient();
    const documents = await sanityClient.getDocuments(connectionId, filters);

    logger.info('✅ Retrieved Sanity documents', { 
      userId, 
      connectionId,
      count: documents.length,
      filters
    });

    return noCacheResponse(documents);

  } catch (error) {
    logger.error('🚨 Failed to get Sanity documents', {
      connectionId: params?.connectionId,
      error: error instanceof Error ? error.message : String(error)
    });

    if (error instanceof Error && error.message.includes('CONNECTION_NOT_FOUND')) {
      return noCacheErrorResponse(
        { error: 'Connection not found or access denied' },
        404
      );
    }

    return noCacheErrorResponse(
      { error: 'Failed to retrieve documents' },
      500
    );
  }
}