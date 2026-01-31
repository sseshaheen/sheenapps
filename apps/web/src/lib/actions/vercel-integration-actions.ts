/**
 * Server Actions for Vercel Integration
 * Handles OAuth flow, project management, and deployment operations
 */

'use server';

import { getWorkerClient } from '@/server/services/worker-api-client';
import { getCurrentUserId } from '@/lib/server/auth';
import { logger } from '@/utils/logger';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type {
  VercelConnection,
  VercelProject,
  VercelProjectMapping,
  VercelDeployment,
  VercelDomain,
  VercelAutoDeploy,
  VercelOAuthInitiateResponse,
  VercelConnectionStatusResponse,
  VercelProjectListResponse,
  VercelProjectLinkResponse,
  VercelDeploymentResponse,
  VercelDeploymentListResponse
} from '@/types/vercel-integration';

const FEATURE_FLAG = process.env.NEXT_PUBLIC_ENABLE_VERCEL_INTEGRATION === 'true';

/**
 * Check if Vercel integration is enabled
 */
function ensureFeatureEnabled() {
  if (!FEATURE_FLAG) {
    throw new Error('Vercel integration is not enabled');
  }
}

/**
 * Get current user ID with error handling
 */
async function getCurrentUserIdSafe(): Promise<string> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return userId;
  } catch (error) {
    logger.error('Failed to get current user ID:', error);
    throw new Error('Authentication required');
  }
}

// ==========================================
// OAuth Connection Management
// ==========================================

/**
 * Initiate Vercel OAuth flow
 */
export async function initiateVercelOAuth(teamId?: string): Promise<VercelOAuthInitiateResponse> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    // Get the current domain for redirect URL
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/integrations/vercel/callback`;

    logger.info('🔗 Initiating Vercel OAuth flow', {
      userId,
      teamId,
      callbackUrl
    });

    const pathWithQuery = `/v1/integrations/vercel/auth/url?redirect_url=${encodeURIComponent(callbackUrl)}${teamId ? `&team_id=${encodeURIComponent(teamId)}` : ''}`;

    const response = await workerClient.get<VercelOAuthInitiateResponse>(pathWithQuery);

    logger.info('✅ Vercel OAuth URL generated successfully', {
      userId,
      hasAuthUrl: !!response.authorization_url,
      state: response.state
    });

    return response;
  } catch (error) {
    logger.error('❌ Failed to initiate Vercel OAuth:', error);
    throw new Error('Failed to start Vercel connection process');
  }
}

/**
 * Handle OAuth callback from Vercel
 */
export async function handleVercelOAuthCallback(code: string, state: string): Promise<{ success: boolean }> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('🔄 Processing Vercel OAuth callback', {
      userId,
      state,
      hasCode: !!code
    });

    const response = await workerClient.postWithoutCorrelation('/v1/integrations/vercel/auth/callback', {
      code,
      state,
      userId
    }) as { success?: boolean };

    logger.info('✅ Vercel OAuth callback processed successfully', {
      userId,
      success: response?.success
    });

    // Revalidate integrations page
    revalidatePath('/integrations');
    
    return { success: true };
  } catch (error) {
    logger.error('❌ Failed to process Vercel OAuth callback:', error);
    throw new Error('Failed to complete Vercel connection');
  }
}

/**
 * Get Vercel connection status
 */
export async function getVercelConnectionStatus(): Promise<VercelConnectionStatusResponse> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    const pathWithQuery = `/v1/integrations/vercel/connections?user_id=${encodeURIComponent(userId)}`;
    const response = await workerClient.get<VercelConnectionStatusResponse>(pathWithQuery);

    return response;
  } catch (error) {
    logger.error('❌ Failed to get Vercel connection status:', error);
    return { connected: false, connections: [] };
  }
}

/**
 * Disconnect Vercel integration
 */
export async function disconnectVercel(): Promise<{ success: boolean }> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('🔌 Disconnecting Vercel integration', { userId });

    await workerClient.request('/v1/integrations/vercel/auth/disconnect', {
      method: 'DELETE',
      body: JSON.stringify({ userId })
    });

    logger.info('✅ Vercel integration disconnected successfully', { userId });

    // Revalidate integrations page
    revalidatePath('/integrations');
    
    return { success: true };
  } catch (error) {
    logger.error('❌ Failed to disconnect Vercel integration:', error);
    throw new Error('Failed to disconnect Vercel integration');
  }
}

// ==========================================
// Project Management
// ==========================================

/**
 * List available Vercel projects
 */
export async function listVercelProjects(limit: number = 20, offset: number = 0): Promise<VercelProjectListResponse> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    const pathWithQuery = `/v1/integrations/vercel/projects?user_id=${encodeURIComponent(userId)}&limit=${limit}&offset=${offset}`;
    const response = await workerClient.get<VercelProjectListResponse>(pathWithQuery);

    return response;
  } catch (error) {
    logger.error('❌ Failed to list Vercel projects:', error);
    throw new Error('Failed to load Vercel projects');
  }
}

/**
 * Link a Vercel project to a Sheen project
 */
export async function linkVercelProject(
  sheenProjectId: string,
  vercelProjectId: string,
  options: {
    autoDeployEnabled?: boolean;
    deploymentBranchPatterns?: string[];
    environmentTargets?: ('production' | 'preview' | 'development')[];
  } = {}
): Promise<VercelProjectLinkResponse> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('🔗 Linking Vercel project', {
      userId,
      sheenProjectId,
      vercelProjectId,
      options
    });

    const response = await workerClient.postWithoutCorrelation(`/v1/projects/${sheenProjectId}/vercel/projects/link`, {
      userId,
      vercelProjectId,
      autoDeployEnabled: options.autoDeployEnabled ?? true,
      deploymentBranchPatterns: options.deploymentBranchPatterns ?? ['main', 'master'],
      environmentTargets: options.environmentTargets ?? ['production', 'preview']
    }) as VercelProjectLinkResponse;

    logger.info('✅ Vercel project linked successfully', {
      userId,
      sheenProjectId,
      vercelProjectId,
      mappingId: response.mapping?.id
    });

    // Revalidate project pages
    revalidatePath(`/builder/${sheenProjectId}`);
    
    return response;
  } catch (error) {
    logger.error('❌ Failed to link Vercel project:', error);
    throw new Error('Failed to link Vercel project');
  }
}

/**
 * Unlink a Vercel project from a Sheen project
 */
export async function unlinkVercelProject(sheenProjectId: string): Promise<{ success: boolean }> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('🔌 Unlinking Vercel project', {
      userId,
      sheenProjectId
    });

    await workerClient.postWithoutCorrelation(`/v1/projects/${sheenProjectId}/vercel/projects/unlink`, {
      userId
    });

    logger.info('✅ Vercel project unlinked successfully', {
      userId,
      sheenProjectId
    });

    // Revalidate project pages
    revalidatePath(`/builder/${sheenProjectId}`);
    
    return { success: true };
  } catch (error) {
    logger.error('❌ Failed to unlink Vercel project:', error);
    throw new Error('Failed to unlink Vercel project');
  }
}

// ==========================================
// Deployment Operations
// ==========================================

/**
 * Deploy project to Vercel
 */
export async function deployToVercel(
  sheenProjectId: string,
  deploymentType: 'production' | 'preview',
  gitSource?: {
    branch: string;
    commitSha?: string;
  }
): Promise<VercelDeploymentResponse> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('🚀 Deploying to Vercel', {
      userId,
      sheenProjectId,
      deploymentType,
      gitSource
    });

    const response = await workerClient.postWithoutCorrelation(`/v1/projects/${sheenProjectId}/vercel/deploy`, {
      userId,
      deploymentType,
      ...(gitSource && { gitSource })
    }) as VercelDeploymentResponse;

    logger.info('✅ Vercel deployment initiated successfully', {
      userId,
      sheenProjectId,
      deploymentId: response.deployment?.deployment_id
    });

    // Revalidate project pages
    revalidatePath(`/builder/${sheenProjectId}`);
    
    return response;
  } catch (error) {
    logger.error('❌ Failed to deploy to Vercel:', error);
    throw new Error('Failed to deploy to Vercel');
  }
}

/**
 * List deployments for a project
 */
export async function listVercelDeployments(
  sheenProjectId: string,
  limit: number = 10,
  offset: number = 0
): Promise<VercelDeploymentListResponse> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    const pathWithQuery = `/v1/projects/${sheenProjectId}/vercel/deployments?user_id=${encodeURIComponent(userId)}&limit=${limit}&offset=${offset}`;
    const response = await workerClient.get<VercelDeploymentListResponse>(pathWithQuery);

    return response;
  } catch (error) {
    logger.error('❌ Failed to list Vercel deployments:', error);
    throw new Error('Failed to load deployments');
  }
}

/**
 * Promote deployment to production
 */
export async function promoteToProduction(
  sheenProjectId: string,
  deploymentId: string
): Promise<{ success: boolean; productionUrl?: string }> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('⬆️ Promoting deployment to production', {
      userId,
      sheenProjectId,
      deploymentId
    });

    const response = await workerClient.postWithoutCorrelation(
      `/v1/projects/${sheenProjectId}/vercel/deployments/${deploymentId}/promote`,
      { userId }
    ) as { success: boolean; productionUrl?: string };

    logger.info('✅ Deployment promoted to production successfully', {
      userId,
      sheenProjectId,
      deploymentId,
      productionUrl: response.productionUrl
    });

    // Revalidate project pages
    revalidatePath(`/builder/${sheenProjectId}`);
    
    return response;
  } catch (error) {
    logger.error('❌ Failed to promote deployment to production:', error);
    throw new Error('Failed to promote deployment');
  }
}

// ==========================================
// Domain Management
// ==========================================

/**
 * List domains for a project
 */
export async function listVercelDomains(sheenProjectId: string): Promise<{ domains: VercelDomain[] }> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    const pathWithQuery = `/v1/projects/${sheenProjectId}/vercel/domains?user_id=${encodeURIComponent(userId)}`;
    const response = await workerClient.get<{ domains: VercelDomain[] }>(pathWithQuery);

    return response;
  } catch (error) {
    logger.error('❌ Failed to list Vercel domains:', error);
    throw new Error('Failed to load domains');
  }
}

/**
 * Add custom domain to Vercel project
 */
export async function addVercelDomain(
  sheenProjectId: string,
  domain: string,
  options: {
    httpsRedirect?: boolean;
    autoConfigureDNS?: boolean;
  } = {}
): Promise<{
  domain: VercelDomain;
  verificationRecords?: Array<{
    type: string;
    name: string;
    value: string;
    ttl?: number;
  }>;
}> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('🌐 Adding custom domain to Vercel project', {
      userId,
      sheenProjectId,
      domain,
      options
    });

    const response = await workerClient.postWithoutCorrelation(`/v1/projects/${sheenProjectId}/vercel/domains`, {
      userId,
      domain,
      httpsRedirect: options.httpsRedirect ?? true,
      autoConfigureDNS: options.autoConfigureDNS ?? false
    }) as {
      domain: VercelDomain;
      verificationRecords?: Array<{
        type: string;
        name: string;
        value: string;
        ttl?: number;
      }>;
    };

    logger.info('✅ Custom domain added successfully', {
      userId,
      sheenProjectId,
      domain,
      domainId: response.domain?.id
    });

    return response;
  } catch (error) {
    logger.error('❌ Failed to add custom domain:', error);
    throw new Error('Failed to add custom domain');
  }
}

/**
 * Verify domain DNS configuration
 */
export async function verifyVercelDomain(
  sheenProjectId: string,
  domain: string
): Promise<{
  verified: boolean;
  status: string;
  records?: Array<{
    type: string;
    name: string;
    value: string;
    ttl?: number;
  }>;
}> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('✅ Verifying domain DNS configuration', {
      userId,
      sheenProjectId,
      domain
    });

    const response = await workerClient.postWithoutCorrelation(
      `/v1/projects/${sheenProjectId}/vercel/domains/${encodeURIComponent(domain)}/verify`,
      { userId }
    ) as {
      verified: boolean;
      status: string;
      records?: Array<{
        type: string;
        name: string;
        value: string;
        ttl?: number;
      }>;
    };

    logger.info('✅ Domain verification completed', {
      userId,
      sheenProjectId,
      domain,
      verified: response.verified,
      status: response.status
    });

    return response;
  } catch (error) {
    logger.error('❌ Failed to verify domain:', error);
    throw new Error('Failed to verify domain');
  }
}

/**
 * Remove custom domain from Vercel project
 */
export async function removeVercelDomain(
  sheenProjectId: string,
  domain: string
): Promise<{ success: boolean }> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('🗑️ Removing custom domain from Vercel project', {
      userId,
      sheenProjectId,
      domain
    });

    await workerClient.request(`/v1/projects/${sheenProjectId}/vercel/domains/${encodeURIComponent(domain)}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId })
    });

    logger.info('✅ Custom domain removed successfully', {
      userId,
      sheenProjectId,
      domain
    });

    return { success: true };
  } catch (error) {
    logger.error('❌ Failed to remove custom domain:', error);
    throw new Error('Failed to remove custom domain');
  }
}

// ==========================================
// Auto-Deploy Configuration
// ==========================================

/**
 * Get auto-deploy configuration
 */
export async function getAutoDeployConfig(sheenProjectId: string): Promise<VercelAutoDeploy> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    const pathWithQuery = `/v1/projects/${sheenProjectId}/vercel/auto-deploy/config?user_id=${encodeURIComponent(userId)}`;
    const response = await workerClient.get<{ config: VercelAutoDeploy }>(pathWithQuery);

    return response.config;
  } catch (error) {
    logger.error('❌ Failed to get auto-deploy config:', error);
    throw new Error('Failed to load auto-deploy configuration');
  }
}

/**
 * Update auto-deploy configuration
 */
export async function updateAutoDeployConfig(
  sheenProjectId: string,
  config: Partial<VercelAutoDeploy>
): Promise<{ success: boolean }> {
  ensureFeatureEnabled();
  const userId = await getCurrentUserIdSafe();
  const workerClient = getWorkerClient();

  try {
    logger.info('⚙️ Updating auto-deploy configuration', {
      userId,
      sheenProjectId,
      config
    });

    await workerClient.request(`/v1/projects/${sheenProjectId}/vercel/auto-deploy/config`, {
      method: 'PUT',
      body: JSON.stringify({ userId, ...config })
    });

    logger.info('✅ Auto-deploy configuration updated successfully', {
      userId,
      sheenProjectId
    });

    // Revalidate project pages
    revalidatePath(`/builder/${sheenProjectId}`);
    
    return { success: true };
  } catch (error) {
    logger.error('❌ Failed to update auto-deploy config:', error);
    throw new Error('Failed to update auto-deploy configuration');
  }
}