/**
 * Platform Mobile Auth Contracts
 *
 * OTP-based authentication for the SheenApps mobile app.
 * These schemas define the request/response shapes for /v1/platform/auth/* endpoints.
 */

import { z } from 'zod'

// ============================================================================
// Common Types
// ============================================================================

export const PlatformSchema = z.enum(['ios', 'android', 'mobile'])
export type Platform = z.infer<typeof PlatformSchema>

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string().datetime().optional(),
})
export type User = z.infer<typeof UserSchema>

export const ProjectSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  subdomain: z.string(),
})
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>

export const SessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().datetime(),
})
export type Session = z.infer<typeof SessionSchema>

// ============================================================================
// POST /v1/platform/auth/request-code
// ============================================================================

export const RequestCodeSchema = z.object({
  email: z.string().email(),
  deviceId: z.string().min(1),
  platform: PlatformSchema,
})
export type RequestCodeRequest = z.infer<typeof RequestCodeSchema>

export const RequestCodeResponseSchema = z.object({
  message: z.string(),
  expiresAt: z.string().datetime(),
  // Only in development
  otp: z.string().length(6).optional(),
})
export type RequestCodeResponse = z.infer<typeof RequestCodeResponseSchema>

// ============================================================================
// POST /v1/platform/auth/verify-code
// ============================================================================

export const VerifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  deviceId: z.string().min(1),
  platform: PlatformSchema,
})
export type VerifyCodeRequest = z.infer<typeof VerifyCodeSchema>

export const VerifyCodeResponseSchema = z.object({
  user: UserSchema,
  session: SessionSchema,
  projects: z.array(ProjectSummarySchema),
})
export type VerifyCodeResponse = z.infer<typeof VerifyCodeResponseSchema>

// ============================================================================
// POST /v1/platform/auth/refresh
// ============================================================================

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().min(1),
  platform: PlatformSchema,
})
export type RefreshTokenRequest = z.infer<typeof RefreshTokenSchema>

export const RefreshTokenResponseSchema = z.object({
  user: UserSchema.omit({ createdAt: true }),
  session: SessionSchema,
  projects: z.array(ProjectSummarySchema),
})
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>

// ============================================================================
// POST /v1/platform/auth/logout
// ============================================================================

export const LogoutSchema = z.object({
  accessToken: z.string().min(1),
  deviceId: z.string().min(1),
})
export type LogoutRequest = z.infer<typeof LogoutSchema>

export const LogoutResponseSchema = z.object({
  success: z.literal(true),
})
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>
