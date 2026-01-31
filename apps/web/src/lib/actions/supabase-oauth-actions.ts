/**
 * Supabase OAuth Server Actions
 * Handles OAuth URL generation and connection management
 * Server-side only for security
 */

'use server';

import { revalidatePath } from 'next/cache';
import { logger } from '@/utils/logger';
import { getWorkerClient } from '@/server/services/worker-api-client';
import { generateOAuthURL, validateOAuthEnvironment } from '@/lib/supabase-oauth';
import { getServerAuthState } from '@/lib/auth-server';
import { getLocale } from 'next-intl/server';
import { redirectWithLocale } from '@/utils/navigation';

/**
 * Generate OAuth URL and redirect user to Supabase authorization
 */
export async function initiateSupabaseOAuth(projectId: string, nextUrl?: string) {
  try {
    // Validate OAuth environment
    const envValidation = validateOAuthEnvironment();
    if (!envValidation.valid) {
      logger.error('❌ OAuth environment validation failed', envValidation.errors);
      throw new Error(`OAuth configuration invalid: ${envValidation.errors.join(', ')}`);
    }

    // Ensure user is authenticated
    const authState = await getServerAuthState();
    if (!authState.isAuthenticated || !authState.user) {
      logger.error('❌ User not authenticated for OAuth flow');
      const locale = await getLocale();
      redirectWithLocale(
        `/auth/login?returnTo=${encodeURIComponent(`/builder/workspace/${projectId}`)}`,
        locale 
      );
    }

    const userId = authState.user.id;
    const locale = await getLocale();

    logger.info('🔗 Initiating Supabase OAuth flow', {
      userId: userId.slice(0, 8),
      projectId: projectId.slice(0, 8),
      locale,
      nextUrl: nextUrl || 'default'
    });

    // Generate OAuth URL with PKCE and secure state (dynamic locale)
    const defaultNextUrl = `/${locale}/builder/workspace/${projectId}`;
    const authUrl = await generateOAuthURL(
      userId,
      projectId,
      nextUrl || defaultNextUrl
    );

    logger.info('✅ OAuth URL generated, redirecting user', {
      userId: userId.slice(0, 8),
      projectId: projectId.slice(0, 8)
    });

    // Redirect to Supabase OAuth authorization (external URL - use window.location)
    // Note: We can't use next-intl redirect for external URLs
    throw new Error(`REDIRECT_TO_OAUTH:${authUrl}`);

  } catch (error) {
    // Handle OAuth redirect specially
    if (error instanceof Error && error.message.startsWith('REDIRECT_TO_OAUTH:')) {
      const authUrl = error.message.replace('REDIRECT_TO_OAUTH:', '');
      // For external OAuth redirect, we need to use Next.js redirect
      const { redirect: nextRedirect } = await import('next/navigation');
      nextRedirect(authUrl);
    }

    logger.error('❌ Failed to initiate OAuth flow', {
      error: error instanceof Error ? error.message : 'Unknown error',
      projectId: projectId.slice(0, 8)
    });

    // Redirect with error message (dynamic locale)
    const locale = await getLocale();
    const errorMessage = error instanceof Error ? error.message : 'Failed to start OAuth flow';
    redirectWithLocale(
      `/builder/workspace/${projectId}?supabase=error&message=${encodeURIComponent(errorMessage)}`,
      locale
    );
  }
}

/**
 * Get Supabase connection status for a project
 */
export async function getSupabaseConnectionStatus(projectId: string) {
  try {
    const authState = await getServerAuthState();
    if (!authState.isAuthenticated || !authState.user) {
      return { connected: false, error: 'Not authenticated' };
    }

    const workerClient = getWorkerClient();
    const status = await workerClient.getSupabaseConnectionStatus(authState.user.id, projectId);

    // ✅ CRITICAL FIX: Ensure we never return undefined/null
    if (!status) {
      logger.error('Worker client returned undefined/null status', {
        userId: authState.user.id.slice(0, 8),
        projectId: projectId.slice(0, 8)
      });
      return { 
        connected: false, 
        error: 'Worker service returned invalid response' 
      };
    }

    logger.info('📊 Supabase connection status retrieved', {
      userId: authState.user.id.slice(0, 8),
      projectId: projectId.slice(0, 8),
      connected: status.connected,
      isExpired: status.isExpired
    });

    return status;

  } catch (error) {
    logger.error('❌ Failed to get Supabase connection status', {
      error: error instanceof Error ? error.message : 'Unknown error',
      projectId: projectId.slice(0, 8)
    });

    return { 
      connected: false, 
      error: error instanceof Error ? error.message : 'Failed to check connection status' 
    };
  }
}

/**
 * Discover available Supabase projects for a connection
 */
export async function discoverSupabaseProjects(connectionId: string) {
  try {
    const authState = await getServerAuthState();
    if (!authState.isAuthenticated || !authState.user) {
      throw new Error('Not authenticated');
    }

    const workerClient = getWorkerClient();
    const discovery = await workerClient.discoverSupabaseProjects(connectionId);

    logger.info('🔍 Supabase projects discovered', {
      userId: authState.user.id.slice(0, 8),
      connectionId: connectionId.slice(0, 8),
      projectCount: discovery.projects.length,
      readyProjects: discovery.readyProjects
    });

    return discovery;

  } catch (error) {
    logger.error('❌ Failed to discover Supabase projects', {
      error: error instanceof Error ? error.message : 'Unknown error',
      connectionId: connectionId.slice(0, 8)
    });

    throw new Error(error instanceof Error ? error.message : 'Failed to discover projects');
  }
}

/**
 * Get Supabase credentials for UI display
 */
export async function getSupabaseCredentials(ref: string, projectId: string) {
  try {
    const authState = await getServerAuthState();
    if (!authState.isAuthenticated || !authState.user) {
      throw new Error('Not authenticated');
    }

    const workerClient = getWorkerClient();
    const credentials = await workerClient.getSupabaseCredentials(ref, authState.user.id, projectId);

    logger.info('🔑 Supabase credentials retrieved', {
      userId: authState.user.id.slice(0, 8),
      projectId: projectId.slice(0, 8),
      ref: ref.slice(0, 8),
      hasUrl: !!credentials.url,
      hasKey: !!credentials.publishableKey
    });

    return credentials;

  } catch (error) {
    logger.error('❌ Failed to get Supabase credentials', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ref: ref.slice(0, 8),
      projectId: projectId.slice(0, 8)
    });

    throw new Error(error instanceof Error ? error.message : 'Failed to get credentials');
  }
}

/**
 * Disconnect Supabase integration from a project
 */
export async function disconnectSupabase(projectId: string) {
  try {
    const authState = await getServerAuthState();
    if (!authState.isAuthenticated || !authState.user) {
      throw new Error('Not authenticated');
    }

    const workerClient = getWorkerClient();
    const result = await workerClient.disconnectSupabase(authState.user.id, projectId);

    logger.info('🔌 Supabase disconnected successfully', {
      userId: authState.user.id.slice(0, 8),
      projectId: projectId.slice(0, 8),
      disconnected: result.disconnected
    });

    // Revalidate workspace page to show updated status
    const locale = await getLocale();
    revalidatePath(`/${locale}/builder/workspace/${projectId}`);
    revalidatePath('/dashboard');

    return result;

  } catch (error) {
    logger.error('❌ Failed to disconnect Supabase', {
      error: error instanceof Error ? error.message : 'Unknown error',
      projectId: projectId.slice(0, 8)
    });

    throw new Error(error instanceof Error ? error.message : 'Failed to disconnect Supabase');
  }
}