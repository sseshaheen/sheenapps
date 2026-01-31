/**
 * In-House Auth Service
 *
 * MVP: Email/password + magic link for Easy Mode user apps.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDatabase } from '../database'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000
const SCRYPT_KEY_LEN = 64
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

export interface AuthUser {
  id: string
  projectId: string
  email: string
  emailVerified: boolean
  provider: string
  metadata: Record<string, any>
  createdAt: string
  lastSignIn?: string | null
}

export interface AuthSession {
  token: string
  expiresAt: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url')
  const hash = scryptSync(password, salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  }).toString('base64url')
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  const [, nStr, rStr, pStr, salt, hash] = parts
  const n = Number(nStr)
  const r = Number(rStr)
  const p = Number(pStr)

  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false
  }

  if (!salt || !hash) {
    return false
  }

  const derived = scryptSync(password, salt, SCRYPT_KEY_LEN, { N: n, r, p })
  const expected = Buffer.from(hash, 'base64url')
  if (expected.length !== derived.length) {
    return false
  }
  return timingSafeEqual(expected, derived)
}

function mapUser(row: any): AuthUser {
  return {
    id: row.id,
    projectId: row.project_id,
    email: row.email,
    emailVerified: row.email_verified,
    provider: row.provider || 'email',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    lastSignIn: row.last_sign_in || null
  }
}

export class InhouseAuthService {
  async signUp(params: {
    projectId: string
    email: string
    password: string
    metadata?: Record<string, any>
  }): Promise<{ user?: AuthUser; error?: string }> {
    const db = getDatabase()
    const email = normalizeEmail(params.email)

    const existing = await db.query(
      `SELECT id FROM public.inhouse_auth_users WHERE project_id = $1 AND email = $2 LIMIT 1`,
      [params.projectId, email]
    )

    if (existing.rows.length > 0) {
      return { error: 'EMAIL_IN_USE' }
    }

    const passwordHash = hashPassword(params.password)
    const result = await db.query(
      `
      INSERT INTO public.inhouse_auth_users (
        project_id, email, email_verified, password_hash, provider, metadata
      ) VALUES ($1, $2, false, $3, 'email', $4)
      RETURNING *
      `,
      [params.projectId, email, passwordHash, params.metadata || {}]
    )

    return { user: mapUser(result.rows[0]) }
  }

  async signIn(params: {
    projectId: string
    email: string
    password: string
    ipAddress?: string
    userAgent?: string
  }): Promise<{ user?: AuthUser; session?: AuthSession; error?: string }> {
    const db = getDatabase()
    const email = normalizeEmail(params.email)

    const result = await db.query(
      `SELECT * FROM public.inhouse_auth_users WHERE project_id = $1 AND email = $2 LIMIT 1`,
      [params.projectId, email]
    )

    if (result.rows.length === 0) {
      return { error: 'INVALID_CREDENTIALS' }
    }

    const userRow = result.rows[0]
    if (!userRow.password_hash || !verifyPassword(params.password, userRow.password_hash)) {
      return { error: 'INVALID_CREDENTIALS' }
    }

    await db.query(
      `UPDATE public.inhouse_auth_users SET last_sign_in = NOW() WHERE id = $1`,
      [userRow.id]
    )

    const session = await this.createSession({
      userId: userRow.id,
      projectId: params.projectId,
      ...(params.ipAddress && { ipAddress: params.ipAddress }),
      ...(params.userAgent && { userAgent: params.userAgent })
    })

    return { user: mapUser(userRow), session }
  }

  async createSession(params: {
    userId: string
    projectId: string
    ipAddress?: string
    userAgent?: string
  }): Promise<AuthSession> {
    const db = getDatabase()
    const token = randomBytes(32).toString('base64url')
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

    await db.query(
      `
      INSERT INTO public.inhouse_auth_sessions (
        user_id, project_id, token_hash, expires_at, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [params.userId, params.projectId, tokenHash, expiresAt, params.ipAddress || null, params.userAgent || null]
    )

    return { token, expiresAt }
  }

  async getSessionUser(params: {
    projectId: string
    token: string
  }): Promise<{ user?: AuthUser; error?: string }> {
    const db = getDatabase()
    const tokenHash = hashToken(params.token)

    const result = await db.query(
      `
      SELECT u.*, s.expires_at, s.revoked_at
      FROM public.inhouse_auth_sessions s
      JOIN public.inhouse_auth_users u ON u.id = s.user_id
      WHERE s.project_id = $1 AND s.token_hash = $2
      LIMIT 1
      `,
      [params.projectId, tokenHash]
    )

    if (result.rows.length === 0) {
      return { error: 'SESSION_NOT_FOUND' }
    }

    const row = result.rows[0]
    if (row.revoked_at || new Date(row.expires_at) < new Date()) {
      return { error: 'SESSION_EXPIRED' }
    }

    await db.query(
      `UPDATE public.inhouse_auth_sessions SET last_used_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    )

    return { user: mapUser(row) }
  }

  async signOut(params: { projectId: string; token: string }): Promise<{ success: boolean }> {
    const db = getDatabase()
    const tokenHash = hashToken(params.token)
    await db.query(
      `
      UPDATE public.inhouse_auth_sessions
      SET revoked_at = NOW()
      WHERE project_id = $1 AND token_hash = $2
      `,
      [params.projectId, tokenHash]
    )
    return { success: true }
  }

  async createMagicLink(params: {
    projectId: string
    email: string
    ipAddress?: string
    userAgent?: string
  }): Promise<{ token?: string; expiresAt?: string; error?: string }> {
    const db = getDatabase()
    const email = normalizeEmail(params.email)

    const userResult = await db.query(
      `SELECT id FROM public.inhouse_auth_users WHERE project_id = $1 AND email = $2 LIMIT 1`,
      [params.projectId, email]
    )

    let userId: string | null = null
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id
    } else {
      const created = await db.query(
        `
        INSERT INTO public.inhouse_auth_users (
          project_id, email, email_verified, provider, metadata
        ) VALUES ($1, $2, false, 'magic_link', '{}'::jsonb)
        RETURNING id
        `,
        [params.projectId, email]
      )
      userId = created.rows[0].id
    }

    const token = randomBytes(32).toString('base64url')
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString()

    await db.query(
      `
      INSERT INTO public.inhouse_auth_magic_links (
        project_id, user_id, email, token_hash, expires_at, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [params.projectId, userId, email, tokenHash, expiresAt, params.ipAddress || null, params.userAgent || null]
    )

    return { token, expiresAt }
  }

  async verifyMagicLink(params: {
    projectId: string
    token: string
    ipAddress?: string
    userAgent?: string
  }): Promise<{ user?: AuthUser; session?: AuthSession; error?: string }> {
    const db = getDatabase()
    const tokenHash = hashToken(params.token)

    const result = await db.query(
      `
      SELECT ml.id as magic_id, ml.expires_at, ml.consumed_at, ml.user_id, u.*
      FROM public.inhouse_auth_magic_links ml
      JOIN public.inhouse_auth_users u ON u.id = ml.user_id
      WHERE ml.project_id = $1 AND ml.token_hash = $2
      LIMIT 1
      `,
      [params.projectId, tokenHash]
    )

    if (result.rows.length === 0) {
      return { error: 'MAGIC_LINK_INVALID' }
    }

    const row = result.rows[0]
    if (row.consumed_at || new Date(row.expires_at) < new Date()) {
      return { error: 'MAGIC_LINK_EXPIRED' }
    }

    await db.query(
      `UPDATE public.inhouse_auth_magic_links SET consumed_at = NOW() WHERE id = $1`,
      [row.magic_id]
    )
    await db.query(
      `UPDATE public.inhouse_auth_users SET email_verified = true, last_sign_in = NOW() WHERE id = $1`,
      [row.user_id]
    )

    const session = await this.createSession({
      userId: row.user_id,
      projectId: params.projectId,
      ...(params.ipAddress && { ipAddress: params.ipAddress }),
      ...(params.userAgent && { userAgent: params.userAgent })
    })

    return { user: mapUser(row), session }
  }
}
