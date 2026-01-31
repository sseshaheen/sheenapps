/**
 * SDK E2E Test Harness Endpoint
 *
 * CRITICAL: This endpoint can create/delete projects and manipulate quotas.
 * It must be protected with multiple security layers.
 *
 * Security layers:
 * 1. SDK_E2E_ENABLED env flag must be 'true'
 * 2. Not in production (unless CI=true)
 * 3. X-E2E-Mode header must be 'true'
 * 4. X-E2E-Admin-Key header must match SDK_E2E_ADMIN_KEY env
 *
 * All test operations go through this single endpoint with action-based routing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { makeAdminCtx } from '@/lib/db/context';
import { logger } from '@/utils/logger';
import { randomUUID } from 'crypto';

// ============================================================================
// Route Configuration
// ============================================================================

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// ============================================================================
// Response Headers
// ============================================================================

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  return timingSafeEqual(bufA, bufB);
}

/**
 * Sanitize schema name for Postgres (max 63 chars, alphanumeric + underscore)
 */
function safeSchemaName(input: string): string {
  // Keep: a-z, 0-9, underscore. Replace everything else with underscore.
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+/, '') // Remove leading underscores
    .replace(/_+$/, ''); // Remove trailing underscores

  // Ensure starts with a letter (Postgres requirement)
  const withPrefix = base.match(/^[a-z]/) ? base : `e_${base}`;

  // Postgres identifier limit is 63 chars; leave room for safety
  return withPrefix.slice(0, 55);
}

/**
 * Validate SDK E2E harness access
 * Returns null if authorized, NextResponse with error if not
 */
function validateAccess(request: NextRequest): NextResponse | null {
  // Layer 1: SDK E2E must be enabled
  if (process.env.SDK_E2E_ENABLED !== 'true') {
    return NextResponse.json(
      { success: false, error: 'SDK E2E harness disabled' },
      { status: 404, headers: RESPONSE_HEADERS }
    );
  }

  // Layer 2: Block in production unless CI
  if (process.env.NODE_ENV === 'production' && !process.env.CI) {
    return NextResponse.json(
      { success: false, error: 'SDK E2E harness blocked in production' },
      { status: 403, headers: RESPONSE_HEADERS }
    );
  }

  // Layer 3: Require X-E2E-Mode header
  if (request.headers.get('X-E2E-Mode') !== 'true') {
    return NextResponse.json(
      { success: false, error: 'Missing X-E2E-Mode header' },
      { status: 400, headers: RESPONSE_HEADERS }
    );
  }

  // Layer 4: Validate admin key (E2E_ADMIN_KEY is the standard name)
  const adminKey = request.headers.get('X-E2E-Admin-Key');
  const expectedKey = process.env.E2E_ADMIN_KEY || process.env.SDK_E2E_ADMIN_KEY;

  if (!expectedKey) {
    logger.error('[sdk-harness] SDK_E2E_ADMIN_KEY not configured');
    return NextResponse.json(
      { success: false, error: 'SDK E2E harness misconfigured' },
      { status: 500, headers: RESPONSE_HEADERS }
    );
  }

  if (!adminKey || !safeCompare(adminKey, expectedKey)) {
    return NextResponse.json(
      { success: false, error: 'Invalid admin key' },
      { status: 401, headers: RESPONSE_HEADERS }
    );
  }

  // Log for audit trail
  const runId = request.headers.get('X-E2E-Run-Id') || 'unknown';
  logger.info('[sdk-harness] Authorized request', { runId });

  return null;
}

// ============================================================================
// Action Types
// ============================================================================

type HarnessAction =
  | 'createProject'
  | 'cleanupProject'
  | 'cleanupAllByRunId'
  | 'setQuotaLimit'
  | 'resetQuota'
  | 'getRenderedEmail'
  | 'getMagicLinkToken'
  | 'triggerJobCompletion'
  | 'waitForBackupStatus'
  | 'waitForRestoreStatus'
  | 'getAuthHeadersForUser'
  | 'generateStripeSignature';

interface HarnessRequest {
  action: HarnessAction;
  params: Record<string, unknown>;
}

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Create a test project with SDK keys
 */
async function handleCreateProject(params: {
  name: string;
  plan: 'pro' | 'free' | 'e2e_tiny';
  runId: string;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ctx = makeAdminCtx();
  const projectId = randomUUID();
  const publicKey = `sheen_pk_test_${randomUUID().slice(0, 16)}`;
  const serverKey = `sheen_sk_test_${randomUUID().slice(0, 16)}`;
  const schemaName = safeSchemaName(`e2e_${params.runId}_${Date.now()}`);

  try {
    // Create the project in the database
    const { data: project, error: projectError } = await ctx.client
      .from('inhouse_projects')
      .insert({
        id: projectId,
        name: params.name,
        plan: params.plan,
        public_key: publicKey,
        server_key: serverKey,
        schema_name: schemaName,
        test_run_id: params.runId,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (projectError) {
      // If the inhouse_projects table doesn't exist
      if (projectError.code === '42P01') {
        // In CI, fail clearly - mock data defeats the purpose of integration tests
        if (process.env.CI) {
          logger.error('[sdk-harness] inhouse_projects table missing in CI');
          return {
            success: false,
            error: 'inhouse_projects table missing - cannot run SDK tests in CI without proper database setup',
          };
        }
        // In local dev, allow mock data for development convenience
        logger.warn('[sdk-harness] inhouse_projects table not found, using mock data (local dev only)');
        return {
          success: true,
          data: {
            projectId,
            publicKey,
            serverKey,
            schemaName,
            baseUrl: process.env.WORKER_BASE_URL || 'http://localhost:8081',
            authHeaders: {
              'X-Sheen-Public-Key': publicKey,
              'X-Sheen-Server-Key': serverKey,
            },
            plan: params.plan,
          },
        };
      }
      throw projectError;
    }

    return {
      success: true,
      data: {
        projectId: project.id,
        publicKey: project.public_key,
        serverKey: project.server_key,
        schemaName: project.schema_name,
        baseUrl: process.env.WORKER_BASE_URL || 'http://localhost:8081',
        authHeaders: {
          'X-Sheen-Public-Key': project.public_key,
          'X-Sheen-Server-Key': project.server_key,
        },
        plan: project.plan,
      },
    };
  } catch (error: any) {
    logger.error('[sdk-harness] createProject failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Clean up a specific test project
 */
async function handleCleanupProject(params: {
  projectId: string;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ctx = makeAdminCtx();
  const cleaned: Record<string, number> = {};

  try {
    // Delete project and related data
    // Order: most dependent first → least dependent last

    // Delete email logs
    const { data: emails } = await ctx.client
      .from('inhouse_email_logs')
      .delete()
      .eq('project_id', params.projectId)
      .select('id');
    cleaned.emails = emails?.length || 0;

    // Delete job logs
    const { data: jobs } = await ctx.client
      .from('inhouse_job_logs')
      .delete()
      .eq('project_id', params.projectId)
      .select('id');
    cleaned.jobs = jobs?.length || 0;

    // Delete secrets
    const { data: secrets } = await ctx.client
      .from('inhouse_secrets')
      .delete()
      .eq('project_id', params.projectId)
      .select('id');
    cleaned.secrets = secrets?.length || 0;

    // Delete analytics events
    const { data: analytics } = await ctx.client
      .from('inhouse_analytics_events')
      .delete()
      .eq('project_id', params.projectId)
      .select('id');
    cleaned.analytics = analytics?.length || 0;

    // Delete storage files metadata
    const { data: files } = await ctx.client
      .from('inhouse_storage_files')
      .delete()
      .eq('project_id', params.projectId)
      .select('id');
    cleaned.files = files?.length || 0;

    // Delete the project itself
    const { data: projects } = await ctx.client
      .from('inhouse_projects')
      .delete()
      .eq('id', params.projectId)
      .select('id');
    cleaned.projects = projects?.length || 0;

    logger.info('[sdk-harness] cleanupProject complete', { projectId: params.projectId, cleaned });

    return { success: true, data: { cleaned } };
  } catch (error: any) {
    logger.warn('[sdk-harness] cleanupProject partial failure', { error: error.message });
    // Return success with what we cleaned - global cleanup will catch the rest
    return { success: true, data: { cleaned, warning: error.message } };
  }
}

/**
 * Clean up all test resources by run ID
 */
async function handleCleanupAllByRunId(params: {
  runId: string;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ctx = makeAdminCtx();
  const cleaned: Record<string, number> = {};

  try {
    // Get all projects for this run ID
    const { data: projects } = await ctx.client
      .from('inhouse_projects')
      .select('id')
      .eq('test_run_id', params.runId);

    if (projects && projects.length > 0) {
      const projectIds = projects.map((p) => p.id);

      // Clean up dependent tables
      const { data: emails } = await ctx.client
        .from('inhouse_email_logs')
        .delete()
        .in('project_id', projectIds)
        .select('id');
      cleaned.emails = emails?.length || 0;

      const { data: jobs } = await ctx.client
        .from('inhouse_job_logs')
        .delete()
        .in('project_id', projectIds)
        .select('id');
      cleaned.jobs = jobs?.length || 0;

      const { data: secrets } = await ctx.client
        .from('inhouse_secrets')
        .delete()
        .in('project_id', projectIds)
        .select('id');
      cleaned.secrets = secrets?.length || 0;

      const { data: analytics } = await ctx.client
        .from('inhouse_analytics_events')
        .delete()
        .in('project_id', projectIds)
        .select('id');
      cleaned.analytics = analytics?.length || 0;

      const { data: files } = await ctx.client
        .from('inhouse_storage_files')
        .delete()
        .in('project_id', projectIds)
        .select('id');
      cleaned.files = files?.length || 0;

      // Delete projects
      const { data: deletedProjects } = await ctx.client
        .from('inhouse_projects')
        .delete()
        .eq('test_run_id', params.runId)
        .select('id');
      cleaned.projects = deletedProjects?.length || 0;
    }

    logger.info('[sdk-harness] cleanupAllByRunId complete', { runId: params.runId, cleaned });

    return { success: true, data: { cleaned } };
  } catch (error: any) {
    logger.warn('[sdk-harness] cleanupAllByRunId error', { error: error.message });
    return { success: true, data: { cleaned, warning: error.message } };
  }
}

/**
 * Set quota limit for a project
 */
async function handleSetQuotaLimit(params: {
  projectId: string;
  metric: string;
  limit: number;
}): Promise<{ success: boolean; error?: string }> {
  const ctx = makeAdminCtx();

  try {
    const { error } = await ctx.client
      .from('inhouse_project_quotas')
      .upsert({
        project_id: params.projectId,
        metric: params.metric,
        limit_value: params.limit,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    logger.info('[sdk-harness] setQuotaLimit complete', params);
    return { success: true };
  } catch (error: any) {
    logger.error('[sdk-harness] setQuotaLimit failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Reset quota counter for a project
 */
async function handleResetQuota(params: {
  projectId: string;
  metric: string;
}): Promise<{ success: boolean; error?: string }> {
  const ctx = makeAdminCtx();

  try {
    const { error } = await ctx.client
      .from('inhouse_project_usage')
      .upsert({
        project_id: params.projectId,
        metric: params.metric,
        usage_value: 0,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    logger.info('[sdk-harness] resetQuota complete', params);
    return { success: true };
  } catch (error: any) {
    logger.error('[sdk-harness] resetQuota failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Get rendered email content (for template validation)
 */
async function handleGetRenderedEmail(params: {
  emailId: string;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ctx = makeAdminCtx();

  try {
    const { data, error } = await ctx.client
      .from('inhouse_email_logs')
      .select('subject, html_body, text_body')
      .eq('id', params.emailId)
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        subject: data.subject,
        html: data.html_body,
        text: data.text_body,
      },
    };
  } catch (error: any) {
    logger.error('[sdk-harness] getRenderedEmail failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Get magic link token for testing
 */
async function handleGetMagicLinkToken(params: {
  email: string;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ctx = makeAdminCtx();

  try {
    const { data, error } = await ctx.client
      .from('inhouse_magic_links')
      .select('token, expires_at')
      .eq('email', params.email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        token: data.token,
        expiresAt: data.expires_at,
      },
    };
  } catch (error: any) {
    logger.error('[sdk-harness] getMagicLinkToken failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Trigger job completion for testing
 */
async function handleTriggerJobCompletion(params: {
  jobId: string;
  status: 'completed' | 'failed';
  result?: unknown;
}): Promise<{ success: boolean; error?: string }> {
  const ctx = makeAdminCtx();

  try {
    const { error } = await ctx.client
      .from('inhouse_job_logs')
      .update({
        status: params.status,
        result: params.result,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.jobId);

    if (error) throw error;

    logger.info('[sdk-harness] triggerJobCompletion complete', params);
    return { success: true };
  } catch (error: any) {
    logger.error('[sdk-harness] triggerJobCompletion failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Wait for backup to reach a specific status
 */
async function handleWaitForBackupStatus(params: {
  backupId: string;
  status: string;
  timeoutMs: number;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ctx = makeAdminCtx();
  const startTime = Date.now();
  const pollInterval = 1000; // 1 second

  while (Date.now() - startTime < params.timeoutMs) {
    const { data, error } = await ctx.client
      .from('inhouse_backups')
      .select('status')
      .eq('id', params.backupId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (data.status === params.status) {
      return { success: true, data: { currentStatus: data.status } };
    }

    if (data.status === 'failed') {
      return { success: false, error: `Backup failed while waiting for ${params.status}` };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return { success: false, error: `Timeout waiting for backup status ${params.status}` };
}

/**
 * Wait for restore to reach a specific status
 */
async function handleWaitForRestoreStatus(params: {
  restoreId: string;
  status: string;
  timeoutMs: number;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ctx = makeAdminCtx();
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < params.timeoutMs) {
    const { data, error } = await ctx.client
      .from('inhouse_restores')
      .select('status')
      .eq('id', params.restoreId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (data.status === params.status) {
      return { success: true, data: { currentStatus: data.status } };
    }

    if (data.status === 'failed') {
      return { success: false, error: `Restore failed while waiting for ${params.status}` };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return { success: false, error: `Timeout waiting for restore status ${params.status}` };
}

/**
 * Get auth headers for a specific test user
 */
async function handleGetAuthHeadersForUser(params: {
  email: string;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ctx = makeAdminCtx();

  try {
    // Get user's session token from the test auth table
    const { data, error } = await ctx.client
      .from('inhouse_user_sessions')
      .select('session_token, user_id')
      .eq('email', params.email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        headers: {
          Authorization: `Bearer ${data.session_token}`,
          'X-User-Id': data.user_id,
        },
      },
    };
  } catch (error: any) {
    logger.error('[sdk-harness] getAuthHeadersForUser failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Generate a valid Stripe webhook signature for testing
 */
async function handleGenerateStripeSignature(params: {
  payload: string;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const crypto = await import('crypto');
    const timestamp = Math.floor(Date.now() / 1000);
    const webhookSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET || 'whsec_test_mock_secret';

    // Generate signature using Stripe's algorithm
    const signedPayload = `${timestamp}.${params.payload}`;
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    const stripeSignature = `t=${timestamp},v1=${signature}`;

    return {
      success: true,
      data: { signature: stripeSignature },
    };
  } catch (error: any) {
    logger.error('[sdk-harness] generateStripeSignature failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * POST /api/admin/e2e/sdk-harness
 *
 * Unified endpoint for all SDK E2E test operations
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Security validation
  const authError = validateAccess(request);
  if (authError) return authError;

  try {
    const body: HarnessRequest = await request.json();
    const { action, params } = body;

    if (!action || !params) {
      return NextResponse.json(
        { success: false, error: 'Missing action or params' },
        { status: 400, headers: RESPONSE_HEADERS }
      );
    }

    // Route to appropriate handler
    let result: { success: boolean; data?: unknown; error?: string };

    switch (action) {
      case 'createProject':
        result = await handleCreateProject(params as Parameters<typeof handleCreateProject>[0]);
        break;

      case 'cleanupProject':
        result = await handleCleanupProject(params as Parameters<typeof handleCleanupProject>[0]);
        break;

      case 'cleanupAllByRunId':
        result = await handleCleanupAllByRunId(params as Parameters<typeof handleCleanupAllByRunId>[0]);
        break;

      case 'setQuotaLimit':
        result = await handleSetQuotaLimit(params as Parameters<typeof handleSetQuotaLimit>[0]);
        break;

      case 'resetQuota':
        result = await handleResetQuota(params as Parameters<typeof handleResetQuota>[0]);
        break;

      case 'getRenderedEmail':
        result = await handleGetRenderedEmail(params as Parameters<typeof handleGetRenderedEmail>[0]);
        break;

      case 'getMagicLinkToken':
        result = await handleGetMagicLinkToken(params as Parameters<typeof handleGetMagicLinkToken>[0]);
        break;

      case 'triggerJobCompletion':
        result = await handleTriggerJobCompletion(params as Parameters<typeof handleTriggerJobCompletion>[0]);
        break;

      case 'waitForBackupStatus':
        result = await handleWaitForBackupStatus(params as Parameters<typeof handleWaitForBackupStatus>[0]);
        break;

      case 'waitForRestoreStatus':
        result = await handleWaitForRestoreStatus(params as Parameters<typeof handleWaitForRestoreStatus>[0]);
        break;

      case 'getAuthHeadersForUser':
        result = await handleGetAuthHeadersForUser(params as Parameters<typeof handleGetAuthHeadersForUser>[0]);
        break;

      case 'generateStripeSignature':
        result = await handleGenerateStripeSignature(params as Parameters<typeof handleGenerateStripeSignature>[0]);
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400, headers: RESPONSE_HEADERS }
        );
    }

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
      headers: RESPONSE_HEADERS,
    });
  } catch (error: any) {
    logger.error('[sdk-harness] Unexpected error', { error: error.message });

    // Don't leak error details - they're logged server-side for debugging
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: RESPONSE_HEADERS }
    );
  }
}
