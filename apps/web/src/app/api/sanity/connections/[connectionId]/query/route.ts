/**
 * Sanity GROQ Query API Route
 * Handles execution of GROQ queries against Sanity content
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSanityAPIClient } from '@/services/sanity-api-client';
import { getCurrentUserId } from '@/lib/server/auth';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';
import type { GroqQueryRequest } from '@/types/sanity-integration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Execute GROQ query against Sanity content
 * POST /api/sanity/connections/[connectionId]/query
 */
export async function POST(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401);
    }

    const { connectionId } = params;
    const body: GroqQueryRequest = await request.json();

    // Validate required fields
    if (!body.groq_query || typeof body.groq_query !== 'string') {
      return noCacheErrorResponse(
        { error: 'Missing or invalid groq_query field' },
        400
      );
    }

    // Validate query length (prevent abuse)
    if (body.groq_query.length > 10000) {
      return noCacheErrorResponse(
        { error: 'GROQ query too long (max 10,000 characters)' },
        400
      );
    }

    // Validate cache TTL
    if (body.cache_ttl_seconds && (body.cache_ttl_seconds < 0 || body.cache_ttl_seconds > 86400)) {
      return noCacheErrorResponse(
        { error: 'Invalid cache_ttl_seconds (must be 0-86400)' },
        400
      );
    }

    logger.info('🔍 Executing GROQ query', { 
      userId, 
      connectionId,
      queryLength: body.groq_query.length,
      hasParams: !!body.params && Object.keys(body.params).length > 0,
      cache: body.cache,
      cacheTtl: body.cache_ttl_seconds
    });

    const sanityClient = getSanityAPIClient();
    const result = await sanityClient.executeQuery(connectionId, body);

    logger.info('✅ GROQ query executed', { 
      userId, 
      connectionId,
      cached: result.cached,
      queryTime: result.query_time_ms,
      dependencies: result.document_dependencies?.length || 0,
      dataType: typeof result.data,
      dataLength: Array.isArray(result.data) ? result.data.length : null
    });

    return noCacheResponse(result);

  } catch (error) {
    logger.error('🚨 GROQ query failed', {
      connectionId: params?.connectionId,
      error: error instanceof Error ? error.message : String(error)
    });

    if (error instanceof Error) {
      if (error.message.includes('CONNECTION_NOT_FOUND')) {
        return noCacheErrorResponse(
          { error: 'Connection not found or access denied' },
          404
        );
      }

      if (error.message.includes('SANITY_API_ERROR')) {
        // Extract Sanity-specific error message if possible
        const sanityError = error.message.includes('GROQ') 
          ? 'Invalid GROQ query syntax'
          : 'Sanity API error';
          
        return noCacheErrorResponse(
          { error: sanityError },
          400
        );
      }

      if (error.message.includes('RATE_LIMITED')) {
        return noCacheErrorResponse(
          { error: 'Query rate limit exceeded. Please try again later.' },
          429
        );
      }
    }

    return noCacheErrorResponse(
      { error: 'GROQ query execution failed' },
      500
    );
  }
}