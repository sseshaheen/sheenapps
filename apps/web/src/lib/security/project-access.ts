/**
 * Project Access Control Utilities
 *
 * Verifies that authenticated users own the projects they're trying to access.
 * This is defense-in-depth - Worker also enforces, but we check here first
 * to reject unauthorized requests early and avoid unnecessary Worker load.
 */

import { verifyProjectAccess } from '@/lib/server/auth'

/**
 * Assert that the current user owns the specified project.
 * Throws an error if access is denied (404 to avoid leaking project existence).
 *
 * Use this in API routes that accept projectId from client before calling Worker.
 *
 * @param userId - User ID from session (already authenticated)
 * @param projectId - Project ID from client request
 * @throws Error with status 404 if project doesn't exist or user doesn't own it
 *
 * @example
 * ```ts
 * const authState = await getServerAuthState()
 * const userId = authState.user.id
 * const { projectId } = await request.json()
 *
 * await assertProjectOwnership(userId, projectId) // Throws if no access
 * // ... proceed with Worker call
 * ```
 */
export async function assertProjectOwnership(
  userId: string,
  projectId: string
): Promise<void> {
  const hasAccess = await verifyProjectAccess(userId, projectId)

  if (!hasAccess) {
    // Use 404 instead of 403 to avoid leaking existence of other users' projects
    const error = new Error('Project not found')
    ;(error as any).status = 404
    ;(error as any).code = 'NOT_FOUND'
    throw error
  }
}
