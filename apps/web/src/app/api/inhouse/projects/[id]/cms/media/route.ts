/**
 * In-House Mode: CMS Media Admin API
 *
 * GET /api/inhouse/projects/[id]/cms/media
 * POST /api/inhouse/projects/[id]/cms/media
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerAuthState } from '@/lib/auth-server'
import { assertProjectOwnership } from '@/lib/security/project-access'
import { assertSameOrigin } from '@/lib/security/csrf'
import { callWorker } from '@/lib/api/worker-helpers'
import { parseLimit, parseOffset } from '@/lib/api/pagination'
import { parseUuid, isHttpError } from '@/lib/validation/params'
import { logger } from '@/utils/logger'
import type { ApiResponse } from '@/types/inhouse-api'
import type { CmsMediaItem } from '@/types/inhouse-cms'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const maxDuration = 60

const MAX_MEDIA_BYTES = 10 * 1024 * 1024

// Base64 validation regex - matches valid base64 characters
const Base64Schema = z.string().regex(/^[A-Za-z0-9+/=\s]+$/, 'Invalid base64 format')

const UploadSchema = z.object({
  // Restrict filename to safe characters - no path traversal (../, /)
  filename: z.string().min(1).max(160).regex(
    /^[a-zA-Z0-9._-]+$/,
    'Filename must contain only letters, numbers, dots, underscores, and hyphens'
  ),
  contentBase64: Base64Schema.min(8),
  contentType: z.string().max(120).optional(),
  altText: z.string().max(300).optional(),
  metadata: z.record(z.string(), z.any()).optional()
})

// Content-type allowlist for media uploads
// SVG removed due to script injection risks
const AllowedContentTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/**
 * Normalize base64 by removing all whitespace
 */
function normalizeBase64(input: string): string {
  return input.replace(/\s+/g, '')
}

/**
 * Decode base64 to Buffer and validate
 * Returns null if invalid base64 or empty
 */
function decodeBase64ToBuffer(b64: string): Buffer | null {
  try {
    const normalized = normalizeBase64(b64)
    const buf = Buffer.from(normalized, 'base64')
    // Basic sanity check: reject empty/near-empty decodes
    if (!buf || buf.length === 0) return null
    return buf
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const projectId = parseUuid(id, 'projectId')
    const authState = await getServerAuthState()

    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    await assertProjectOwnership(authState.user.id, projectId)

    const { searchParams } = request.nextUrl
    const limitNum = parseLimit(searchParams.get('limit'), 50, 200)
    const offsetNum = parseOffset(searchParams.get('offset'), 0)

    const result = await callWorker({
      method: 'GET',
      path: '/v1/inhouse/cms/admin/media',
      queryParams: {
        projectId,
        limit: limitNum,
        offset: offsetNum
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to load media'
          }
        },
        { status: result.status }
      )
    }

    return NextResponse.json<ApiResponse<{ media: CmsMediaItem[] }>>({
      ok: true,
      data: { media: result.data?.media || [] }
    })
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: error.code ?? 'ERROR', message: error.message ?? 'Error' } },
        { status: error.status }
      )
    }

    logger.error('Failed to fetch CMS media', {
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load media' } },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request)

    const contentLength = request.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_MEDIA_BYTES * 1.4) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' } },
        { status: 413 }
      )
    }

    const { id } = await params
    const projectId = parseUuid(id, 'projectId')
    const authState = await getServerAuthState()

    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    await assertProjectOwnership(authState.user.id, projectId)

    const body = await request.json().catch(() => null)
    const parsed = UploadSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } },
        { status: 400 }
      )
    }

    // Normalize and decode base64 to verify validity and get real size
    const normalizedB64 = normalizeBase64(parsed.data.contentBase64)
    const decoded = decodeBase64ToBuffer(normalizedB64)

    if (!decoded) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid base64 payload' } },
        { status: 400 }
      )
    }

    if (decoded.byteLength > MAX_MEDIA_BYTES) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 10MB limit' } },
        { status: 413 }
      )
    }

    // Validate content-type against allowlist
    if (parsed.data.contentType && !AllowedContentTypes.has(parsed.data.contentType)) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Unsupported content type. Allowed: PNG, JPEG, WebP, GIF'
          }
        },
        { status: 415 }
      )
    }

    const result = await callWorker({
      method: 'POST',
      path: '/v1/inhouse/cms/admin/media',
      body: {
        projectId,
        ...parsed.data,
        contentBase64: normalizedB64
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to upload media'
          }
        },
        { status: result.status }
      )
    }

    return NextResponse.json<ApiResponse<{ media: CmsMediaItem }>>({
      ok: true,
      data: { media: result.data?.media }
    })
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: error.code ?? 'ERROR', message: error.message ?? 'Error' } },
        { status: error.status }
      )
    }

    logger.error('Failed to upload CMS media', {
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to upload media' } },
      { status: 500 }
    )
  }
}
