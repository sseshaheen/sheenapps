/**
 * Individual Sanity Connection API Route
 * Handles CRUD operations for specific connections
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSanityAPIClient } from '@/services/sanity-api-client';
import { getCurrentUserId } from '@/lib/server/auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import type { CreateSanityConnectionRequest } from '@/types/sanity-integration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Get specific Sanity connection
 * GET /api/sanity/connections/[connectionId]
 */
export async function GET(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401);
    }

    const { connectionId } = params;
    
    logger.info('🔍 Getting Sanity connection', { userId, connectionId });

    const sanityClient = getSanityAPIClient();
    const connection = await sanityClient.getConnection(connectionId);

    return noCacheResponse(connection);

  } catch (error) {
    logger.error('🚨 Failed to get Sanity connection', {
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
      { error: 'Failed to retrieve connection' },
      500
    );
  }
}

/**
 * Update Sanity connection
 * PATCH /api/sanity/connections/[connectionId]
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401);
    }

    const { connectionId } = params;
    const updates: Partial<CreateSanityConnectionRequest> = await request.json();

    logger.info('✏️ Updating Sanity connection', { 
      userId, 
      connectionId,
      updates: Object.keys(updates)
    });

    const sanityClient = getSanityAPIClient();
    const connection = await sanityClient.updateConnection(connectionId, updates);

    logger.info('✅ Sanity connection updated', { 
      userId, 
      connectionId,
      status: connection.status
    });

    return noCacheResponse(connection);

  } catch (error) {
    logger.error('🚨 Failed to update Sanity connection', {
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
      { error: 'Failed to update connection' },
      500
    );
  }
}

/**
 * Delete Sanity connection
 * DELETE /api/sanity/connections/[connectionId]
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401);
    }

    const { connectionId } = params;
    
    logger.info('🗑️ Deleting Sanity connection', { userId, connectionId });

    const sanityClient = getSanityAPIClient();
    const result = await sanityClient.deleteConnection(connectionId);

    logger.info('✅ Sanity connection deleted', { userId, connectionId });

    return noCacheResponse(result);

  } catch (error) {
    logger.error('🚨 Failed to delete Sanity connection', {
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
      { error: 'Failed to delete connection' },
      500
    );
  }
}