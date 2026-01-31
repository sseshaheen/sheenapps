/**
 * Inbox Unread Summary API Route
 *
 * GET /api/inhouse/inbox/unread-summary - Get unread counts across all projects
 *
 * Cross-project endpoint (no projectId needed).
 * Returns { [projectId]: number } map of unread counts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { callWorker } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabaseClientNew()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  const result = await callWorker({
    method: 'GET',
    path: '/v1/inhouse/inbox/unread-summary',
    queryParams: { userId: user.id },
    claims: { userId: user.id },
  })

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? { code: 'WORKER_ERROR', message: 'Failed to fetch unread summary' } },
      { status: result.status }
    )
  }

  return NextResponse.json({ ok: true, data: result.data }, { status: 200 })
}
