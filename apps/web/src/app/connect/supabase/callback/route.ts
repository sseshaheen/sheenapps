/**
 * Supabase OAuth Callback Route
 * Handles OAuth code exchange and redirects users back to their projects
 * Follows worker team recommendations with encrypted cookie PKCE storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { getWorkerClient } from '@/server/services/worker-api-client';
import { 
  verifySecureState, 
  getStoredCodeVerifier, 
  clearCodeVerifier,
  validateOAuthEnvironment 
} from '@/lib/supabase-oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  logger.info('🔗 Supabase OAuth callback received', {
    hasCode: !!code,
    hasState: !!state,
    error: error || 'none'
  });

  // Handle OAuth authorization errors
  if (error) {
    logger.error('❌ OAuth authorization failed', { error });
    return NextResponse.redirect(
      new URL(`/dashboard?supabase=error&message=${encodeURIComponent(`OAuth authorization failed: ${error}`)}`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    logger.error('❌ Missing required OAuth parameters', { hasCode: !!code, hasState: !!state });
    return NextResponse.redirect(
      new URL('/dashboard?supabase=error&message=Invalid%20OAuth%20callback', request.url)
    );
  }

  try {
    // Validate OAuth environment
    const envValidation = validateOAuthEnvironment();
    if (!envValidation.valid) {
      logger.error('❌ OAuth environment validation failed', envValidation.errors);
      throw new Error(`OAuth configuration invalid: ${envValidation.errors.join(', ')}`);
    }

    // Verify and decode signed state parameter
    const stateData = verifySecureState(state);
    if (!stateData) {
      logger.error('❌ Invalid or expired OAuth state parameter');
      throw new Error('Invalid or expired OAuth state parameter');
    }

    const { userId, projectId, nextUrl, nonce } = stateData;

    logger.info('✅ OAuth state verified', {
      userId: userId.slice(0, 8),
      projectId: projectId.slice(0, 8),
      nonce: nonce.slice(0, 8)
    });

    // Retrieve stored PKCE code verifier
    const codeVerifier = await getStoredCodeVerifier(nonce);
    if (!codeVerifier) {
      logger.error('❌ PKCE code verifier not found or expired', { nonce: nonce.slice(0, 8) });
      throw new Error('PKCE code verifier not found or expired');
    }

    // Exchange OAuth code with Worker API
    const workerClient = getWorkerClient();
    const exchangeResult = await workerClient.exchangeOAuthCode({
      code,
      codeVerifier,
      userId,
      projectId,
      idempotencyKey: `oauth-${nonce}` // Prevent duplicate exchanges
    });

    logger.info('✅ OAuth code exchange successful', {
      connectionId: exchangeResult.connectionId,
      needsProjectCreation: exchangeResult.needsProjectCreation,
      availableProjects: exchangeResult.availableProjects?.length || 0,
      readyProjects: exchangeResult.readyProjects?.length || 0
    });

    // Clean up stored code verifier
    await clearCodeVerifier();

    // Build success redirect URL
    const redirectUrl = new URL(nextUrl, request.url);
    redirectUrl.searchParams.set('supabase', 'connected');
    redirectUrl.searchParams.set('connectionId', exchangeResult.connectionId);
    
    if (exchangeResult.needsProjectCreation) {
      redirectUrl.searchParams.set('needsProjectCreation', 'true');
    }
    
    if (exchangeResult.availableProjects?.length > 0) {
      redirectUrl.searchParams.set('availableProjects', exchangeResult.availableProjects.length.toString());
    }

    logger.info('🔀 Redirecting to success page', {
      redirectUrl: redirectUrl.pathname + redirectUrl.search,
      connectionId: exchangeResult.connectionId
    });

    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    logger.error('❌ OAuth callback processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // Clean up any stored verifier on error
    try {
      await clearCodeVerifier();
    } catch (cleanupError) {
      logger.warn('⚠️ Failed to cleanup code verifier on error', { cleanupError });
    }

    // Extract project ID from state for error redirect (best effort)
    let projectId = 'unknown';
    try {
      const stateData = verifySecureState(state);
      if (stateData?.projectId) {
        projectId = stateData.projectId;
      }
    } catch (stateError) {
      // State parsing failed, use default
    }

    const errorMessage = error instanceof Error ? error.message : 'OAuth callback processing failed';
    const errorRedirectUrl = new URL(`/dashboard?supabase=error&message=${encodeURIComponent(errorMessage)}`, request.url);
    
    if (projectId !== 'unknown') {
      errorRedirectUrl.searchParams.set('projectId', projectId);
    }

    return NextResponse.redirect(errorRedirectUrl);
  }
}

// Only allow GET method for OAuth callbacks
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}