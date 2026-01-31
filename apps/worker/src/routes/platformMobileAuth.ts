/**
 * Platform Mobile Auth Routes
 *
 * OTP-based authentication for the SheenApps mobile app.
 * Uses EXISTING Supabase auth.users - same users as web app.
 *
 * Flow:
 * 1. Mobile app → Next.js Gateway (/api/mobile/auth/*)
 * 2. Next.js Gateway (signs with HMAC) → Worker (/v1/platform/auth/*)
 * 3. Worker validates OTP against auth.users, creates mobile session
 *
 * IMPORTANT: This does NOT create new users. Users must already exist
 * in auth.users (registered via web). Mobile is a companion app.
 *
 * NOTE: "/v1/platform/" is for SheenApps platform auth (customers).
 *       "/v1/inhouse/" is for Easy Mode SDK auth (end users of customer apps).
 *
 * MIGRATED TO CONTRACT-FIRST: Uses defineRoute with @sheenapps/api-contracts
 */

import { FastifyInstance } from 'fastify';
import { randomBytes, createHash } from 'crypto';
import { getDatabase } from '../services/databaseWrapper';
import { validateAndNormalizeEmail } from '../utils/emailValidation';
import { allow } from '../utils/throttle';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { defineRoute, RouteErrors } from '../utils/defineRoute';
import {
  RequestCodeSchema,
  RequestCodeResponseSchema,
  VerifyCodeSchema,
  VerifyCodeResponseSchema,
  RefreshTokenSchema,
  RefreshTokenResponseSchema,
  LogoutSchema,
  LogoutResponseSchema,
} from '@sheenapps/api-contracts';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const OTP_REQUEST_LIMIT = 5; // Max 5 OTP requests per email per 10 min
const OTP_VERIFY_LIMIT = 10; // Max 10 OTP verify attempts per email per 10 min
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for mobile

// OTP generation
function generateOtp(): string {
  const buffer = randomBytes(4);
  const num = buffer.readUInt32BE(0);
  return String(100000 + (num % 900000));
}

// Hash OTP for storage (never store plaintext)
function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

// Generate session token
function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

// Generate refresh token
function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

// Hash token for storage
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Route contracts - let TypeScript infer the types from the schemas
const requestCodeContract = {
  request: RequestCodeSchema,
  response: RequestCodeResponseSchema,
} as const;

const verifyCodeContract = {
  request: VerifyCodeSchema,
  response: VerifyCodeResponseSchema,
} as const;

const refreshTokenContract = {
  request: RefreshTokenSchema,
  response: RefreshTokenResponseSchema,
} as const;

const logoutContract = {
  request: LogoutSchema,
  response: LogoutResponseSchema,
} as const;

export async function platformMobileAuthRoutes(app: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();

  /**
   * POST /v1/platform/auth/request-code
   *
   * Sends a 6-digit OTP code to the user's email.
   * User must already exist in auth.users (registered via web).
   */
  app.post(
    '/v1/platform/auth/request-code',
    { preHandler: hmacMiddleware as any },
    defineRoute(requestCodeContract, async (input, { request }) => {
      const { email, deviceId, platform } = input;

      // Validate and normalize email
      const emailValidation = validateAndNormalizeEmail(email);
      if (!emailValidation.valid) {
        RouteErrors.badRequest(emailValidation.error || 'Invalid email');
      }

      const normalizedEmail = emailValidation.normalized!;

      // Rate limiting
      const rateLimitKey = `mobile-otp-request:${normalizedEmail}:${request.ip}`;
      if (!allow(rateLimitKey, OTP_REQUEST_LIMIT, RATE_LIMIT_WINDOW_MS)) {
        RouteErrors.rateLimit('Too many OTP requests. Please try again later.');
      }

      const db = getDatabase();

      // Check if user exists in auth.users (Supabase Auth)
      const userResult = await db.query(
        `SELECT id, email FROM auth.users WHERE email = $1`,
        [normalizedEmail]
      );

      if (userResult.rows.length === 0) {
        // User doesn't exist - they need to register via web first
        // Return generic message to prevent email enumeration
        return {
          message: 'If this email is registered, you will receive a code.',
          expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        };
      }

      const userId = userResult.rows[0].id;

      // Generate OTP
      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const expiresAt = new Date(Date.now() + OTP_TTL_MS);

      // Store OTP in database
      await db.query(
        `INSERT INTO inhouse_mobile_otp (user_id, email, otp_hash, device_id, platform, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (email, device_id) DO UPDATE SET
           user_id = $1,
           otp_hash = $3,
           platform = $5,
           expires_at = $6,
           ip_address = $7,
           user_agent = $8,
           attempts = 0,
           consumed_at = NULL`,
        [
          userId,
          normalizedEmail,
          otpHash,
          deviceId,
          platform || 'mobile',
          expiresAt.toISOString(),
          request.ip,
          request.headers['user-agent'],
        ]
      );

      // TODO: Send OTP email via your email service
      // For now, log in development
      if (process.env.NODE_ENV === 'development') {
        request.log.info({ otp, email: normalizedEmail }, 'Mobile OTP generated (dev mode)');
      }

      return {
        message: 'If this email is registered, you will receive a code.',
        expiresAt: expiresAt.toISOString(),
        // Only return OTP in development for testing
        ...(process.env.NODE_ENV === 'development' && { otp }),
      };
    })
  );

  /**
   * POST /v1/platform/auth/verify-code
   *
   * Verifies OTP and creates a mobile session.
   * Returns access token, refresh token, and user info from auth.users.
   */
  app.post(
    '/v1/platform/auth/verify-code',
    { preHandler: hmacMiddleware as any },
    defineRoute(verifyCodeContract, async (input, { request }) => {
      const { email, code, deviceId, platform } = input;

      // Validate and normalize email
      const emailValidation = validateAndNormalizeEmail(email);
      if (!emailValidation.valid) {
        RouteErrors.badRequest(emailValidation.error || 'Invalid email');
      }

      const normalizedEmail = emailValidation.normalized!;
      const otpHash = hashOtp(code);

      // Rate limiting
      const rateLimitKey = `mobile-otp-verify:${normalizedEmail}:${request.ip}`;
      if (!allow(rateLimitKey, OTP_VERIFY_LIMIT, RATE_LIMIT_WINDOW_MS)) {
        RouteErrors.rateLimit('Too many verification attempts. Please try again later.');
      }

      const db = getDatabase();

      // Verify OTP
      const otpResult = await db.query(
        `SELECT id, user_id, otp_hash, expires_at, attempts
         FROM inhouse_mobile_otp
         WHERE email = $1 AND device_id = $2 AND consumed_at IS NULL
         LIMIT 1`,
        [normalizedEmail, deviceId]
      );

      if (otpResult.rows.length === 0) {
        RouteErrors.badRequest('Invalid or expired code');
      }

      const otpRecord = otpResult.rows[0];

      // Check expiry
      if (new Date(otpRecord.expires_at) < new Date()) {
        // Use a custom error for expired codes (410 Gone)
        const err: any = new Error('Code has expired');
        err.statusCode = 410;
        err.code = 'CODE_EXPIRED';
        throw err;
      }

      // Check attempts (max 5 failed attempts)
      if (otpRecord.attempts >= 5) {
        RouteErrors.rateLimit('Too many failed attempts');
      }

      // Verify OTP hash
      if (otpRecord.otp_hash !== otpHash) {
        // Increment attempts
        await db.query(
          `UPDATE inhouse_mobile_otp SET attempts = attempts + 1 WHERE id = $1`,
          [otpRecord.id]
        );
        RouteErrors.badRequest('Invalid code');
      }

      // Mark OTP as consumed
      await db.query(
        `UPDATE inhouse_mobile_otp SET consumed_at = NOW() WHERE id = $1`,
        [otpRecord.id]
      );

      const userId = otpRecord.user_id;

      // Get user from auth.users (Supabase Auth)
      const userResult = await db.query(
        `SELECT id, email, raw_user_meta_data, created_at
         FROM auth.users
         WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        RouteErrors.notFound('User not found');
      }

      const user = userResult.rows[0];
      const metadata = user.raw_user_meta_data || {};

      // Generate tokens
      const accessToken = generateSessionToken();
      const refreshToken = generateRefreshToken();
      const accessTokenHash = hashToken(accessToken);
      const refreshTokenHash = hashToken(refreshToken);
      const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

      // Create mobile session
      await db.query(
        `INSERT INTO inhouse_mobile_sessions
         (user_id, device_id, platform, access_token_hash, refresh_token_hash, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, device_id) DO UPDATE SET
           platform = $3,
           access_token_hash = $4,
           refresh_token_hash = $5,
           expires_at = $6,
           ip_address = $7,
           user_agent = $8,
           revoked_at = NULL,
           last_used_at = NOW()`,
        [
          userId,
          deviceId,
          platform || 'mobile',
          accessTokenHash,
          refreshTokenHash,
          sessionExpiresAt.toISOString(),
          request.ip,
          request.headers['user-agent'],
        ]
      );

      // Get user's projects (uses owner_id per CLAUDE.md)
      const projectsResult = await db.query(
        `SELECT id, name, subdomain
         FROM projects
         WHERE owner_id = $1
         ORDER BY updated_at DESC`,
        [userId]
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: metadata.display_name || metadata.full_name || null,
          avatarUrl: metadata.avatar_url || null,
          createdAt: user.created_at,
        },
        session: {
          accessToken,
          refreshToken,
          expiresAt: sessionExpiresAt.toISOString(),
        },
        projects: projectsResult.rows.map((p: any) => ({
          id: p.id,
          name: p.name,
          subdomain: p.subdomain,
        })),
      };
    })
  );

  /**
   * POST /v1/platform/auth/refresh
   *
   * Refreshes the access token using a valid refresh token.
   */
  app.post(
    '/v1/platform/auth/refresh',
    { preHandler: hmacMiddleware as any },
    defineRoute(refreshTokenContract, async (input, { request }) => {
      const { refreshToken, deviceId, platform } = input;

      const refreshTokenHash = hashToken(refreshToken);
      const db = getDatabase();

      // Find session by refresh token
      const sessionResult = await db.query(
        `SELECT s.id, s.user_id, s.device_id, s.expires_at
         FROM inhouse_mobile_sessions s
         WHERE s.refresh_token_hash = $1
           AND s.device_id = $2
           AND s.revoked_at IS NULL
         LIMIT 1`,
        [refreshTokenHash, deviceId]
      );

      if (sessionResult.rows.length === 0) {
        RouteErrors.unauthorized('Invalid refresh token');
      }

      const session = sessionResult.rows[0];

      // Check if refresh token has expired (90 days from session creation)
      const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
      const refreshExpiresAt = new Date(new Date(session.expires_at).getTime() + REFRESH_TOKEN_TTL_MS);
      if (refreshExpiresAt < new Date()) {
        await db.query(
          `UPDATE inhouse_mobile_sessions SET revoked_at = NOW() WHERE id = $1`,
          [session.id]
        );
        RouteErrors.forbidden('Session has expired');
      }

      // Get user from auth.users
      const userResult = await db.query(
        `SELECT id, email, raw_user_meta_data
         FROM auth.users
         WHERE id = $1`,
        [session.user_id]
      );

      if (userResult.rows.length === 0) {
        RouteErrors.unauthorized('User not found');
      }

      const user = userResult.rows[0];
      const metadata = user.raw_user_meta_data || {};

      // Generate new tokens
      const newAccessToken = generateSessionToken();
      const newRefreshToken = generateRefreshToken();
      const newAccessTokenHash = hashToken(newAccessToken);
      const newRefreshTokenHash = hashToken(newRefreshToken);
      const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

      // Update session with new tokens
      await db.query(
        `UPDATE inhouse_mobile_sessions
         SET access_token_hash = $1,
             refresh_token_hash = $2,
             expires_at = $3,
             last_used_at = NOW(),
             ip_address = $4,
             user_agent = $5,
             platform = COALESCE($6, platform)
         WHERE id = $7`,
        [
          newAccessTokenHash,
          newRefreshTokenHash,
          sessionExpiresAt.toISOString(),
          request.ip,
          request.headers['user-agent'],
          platform,
          session.id,
        ]
      );

      // Get user's projects
      const projectsResult = await db.query(
        `SELECT id, name, subdomain
         FROM projects
         WHERE owner_id = $1
         ORDER BY updated_at DESC`,
        [session.user_id]
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: metadata.display_name || metadata.full_name || null,
          avatarUrl: metadata.avatar_url || null,
        },
        session: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: sessionExpiresAt.toISOString(),
        },
        projects: projectsResult.rows.map((p: any) => ({
          id: p.id,
          name: p.name,
          subdomain: p.subdomain,
        })),
      };
    })
  );

  /**
   * POST /v1/platform/auth/logout
   *
   * Revokes the current mobile session.
   */
  app.post(
    '/v1/platform/auth/logout',
    { preHandler: hmacMiddleware as any },
    defineRoute(logoutContract, async (input) => {
      const { accessToken, deviceId } = input;

      const accessTokenHash = hashToken(accessToken);
      const db = getDatabase();

      await db.query(
        `UPDATE inhouse_mobile_sessions
         SET revoked_at = NOW()
         WHERE access_token_hash = $1 AND device_id = $2`,
        [accessTokenHash, deviceId]
      );

      return { success: true as const };
    })
  );
}
