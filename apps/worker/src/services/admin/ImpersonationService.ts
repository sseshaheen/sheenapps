/**
 * Impersonation Service
 *
 * Allows admins to view a project as the owner would see it (READ-ONLY).
 *
 * Security Model (Defense-in-Depth):
 * 1. Two-step friction with typed confirmation ("IMPERSONATE <slug>")
 * 2. Route allowlist (only specific GET endpoints)
 * 3. Response redaction middleware (blocks CSV/ZIP, scans JSON)
 * 4. HMAC-SHA256 token hashing (offline guessing resistant)
 * 5. Hard 30-minute TTL, no extensions
 * 6. IP/UA soft binding with mismatch logging
 * 7. One active session per admin
 * 8. Full audit trail
 */

import { createHmac, randomBytes, randomUUID } from 'crypto'
import { Pool } from 'pg'
import { getDatabase } from '../database'
import { auditAdminAction } from '../../routes/admin/_audit'

// =============================================================================
// TYPES
// =============================================================================

export interface ImpersonationSession {
  id: string
  adminId: string
  projectId: string
  ownerId: string
  projectSlug: string
  projectName: string
  ownerEmail: string
  status: 'pending' | 'active' | 'ended' | 'expired'
  allowedRoutes: string[]
  createdAt: string
  confirmedAt?: string
  endedAt?: string
  expiresAt: string
  endReason?: string
  boundIp?: string
  boundUserAgent?: string
}

export interface StartImpersonationResult {
  confirmationToken: string
  expiresIn: number
  projectName: string
  projectSlug: string
  ownerEmail: string
}

export interface ConfirmImpersonationResult {
  sessionToken: string
  expiresAt: string
  allowedRoutes: string[]
  projectId: string
  projectName: string
}

export interface ActiveSession {
  active: boolean
  projectId?: string
  projectName?: string
  expiresAt?: string
  remainingSeconds?: number
  allowedRoutes?: string[]
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Token hashing secret - MUST be set in environment (no fallback for security)
const TOKEN_HASH_SECRET = process.env.TOKEN_HASH_SECRET || ''
if (!TOKEN_HASH_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[SECURITY] TOKEN_HASH_SECRET is required in production')
}

// Session configuration
const CONFIRMATION_TTL_SECONDS = 60  // 1 minute to confirm
const SESSION_TTL_SECONDS = 30 * 60  // 30 minutes max session

// Route allowlist - only these endpoints can be accessed during impersonation
export const IMPERSONATION_ALLOWED_ROUTES = [
  // Storage - view files only (NO presigned URLs, NO downloads)
  'GET /v1/inhouse/projects/:projectId/storage/files',
  'GET /v1/inhouse/projects/:projectId/storage/usage',

  // Jobs - view only
  'GET /v1/inhouse/projects/:projectId/jobs',
  'GET /v1/inhouse/projects/:projectId/jobs/:jobId',

  // Email - view metadata only (NO rendered content with tokens)
  'GET /v1/inhouse/projects/:projectId/emails',
  'GET /v1/inhouse/projects/:projectId/emails/:emailId/metadata',

  // Analytics - view only
  'GET /v1/inhouse/projects/:projectId/analytics/events',
  'GET /v1/inhouse/projects/:projectId/analytics/stats',

  // Auth - view sessions only
  'GET /v1/inhouse/projects/:projectId/auth/users',
  'GET /v1/inhouse/projects/:projectId/auth/sessions',

  // Activity - view logs only
  'GET /v1/inhouse/projects/:projectId/activity',

  // Forms - view submissions only
  'GET /v1/inhouse/projects/:projectId/forms',
  'GET /v1/inhouse/projects/:projectId/forms/submissions',
]

// Content types blocked during impersonation (even if route is allowed)
const BLOCKED_CONTENT_TYPES = [
  'text/csv',
  'application/zip',
  'application/octet-stream',
  'application/x-download',
  'application/force-download',
]

// JSON fields to redact in responses
const SENSITIVE_JSON_FIELDS = /presignedUrl|downloadUrl|signedUrl|token|secret|apiKey|password|rawContent|html/i

// =============================================================================
// TOKEN HASHING
// =============================================================================

/**
 * Hash a token using HMAC-SHA256 for offline guessing resistance.
 * A leaked DB dump can't verify tokens without the server secret.
 */
function hashToken(token: string): string {
  if (!TOKEN_HASH_SECRET) {
    throw new Error('TOKEN_HASH_SECRET environment variable is required')
  }
  return createHmac('sha256', TOKEN_HASH_SECRET)
    .update(token)
    .digest('hex')
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

// =============================================================================
// SERVICE
// =============================================================================

export class ImpersonationService {
  private pool: Pool

  constructor() {
    this.pool = getDatabase()
  }

  /**
   * Step 1: Start impersonation (creates pending session)
   * Returns confirmation token that must be confirmed with typed slug
   */
  async startImpersonation(
    adminId: string,
    projectId: string,
    reason: string,
    clientIp: string,
    userAgent: string
  ): Promise<StartImpersonationResult> {
    // Check for existing active/pending session for this admin
    const existingResult = await this.pool.query(`
      SELECT id FROM inhouse_impersonation_sessions
      WHERE admin_id = $1 AND status IN ('pending', 'active')
    `, [adminId])

    if (existingResult.rows.length > 0) {
      throw new Error('You already have an active or pending impersonation session. End it first.')
    }

    // Get project details
    const projectResult = await this.pool.query(`
      SELECT p.id, p.name, p.slug, p.owner_id, u.email as owner_email
      FROM projects p
      JOIN auth.users u ON u.id = p.owner_id
      WHERE p.id = $1
    `, [projectId])

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found')
    }

    const project = projectResult.rows[0]

    // Generate confirmation token
    const confirmationToken = generateToken()
    const confirmationTokenHash = hashToken(confirmationToken)

    // Create pending session
    const sessionId = randomUUID()
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_SECONDS * 1000)

    await this.pool.query(`
      INSERT INTO inhouse_impersonation_sessions (
        id, admin_id, project_id, owner_id, reason, status,
        confirmation_token_hash, allowed_routes,
        bound_ip, bound_user_agent, expires_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
    `, [
      sessionId,
      adminId,
      projectId,
      project.owner_id,
      reason,
      confirmationTokenHash,
      IMPERSONATION_ALLOWED_ROUTES,
      clientIp,
      userAgent,
      expiresAt,
    ])

    // Audit log
    auditAdminAction({
      adminId,
      action: 'impersonation_started',
      projectId,
      resourceType: 'impersonation',
      resourceId: sessionId,
      reason,
      metadata: { ownerEmail: project.owner_email, projectSlug: project.slug },
      ipAddress: clientIp,
      userAgent,
    })

    return {
      confirmationToken,
      expiresIn: CONFIRMATION_TTL_SECONDS,
      projectName: project.name,
      projectSlug: project.slug,
      ownerEmail: project.owner_email,
    }
  }

  /**
   * Step 2: Confirm impersonation with typed confirmation
   * User must type "IMPERSONATE <project-slug>" to activate
   */
  async confirmImpersonation(
    confirmationToken: string,
    typedConfirmation: string,
    clientIp: string,
    userAgent: string
  ): Promise<ConfirmImpersonationResult> {
    const confirmationTokenHash = hashToken(confirmationToken)

    // Find pending session with this token
    const sessionResult = await this.pool.query(`
      SELECT s.*, p.name as project_name, p.slug as project_slug
      FROM inhouse_impersonation_sessions s
      JOIN projects p ON p.id = s.project_id
      WHERE s.confirmation_token_hash = $1
        AND s.status = 'pending'
        AND s.expires_at > NOW()
    `, [confirmationTokenHash])

    if (sessionResult.rows.length === 0) {
      throw new Error('Invalid or expired confirmation token')
    }

    const session = sessionResult.rows[0]

    // Verify typed confirmation
    const expectedConfirmation = `IMPERSONATE ${session.project_slug}`.toUpperCase()
    if (typedConfirmation.toUpperCase().trim() !== expectedConfirmation) {
      throw new Error(`Invalid confirmation. Please type exactly: IMPERSONATE ${session.project_slug}`)
    }

    // Generate session token
    const sessionToken = generateToken()
    const sessionTokenHash = hashToken(sessionToken)

    // Update session to active
    const newExpiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

    await this.pool.query(`
      UPDATE inhouse_impersonation_sessions
      SET status = 'active',
          session_token_hash = $1,
          confirmed_at = NOW(),
          expires_at = $2,
          bound_ip = $3,
          bound_user_agent = $4
      WHERE id = $5
    `, [sessionTokenHash, newExpiresAt, clientIp, userAgent, session.id])

    // Audit log
    auditAdminAction({
      adminId: session.admin_id,
      action: 'impersonation_confirmed',
      projectId: session.project_id,
      resourceType: 'impersonation',
      resourceId: session.id,
      ipAddress: clientIp,
      userAgent,
    })

    // TODO: Send Slack/webhook notification
    // this.sendNotification('impersonation_started', session)

    return {
      sessionToken,
      expiresAt: newExpiresAt.toISOString(),
      allowedRoutes: session.allowed_routes,
      projectId: session.project_id,
      projectName: session.project_name,
    }
  }

  /**
   * Validate session token and return session details
   * Used by proxy middleware
   */
  async validateSession(
    sessionToken: string,
    clientIp: string,
    userAgent: string
  ): Promise<ImpersonationSession | null> {
    const sessionTokenHash = hashToken(sessionToken)

    const result = await this.pool.query(`
      SELECT s.*, p.name as project_name, p.slug as project_slug, u.email as owner_email
      FROM inhouse_impersonation_sessions s
      JOIN projects p ON p.id = s.project_id
      JOIN auth.users u ON u.id = s.owner_id
      WHERE s.session_token_hash = $1
        AND s.status = 'active'
        AND s.expires_at > NOW()
    `, [sessionTokenHash])

    if (result.rows.length === 0) {
      return null
    }

    const session = result.rows[0]

    // Soft IP/UA binding check (log mismatch but don't block)
    const ipMismatch = session.bound_ip && session.bound_ip !== clientIp
    const uaMismatch = session.bound_user_agent && session.bound_user_agent !== userAgent

    if (ipMismatch || uaMismatch) {
      // Log the mismatch for security review
      auditAdminAction({
        adminId: session.admin_id,
        action: 'impersonation_binding_mismatch',
        projectId: session.project_id,
        resourceType: 'impersonation',
        resourceId: session.id,
        metadata: {
          ipMismatch,
          uaMismatch,
          originalIp: session.bound_ip,
          currentIp: clientIp,
        },
        ipAddress: clientIp,
        userAgent,
      })
    }

    return {
      id: session.id,
      adminId: session.admin_id,
      projectId: session.project_id,
      ownerId: session.owner_id,
      projectSlug: session.project_slug,
      projectName: session.project_name,
      ownerEmail: session.owner_email,
      status: session.status,
      allowedRoutes: session.allowed_routes,
      createdAt: session.created_at,
      confirmedAt: session.confirmed_at,
      expiresAt: session.expires_at,
      boundIp: session.bound_ip,
      boundUserAgent: session.bound_user_agent,
    }
  }

  /**
   * Check if a route is allowed for impersonation
   */
  isRouteAllowed(method: string, path: string, allowedRoutes: string[]): boolean {
    const normalizedPath = path.split('?')[0]! // Remove query string (split always returns at least one element)

    for (const allowedRoute of allowedRoutes) {
      const parts = allowedRoute.split(' ')
      const allowedMethod = parts[0]
      const allowedPattern = parts[1]

      if (!allowedMethod || !allowedPattern) continue
      if (method.toUpperCase() !== allowedMethod) continue

      // Convert route pattern to regex
      const regexPattern = allowedPattern
        .replace(/:[a-zA-Z]+/g, '[^/]+') // :param -> any segment
        .replace(/\//g, '\\/') // escape slashes

      const regex = new RegExp(`^${regexPattern}$`)
      if (regex.test(normalizedPath)) {
        return true
      }
    }

    return false
  }

  /**
   * Check if content type is blocked during impersonation
   */
  isContentTypeBlocked(contentType: string): boolean {
    return BLOCKED_CONTENT_TYPES.some(blocked =>
      contentType.toLowerCase().includes(blocked.toLowerCase())
    )
  }

  /**
   * Redact sensitive fields from JSON response
   * @param obj The object to redact
   * @param depth Current recursion depth (internal)
   * @param maxDepth Maximum depth to recurse (default 20)
   */
  redactSensitiveFields(obj: unknown, depth = 0, maxDepth = 20): unknown {
    if (obj === null || obj === undefined) return obj
    if (typeof obj !== 'object') return obj

    // Prevent DoS via deeply nested objects
    if (depth >= maxDepth) {
      return '[MAX_DEPTH_EXCEEDED]'
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactSensitiveFields(item, depth + 1, maxDepth))
    }

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_JSON_FIELDS.test(key)) {
        result[key] = '[REDACTED]'
      } else if (typeof value === 'object') {
        result[key] = this.redactSensitiveFields(value, depth + 1, maxDepth)
      } else {
        result[key] = value
      }
    }
    return result
  }

  /**
   * Get active session for admin
   */
  async getActiveSession(adminId: string): Promise<ActiveSession> {
    const result = await this.pool.query(`
      SELECT s.*, p.name as project_name
      FROM inhouse_impersonation_sessions s
      JOIN projects p ON p.id = s.project_id
      WHERE s.admin_id = $1
        AND s.status = 'active'
        AND s.expires_at > NOW()
    `, [adminId])

    if (result.rows.length === 0) {
      return { active: false }
    }

    const session = result.rows[0]
    const expiresAt = new Date(session.expires_at)
    const remainingSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000)

    return {
      active: true,
      projectId: session.project_id,
      projectName: session.project_name,
      expiresAt: session.expires_at,
      remainingSeconds,
      allowedRoutes: session.allowed_routes,
    }
  }

  /**
   * End impersonation session early
   */
  async endSession(
    adminId: string,
    clientIp: string,
    userAgent: string
  ): Promise<void> {
    const result = await this.pool.query(`
      UPDATE inhouse_impersonation_sessions
      SET status = 'ended',
          ended_at = NOW(),
          end_reason = 'manual'
      WHERE admin_id = $1
        AND status = 'active'
      RETURNING id, project_id
    `, [adminId])

    if (result.rows.length > 0) {
      const session = result.rows[0]

      // Audit log
      auditAdminAction({
        adminId,
        action: 'impersonation_ended',
        projectId: session.project_id,
        resourceType: 'impersonation',
        resourceId: session.id,
        metadata: { endReason: 'manual' },
        ipAddress: clientIp,
        userAgent,
      })

      // TODO: Send Slack/webhook notification
      // this.sendNotification('impersonation_ended', session)
    }
  }

  /**
   * Log proxied request during impersonation
   */
  async logProxiedRequest(
    sessionId: string,
    adminId: string,
    projectId: string,
    method: string,
    path: string,
    statusCode: number,
    clientIp: string
  ): Promise<void> {
    auditAdminAction({
      adminId,
      action: 'impersonation_proxy',
      projectId,
      resourceType: 'impersonation',
      resourceId: sessionId,
      metadata: { method, path, statusCode },
      ipAddress: clientIp,
    })
  }
}

// Singleton instance
let instance: ImpersonationService | null = null

export function getImpersonationService(): ImpersonationService {
  if (!instance) {
    instance = new ImpersonationService()
  }
  return instance
}
