/**
 * Project Ownership Check Helper
 *
 * Reduces drift across routes that need to verify project ownership.
 * Defense-in-depth pattern - worker also checks, but we validate early.
 */

import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/types/inhouse-api'

interface OwnerCheckSuccess {
  ok: true
  response?: undefined
}

interface OwnerCheckFailure {
  ok: false
  response: NextResponse<ApiResponse<never>>
}

export type OwnerCheckResult = OwnerCheckSuccess | OwnerCheckFailure

/**
 * Type guard to check if ownership check failed
 */
export function ownerCheckFailed(result: OwnerCheckResult): result is OwnerCheckFailure {
  return !result.ok
}

// Type for the Supabase client parameter - uses duck typing to accept any client
// with the required .from().select().eq().single() pattern
interface SupabaseClientLike {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>
        }
      }
    }
  }
}

/**
 * Verify that a user owns a project
 *
 * @param supabase - Authenticated Supabase client
 * @param projectId - Project ID to check
 * @param userId - User ID to verify ownership for
 * @returns Result object with ok flag and error response if failed
 *
 * @example
 * ```typescript
 * const check = await requireProjectOwner(supabase, projectId, user.id)
 * if (!check.ok) return check.response
 * // User owns project, continue...
 * ```
 */
export async function requireProjectOwner(
  supabase: SupabaseClientLike,
  projectId: string,
  userId: string
): Promise<OwnerCheckResult> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .single()

  if (error || !data) {
    return {
      ok: false,
      response: NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found or you do not have access',
          },
        },
        { status: 404 }
      ),
    }
  }

  return { ok: true }
}
