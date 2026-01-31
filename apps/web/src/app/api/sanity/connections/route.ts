/**
 * Sanity Connections API Route
 * Handles listing and creating Sanity connections
 * Uses server-only Sanity API client with HMAC authentication
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
 * List user's Sanity connections
 * GET /api/sanity/connections?project_id=optional
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse(
        { error: 'Authentication required' },
        401
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    logger.info('📋 Listing Sanity connections', { userId, projectId });

    const sanityClient = getSanityAPIClient();
    const connections = await sanityClient.listConnections(projectId || undefined);

    logger.info('✅ Retrieved Sanity connections', { 
      userId, 
      count: connections.length,
      projectId 
    });

    return noCacheResponse(connections);

  } catch (error) {
    logger.error('🚨 Failed to list Sanity connections', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return noCacheErrorResponse(
      { error: 'Failed to retrieve connections' },
      500
    );
  }
}

/**
 * Create new Sanity connection
 * POST /api/sanity/connections
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse(
        { error: 'Authentication required' },
        401
      );
    }

    const body: CreateSanityConnectionRequest = await request.json();

    // Validate required fields
    if (!body.sanity_project_id || !body.dataset_name || !body.auth_token) {
      return noCacheErrorResponse(
        { error: 'Missing required fields: sanity_project_id, dataset_name, auth_token' },
        400
      );
    }

    logger.info('🔗 Creating Sanity connection', { 
      userId,
      sanityProjectId: body.sanity_project_id,
      dataset: body.dataset_name,
      projectId: body.project_id
    });

    const sanityClient = getSanityAPIClient();
    const connection = await sanityClient.createConnection(body);

    logger.info('✅ Sanity connection created', { 
      userId,
      connectionId: connection.id,
      status: connection.status
    });

    return noCacheResponse(connection, { status: 201 });

  } catch (error) {
    logger.error('🚨 Failed to create Sanity connection', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('SANITY_API_ERROR')) {
        return noCacheErrorResponse(
          { error: 'Invalid Sanity credentials or project access' },
          401
        );
      }
      
      if (error.message.includes('TOKEN_EXPIRED')) {
        return noCacheErrorResponse(
          { error: 'Sanity token has expired' },
          401
        );
      }

      if (error.message.includes('RATE_LIMITED')) {
        return noCacheErrorResponse(
          { error: 'Rate limit exceeded. Please try again later.' },
          429
        );
      }
    }

    return noCacheErrorResponse(
      { error: 'Failed to create connection' },
      500
    );
  }
}