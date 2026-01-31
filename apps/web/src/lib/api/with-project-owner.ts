/**
 * withProjectOwner - Route handler wrapper
 *
 * Centralizes auth + ownership checks for project-scoped API routes.
 * Eliminates boilerplate and ensures consistent error handling.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'

export type ProjectOwnerContext = {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientNew>>
  userId: string
  projectId: string
}

/**
 * Wraps a route handler with auth + project ownership verification.
 *
 * @example
 * export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 *   const { id: projectId } = await params
 *   return withProjectOwner(req, projectId, async ({ userId, supabase }) => {
 *     // Your handler logic here
 *   })
 * }
 */
export async function withProjectOwner(
  req: NextRequest,
  projectId: string,
  handler: (ctx: ProjectOwnerContext) => Promise<NextResponse>
): Promise<NextResponse> {
  const supabase = await createServerSupabaseClientNew()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
  if (!ownerCheck.ok) return ownerCheck.response

  return handler({ supabase, userId: user.id, projectId })
}
