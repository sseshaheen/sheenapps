/**
 * Project Authorization Utilities
 *
 * Centralized authorization helper for project-scoped operations.
 * Provides security checks for project ownership and collaboration.
 */

import { getPool } from '../services/database'

/**
 * Validate and extract userId from request.
 * Use this for endpoints that require userId for authorization.
 *
 * @throws Error with statusCode 400 if userId is missing or invalid
 * @returns The validated userId string
 */
export function requireUserId(userId: unknown): string {
  if (typeof userId !== 'string' || userId.trim() === '') {
    const error = new Error('userId is required') as Error & { statusCode: number; code: string }
    error.statusCode = 400
    error.code = 'VALIDATION_ERROR'
    throw error
  }
  return userId.trim()
}

export async function assertProjectAccess(projectId: string, userId: string): Promise<void> {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT 1 FROM projects p
     WHERE p.id = $1
       AND (p.owner_id = $2 OR EXISTS (
         SELECT 1 FROM project_collaborators pc
         WHERE pc.project_id = p.id AND pc.user_id = $2
       ))`,
    [projectId, userId]
  )
  if (rows.length === 0) {
    const error = new Error('Unauthorized project access') as Error & { statusCode: number; code: string }
    error.statusCode = 403
    error.code = 'UNAUTHORIZED_PROJECT_ACCESS'
    throw error
  }
}

export async function getProjectOwnerId(projectId: string): Promise<string | null> {
  const pool = getPool()
  const { rows } = await pool.query(
    'SELECT owner_id FROM projects WHERE id = $1',
    [projectId]
  )
  return rows[0]?.owner_id || null
}

export async function isProjectOwner(projectId: string, userId: string): Promise<boolean> {
  const ownerId = await getProjectOwnerId(projectId)
  return ownerId === userId
}
