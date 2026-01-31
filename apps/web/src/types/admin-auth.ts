/**
 * Admin Authentication Types
 * For the dedicated admin login system
 */

export interface AdminLoginRequest {
  email: string
  password: string
}

export interface AdminLoginResponse {
  success: boolean
  admin_jwt: string
  expires_at: string
  expires_in: number
  session_id: string
  permissions: string[]
  user: {
    id: string
    email: string
    role: string
  }
  correlationId: string
}

export interface AdminSession {
  token: string
  expiresAt: Date
  sessionId: string
  user: {
    id: string
    email: string
    role: string
  }
  permissions: string[]
  // Computed properties for backward compatibility
  isValid: boolean
  adminId: string
  email: string
  role: string
}

export interface AdminAuthError {
  error: string
  message: string
  correlationId?: string
}