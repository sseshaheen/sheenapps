/**
 * Test Cleanup API
 *
 * Cleans up test data by run ID.
 * CRITICAL: Only deletes data tagged with the specific run ID.
 * Does NOT reset "the user" - preserves debug info from other runs.
 *
 * Expert-validated pattern from PLAYWRIGHT_TEST_ANALYSIS.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateTestEndpoint, TEST_RESPONSE_HEADERS, TEST_ROUTE_CONFIG } from '../_utils/security'
import { makeAdminCtx } from '@/lib/db/context'
import { logger } from '@/utils/logger'

export const { dynamic, revalidate, fetchCache } = TEST_ROUTE_CONFIG

type CleanupScope = 'projects' | 'chat_messages' | 'chat_sessions'

interface CleanupRequest {
  runId: string
  scope?: CleanupScope[]
}

interface CleanupResult {
  scope: CleanupScope
  deleted: number
  error?: string
}

interface CleanupResponse {
  runId: string
  results: CleanupResult[]
  totalDeleted: number
}

/**
 * EXPERT FIX: Shared cleanup logic for both POST and DELETE handlers
 * Avoids sketchy NextRequest construction in DELETE handler
 */
async function runCleanup(runId: string, scope: CleanupScope[]): Promise<CleanupResponse> {
  logger.info('[test-cleanup] Starting cleanup', { runId, scope })

  // Use admin context (bypasses RLS for cleanup operations)
  const ctx = makeAdminCtx()
  const results: CleanupResult[] = []
  let totalDeleted = 0

  // EXPERT FIX: Correct deletion order for FK constraints
  // Order: chat_messages → chat_sessions → projects
  // (messages have FK to sessions, sessions have FK to projects)

  if (scope.includes('chat_messages')) {
    try {
      const { data, error } = await ctx.client
        .from('project_chat_log_minimal')
        .delete()
        .eq('test_run_id', runId)
        .select('id')

      const deletedCount = data?.length || 0
      results.push({ scope: 'chat_messages', deleted: deletedCount })
      totalDeleted += deletedCount

      if (error) {
        logger.warn('[test-cleanup] Chat messages cleanup error', { error })
        results[results.length - 1].error = error.message
      } else {
        logger.info('[test-cleanup] Deleted chat messages', { count: deletedCount })
      }
    } catch (e: any) {
      results.push({ scope: 'chat_messages', deleted: 0, error: e.message })
    }
  }

  if (scope.includes('chat_sessions')) {
    try {
      const { data, error } = await ctx.client
        .from('unified_chat_sessions')
        .delete()
        .eq('test_run_id', runId)
        .select('id')

      const deletedCount = data?.length || 0
      results.push({ scope: 'chat_sessions', deleted: deletedCount })
      totalDeleted += deletedCount

      if (error) {
        logger.warn('[test-cleanup] Chat sessions cleanup error', { error })
        results[results.length - 1].error = error.message
      } else {
        logger.info('[test-cleanup] Deleted chat sessions', { count: deletedCount })
      }
    } catch (e: any) {
      results.push({ scope: 'chat_sessions', deleted: 0, error: e.message })
    }
  }

  if (scope.includes('projects')) {
    try {
      // First, delete related records that have foreign keys to projects
      // Get project IDs first
      const { data: projectsToDelete } = await ctx.client
        .from('projects')
        .select('id')
        .eq('test_run_id', runId)

      if (projectsToDelete && projectsToDelete.length > 0) {
        const projectIds = projectsToDelete.map(p => p.id)

        // Delete branches
        await ctx.client
          .from('branches')
          .delete()
          .in('project_id', projectIds)

        // Delete commits
        await ctx.client
          .from('commits')
          .delete()
          .in('project_id', projectIds)

        // Delete assets
        await ctx.client
          .from('assets')
          .delete()
          .in('project_id', projectIds)
      }

      // Now delete the projects
      const { data, error } = await ctx.client
        .from('projects')
        .delete()
        .eq('test_run_id', runId)
        .select('id')

      const deletedCount = data?.length || 0
      results.push({ scope: 'projects', deleted: deletedCount })
      totalDeleted += deletedCount

      if (error) {
        logger.warn('[test-cleanup] Projects cleanup error', { error })
        results[results.length - 1].error = error.message
      } else {
        logger.info('[test-cleanup] Deleted projects', { count: deletedCount })
      }
    } catch (e: any) {
      results.push({ scope: 'projects', deleted: 0, error: e.message })
    }
  }

  logger.info('[test-cleanup] Cleanup complete', { runId, totalDeleted })

  return {
    runId,
    results,
    totalDeleted,
  }
}

/**
 * POST /api/test/cleanup
 *
 * Deletes test data for a specific run ID
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Security check
  const authError = validateTestEndpoint(request)
  if (authError) return authError

  try {
    const body: CleanupRequest = await request.json()
    const {
      runId,
      // EXPERT FIX: Default scope now has correct order (messages → sessions → projects)
      scope = ['chat_messages', 'chat_sessions', 'projects'],
    } = body

    if (!runId) {
      return NextResponse.json(
        { error: 'runId is required', code: 'MISSING_RUN_ID' },
        { status: 400, headers: TEST_RESPONSE_HEADERS }
      )
    }

    const response = await runCleanup(runId, scope)

    return NextResponse.json(response, {
      status: 200,
      headers: TEST_RESPONSE_HEADERS,
    })

  } catch (error: any) {
    logger.error('[test-cleanup] Unexpected error', { error: error.message })

    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500, headers: TEST_RESPONSE_HEADERS }
    )
  }
}

/**
 * DELETE /api/test/cleanup?runId=xxx
 *
 * Alternative method for cleanup (convenience)
 * EXPERT FIX: Use shared runCleanup function instead of sketchy NextRequest construction
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  // Security check
  const authError = validateTestEndpoint(request)
  if (authError) return authError

  const runId = request.nextUrl.searchParams.get('runId')

  if (!runId) {
    return NextResponse.json(
      { error: 'runId query parameter required', code: 'MISSING_RUN_ID' },
      { status: 400, headers: TEST_RESPONSE_HEADERS }
    )
  }

  try {
    // EXPERT FIX: Call shared cleanup logic directly instead of constructing fake request
    const response = await runCleanup(runId, ['chat_messages', 'chat_sessions', 'projects'])

    return NextResponse.json(response, {
      status: 200,
      headers: TEST_RESPONSE_HEADERS,
    })
  } catch (error: any) {
    logger.error('[test-cleanup] Unexpected error', { error: error.message })

    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500, headers: TEST_RESPONSE_HEADERS }
    )
  }
}
