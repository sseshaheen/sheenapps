/**
 * In-House Mode: Query Execution API Route
 *
 * POST /api/inhouse/query
 *
 * Executes SQL queries against the project's database.
 * Only SELECT statements are allowed for security.
 * All queries are audited and logged.
 *
 * Used by QueryConsole component for running database queries.
 *
 * SECURITY: Session-authenticated, userId derived from session (not client input)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthState } from '@/lib/auth-server'
import { callWorker } from '@/lib/api/worker-helpers'
import { logger } from '@/utils/logger'
import { assertSameOrigin } from '@/lib/security/csrf'
import { assertProjectOwnership } from '@/lib/security/project-access'
import type { ApiResponse, QueryRequest, QueryResult } from '@/types/inhouse-api'

// Force dynamic rendering and no caching
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * EXPERT FIX: Normalize SQL for scanning to prevent keyword smuggling via comments/strings
 */
function normalizeSqlForScanning(input: string): string {
  // 1) Remove /* block comments */
  let q = input.replace(/\/\*[\s\S]*?\*\//g, ' ')
  // 2) Remove -- line comments
  q = q.replace(/--.*$/gm, ' ')
  // 3) Replace string literals with placeholders (prevents keyword smuggling inside strings)
  q = q.replace(/'([^']|'')*'/g, "''")
  // 4) Collapse whitespace
  q = q.replace(/\s+/g, ' ').trim()
  return q
}

/**
 * POST /api/inhouse/query
 * Execute a SQL query (SELECT only, session-authenticated)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // CSRF Protection: Verify request origin
    try {
      assertSameOrigin(request)
    } catch (e) {
      logger.warn('CSRF check failed on query endpoint', {
        error: e instanceof Error ? e.message : String(e),
        origin: request.headers.get('origin'),
        host: request.headers.get('host')
      })
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Forbidden'
          }
        },
        { status: 403 }
      )
    }

    // EXPERT FIX: Use session auth, don't trust userId from client
    const authState = await getServerAuthState()
    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        },
        { status: 401 }
      )
    }

    const userId = authState.user.id

    // Parse request body
    const body: Omit<QueryRequest, 'userId'> = await request.json()

    // Validate required fields
    if (!body.projectId || !body.query) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Project ID and query are required'
          }
        },
        { status: 400 }
      )
    }

    // EXPERT FIX ROUND 3: Verify project ownership before executing query
    try {
      await assertProjectOwnership(userId, body.projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Access denied'
      const code = (error as { code?: string }).code || 'FORBIDDEN'
      const status = (error as { status?: number }).status || 403
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code,
            message
          }
        },
        { status }
      )
    }

    // EXPERT FIX: Hardened query validation to prevent SQL injection
    const raw = body.query
    const q = raw.trim()

    // 1) Reject empty queries
    if (!q) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query cannot be empty'
          }
        },
        { status: 400 }
      )
    }

    // 2) Forbid multi-statement (allow one trailing semicolon only)
    const withoutTrailing = q.endsWith(';') ? q.slice(0, -1) : q
    if (withoutTrailing.includes(';')) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Only a single SELECT statement is allowed'
          }
        },
        { status: 400 }
      )
    }

    // 3) EXPERT FIX: Normalize SQL to prevent comment/string-based keyword smuggling
    const normalized = normalizeSqlForScanning(withoutTrailing)
    const upper = normalized.toUpperCase()
    const isSelect = upper.startsWith('SELECT ')
    const isWithSelect = upper.startsWith('WITH ') && upper.includes(' SELECT ')

    if (!isSelect && !isWithSelect) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Only SELECT queries are allowed'
          }
        },
        { status: 400 }
      )
    }

    // 4) Basic forbid list for obvious footguns (with spaces to avoid false positives)
    // EXPERT FIX ROUND 3: Added pg_sleep and generate_series to prevent expensive queries
    const forbidden = [
      'INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ', 'TRUNCATE ',
      'CREATE ', 'GRANT ', 'REVOKE ', 'COPY ', 'CALL ', 'DO ',
      'PG_SLEEP', 'GENERATE_SERIES' // Prevent sleep/DoS attacks
    ]

    if (forbidden.some(keyword => upper.includes(keyword))) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query contains forbidden operations'
          }
        },
        { status: 400 }
      )
    }

    logger.info('Executing database query', {
      projectId: body.projectId.slice(0, 8),
      userId: userId.slice(0, 8),
      queryLength: body.query.length,
      queryPreview: body.query.slice(0, 50)
    })

    // EXPERT FIX: Add userId from session, use safe worker call with Content-Type
    const result = await callWorker({
      method: 'POST',
      path: '/v1/inhouse/db/query',
      body: {
        ...body,
        userId
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to execute query'
          }
        },
        { status: result.status }
      )
    }

    logger.info('Query executed successfully', {
      projectId: body.projectId.slice(0, 8),
      rowCount: result.data?.rowCount || 0,
      executionTime: result.data?.executionTimeMs || 0
    })

    // Return success response
    return NextResponse.json<ApiResponse<QueryResult>>(
      {
        ok: true,
        data: result.data
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )

  } catch (error) {
    logger.error('Failed to execute query', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while executing query'
        }
      },
      { status: 500 }
    )
  }
}
