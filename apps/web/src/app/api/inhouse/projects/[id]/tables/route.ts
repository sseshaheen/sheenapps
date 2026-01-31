/**
 * In-House Mode: Create Table API Route
 *
 * POST /api/inhouse/projects/[id]/tables
 *
 * Creates a new table in the project's database schema.
 * Accepts table name and column definitions.
 *
 * Used by CreateTableDialog component for creating database tables.
 *
 * SECURITY: Session-authenticated, userId derived from session (not client input)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthState } from '@/lib/auth-server'
import { callWorker } from '@/lib/api/worker-helpers'
import { logger } from '@/utils/logger'
import { z } from 'zod'
import { assertSameOrigin } from '@/lib/security/csrf'
import type { ApiResponse, CreateTableResponse } from '@/types/inhouse-api'

// Force dynamic rendering and no caching
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// EXPERT FIX: Zod validation for SQL injection prevention
// PostgreSQL identifier naming rules: 1-63 chars, start with letter/underscore, alphanumeric + underscore only
const Identifier = z
  .string()
  .min(1, 'Identifier cannot be empty')
  .max(63, 'Identifier too long (max 63 characters)')
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid identifier: must start with letter or underscore, and contain only letters, numbers, and underscores')

// Allowlist of PostgreSQL column types
const ColumnType = z.enum([
  'text',
  'integer',
  'bigint',
  'boolean',
  'timestamp',
  'timestamptz',
  'uuid',
  'json',
  'jsonb',
  'numeric',
  'real',
  'double precision'
])

// Column definition schema
const ColumnSchema = z.object({
  name: Identifier,
  type: ColumnType,
  nullable: z.boolean(),
  defaultValue: z.string().max(200).nullable().optional(),
  isPrimaryKey: z.boolean()
})

// Create table request schema
const CreateTableSchema = z.object({
  tableName: Identifier,
  columns: z
    .array(ColumnSchema)
    .min(1, 'At least one column is required')
    .max(50, 'Too many columns (max 50)')
    .refine(
      (cols) => cols.filter(c => c.isPrimaryKey).length <= 1,
      'Only one primary key is allowed'
    )
})

/**
 * POST /api/inhouse/projects/[id]/tables
 * Create a new table in the project's database (session-authenticated)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // CSRF Protection: Verify request origin
    try {
      assertSameOrigin(request)
    } catch (e) {
      logger.warn('CSRF check failed on create table endpoint', {
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

    const { id: projectId } = await params

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

    // Parse and validate request body with Zod
    const rawBody = await request.json()
    const parsed = CreateTableSchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid table definition',
            details: parsed.error.issues
          }
        },
        { status: 400 }
      )
    }

    const body = parsed.data

    logger.info('Creating database table', {
      projectId: projectId.slice(0, 8),
      userId: userId.slice(0, 8),
      tableName: body.tableName,
      columnCount: body.columns.length
    })

    // EXPERT FIX: Add userId from session, use safe worker call with Content-Type
    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/projects/${projectId}/tables`,
      body: {
        ...body,
        projectId,
        userId
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to create table'
          }
        },
        { status: result.status }
      )
    }

    logger.info('Table created successfully', {
      projectId: projectId.slice(0, 8),
      tableName: body.tableName
    })

    // Return success response
    return NextResponse.json<ApiResponse<CreateTableResponse>>(
      {
        ok: true,
        data: result.data
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )

  } catch (error) {
    logger.error('Failed to create table', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while creating table'
        }
      },
      { status: 500 }
    )
  }
}
