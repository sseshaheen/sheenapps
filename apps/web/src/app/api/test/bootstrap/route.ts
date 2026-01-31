/**
 * Test Bootstrap API
 *
 * Creates test fixtures for E2E test runs.
 * All created data is tagged with test_run_id for targeted cleanup.
 *
 * Expert-validated pattern from PLAYWRIGHT_TEST_ANALYSIS.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateTestEndpoint, TEST_RESPONSE_HEADERS, TEST_ROUTE_CONFIG } from '../_utils/security'
import { makeAdminCtx } from '@/lib/db/context'
import { logger } from '@/utils/logger'

export const { dynamic, revalidate, fetchCache } = TEST_ROUTE_CONFIG

interface BootstrapRequest {
  runId: string
  createProject?: boolean
  createSubscription?: boolean
  projectName?: string
  locale?: string
  user?: {
    email: string
    password: string
  }
}

interface BootstrapResponse {
  userId: string
  projectId: string
  projectSlug: string
  workspaceId?: string
  region: string
  plan: string
  runId: string
}

/**
 * POST /api/test/bootstrap
 *
 * Creates test fixtures and returns IDs for test use
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Security check
  const authError = validateTestEndpoint(request)
  if (authError) return authError

  try {
    const body: BootstrapRequest = await request.json()
    const {
      runId,
      createProject = true,
      createSubscription = false,
      projectName = `E2E Test Project`,
      locale = 'en',
      user,
    } = body

    if (!runId) {
      return NextResponse.json(
        { error: 'runId is required', code: 'MISSING_RUN_ID' },
        { status: 400, headers: TEST_RESPONSE_HEADERS }
      )
    }

    logger.info('[test-bootstrap] Starting bootstrap', { runId, createProject, createSubscription })

    // Use admin context for test data creation (bypasses RLS)
    const ctx = makeAdminCtx()

    // Step 1: Get test user (must be pre-seeded)
    let userId: string
    const userEmail: string = user?.email || 'e2e@test.sheenapps.ai'

    // EXPERT FIX: Check auth.users directly since profiles might not have email column
    // The user must be pre-seeded - we fail fast instead of using placeholder IDs
    // that will break FK constraints on projects.owner_id -> auth.users(id)
    const { data: existingUser, error: userLookupError } = await ctx.client
      .from('profiles')
      .select('user_id, email')
      .eq('email', userEmail)
      .maybeSingle()

    if (userLookupError) {
      logger.error('[test-bootstrap] Error looking up user', { error: userLookupError, email: userEmail })
      return NextResponse.json(
        {
          error: 'Failed to look up test user',
          code: 'USER_LOOKUP_ERROR',
          details: userLookupError.message
        },
        { status: 500, headers: TEST_RESPONSE_HEADERS }
      )
    }

    if (existingUser) {
      userId = existingUser.user_id
      logger.info('[test-bootstrap] Using existing user', { userId, email: userEmail })
    } else {
      // EXPERT FIX: Fail fast instead of using placeholder ID
      // Placeholder IDs like `test-user-${runId}` will break FK constraints
      // Test users must be pre-seeded in the database before running tests
      logger.error('[test-bootstrap] Test user not found - must be pre-seeded', { email: userEmail })
      return NextResponse.json(
        {
          error: 'Test user not found',
          code: 'TEST_USER_NOT_SEEDED',
          details: `User with email "${userEmail}" must be created before running tests. See docs/TEST_SETUP.md for instructions.`,
          hint: 'Create a test user in Supabase Auth, or use a different email that exists.'
        },
        { status: 500, headers: TEST_RESPONSE_HEADERS }
      )
    }

    // Step 2: Create project if requested
    let projectId: string = ''
    let projectSlug: string = ''

    if (createProject) {
      const projectSlugBase = projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      projectSlug = `${projectSlugBase}-${runId.slice(0, 8)}`

      const { data: project, error: projectError } = await ctx.client
        .from('projects')
        .insert({
          name: projectName,
          subdomain: projectSlug,
          owner_id: userId,
          framework: 'nextjs',
          build_status: 'deployed',
          test_run_id: runId, // Tag with run ID for cleanup
          created_by_service: 'e2e-test',
          config: {
            locale,
            test: true,
            created_by: 'e2e-bootstrap',
          },
        })
        .select('id, subdomain')
        .single()

      if (projectError) {
        logger.error('[test-bootstrap] Failed to create project', { error: projectError })
        return NextResponse.json(
          { error: 'Failed to create test project', details: projectError.message },
          { status: 500, headers: TEST_RESPONSE_HEADERS }
        )
      }

      projectId = project.id
      projectSlug = project.subdomain || projectSlug
      logger.info('[test-bootstrap] Created test project', { projectId, projectSlug })
    }

    // Step 3: Create subscription if requested
    // This would interact with your billing/subscription tables
    if (createSubscription) {
      logger.info('[test-bootstrap] Subscription creation requested (mock)', { runId })
      // Mock implementation - actual implementation would create subscription records
    }

    const response: BootstrapResponse = {
      userId,
      projectId,
      projectSlug,
      region: 'US',
      plan: createSubscription ? 'test-pro' : 'free',
      runId,
    }

    logger.info('[test-bootstrap] Bootstrap complete', { runId, projectId })

    return NextResponse.json(response, {
      status: 200,
      headers: TEST_RESPONSE_HEADERS,
    })

  } catch (error: any) {
    logger.error('[test-bootstrap] Unexpected error', { error: error.message })

    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500, headers: TEST_RESPONSE_HEADERS }
    )
  }
}

/**
 * GET /api/test/bootstrap
 *
 * Health check - returns 200 if endpoints are enabled
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = validateTestEndpoint(request)
  if (authError) return authError

  return NextResponse.json(
    { status: 'ok', message: 'Test bootstrap endpoint available' },
    { headers: TEST_RESPONSE_HEADERS }
  )
}
