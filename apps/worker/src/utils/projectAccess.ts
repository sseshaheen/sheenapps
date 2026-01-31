/**
 * Project Access Authorization Utilities
 *
 * Centralized authorization checks for project-scoped operations.
 * Used by all worker routes that access project data.
 */

import { pool } from '../services/database';

/**
 * Authorization error with proper status code
 */
export class UnauthorizedProjectAccessError extends Error {
  statusCode = 403;
  code = 'UNAUTHORIZED_PROJECT_ACCESS';

  constructor(message = 'Unauthorized project access') {
    super(message);
    this.name = 'UnauthorizedProjectAccessError';
  }
}

/**
 * Asserts that a user has access to a project (owner or collaborator).
 * Throws 403 if access is denied.
 *
 * @param projectId - The project UUID to check access for
 * @param userId - The user UUID requesting access
 * @throws UnauthorizedProjectAccessError if user lacks access
 */
export async function assertProjectAccess(projectId: string, userId: string): Promise<void> {
  if (!pool) {
    throw new Error('Database connection not available');
  }

  if (!projectId || !userId) {
    throw new UnauthorizedProjectAccessError('Missing projectId or userId');
  }

  const { rows } = await pool.query(
    `SELECT 1 FROM projects p
     WHERE p.id = $1
       AND (p.owner_id = $2 OR EXISTS (
         SELECT 1 FROM project_collaborators pc
         WHERE pc.project_id = p.id
           AND pc.user_id = $2
       ))`,
    [projectId, userId]
  );

  if (rows.length === 0) {
    throw new UnauthorizedProjectAccessError();
  }
}

/**
 * Asserts that a user has access to a build's project.
 * Looks up the project from build metrics and verifies access.
 *
 * @param buildId - The build ID to check access for
 * @param userId - The user UUID requesting access
 * @throws UnauthorizedProjectAccessError if user lacks access or build not found
 */
export async function assertProjectAccessByBuild(buildId: string, userId: string): Promise<void> {
  if (!pool) {
    throw new Error('Database connection not available');
  }

  if (!buildId || !userId) {
    throw new UnauthorizedProjectAccessError('Missing buildId or userId');
  }

  // Look up the build's project and verify access in one query
  const { rows } = await pool.query(
    `SELECT 1 FROM project_build_metrics pbm
     JOIN projects p ON p.id = pbm.project_id
     WHERE pbm.build_id = $1
       AND (p.owner_id = $2 OR EXISTS (
         SELECT 1 FROM project_collaborators pc
         WHERE pc.project_id = p.id
           AND pc.user_id = $2
       ))`,
    [buildId, userId]
  );

  if (rows.length === 0) {
    throw new UnauthorizedProjectAccessError('Build not found or access denied');
  }
}
