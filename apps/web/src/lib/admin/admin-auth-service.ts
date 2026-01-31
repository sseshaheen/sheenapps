/**
 * Admin Authentication Service
 * Handles admin JWT authentication and session management
 */

import { cookies } from 'next/headers'
import type { AdminLoginRequest, AdminLoginResponse, AdminSession } from '@/types/admin-auth'

const ADMIN_TOKEN_COOKIE = 'admin_jwt'
const ADMIN_SESSION_COOKIE = 'admin_session'
const WORKER_BASE_URL = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

// JWT refresh threshold - refresh when less than 2 minutes remaining
const JWT_REFRESH_THRESHOLD = 2 * 60 * 1000 // 2 minutes in milliseconds

export class AdminAuthService {
  /**
   * Login admin user and get JWT token
   */
  static async login(email: string, password: string): Promise<AdminLoginResponse> {
    const response = await fetch(`${WORKER_BASE_URL}/v1/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Admin login failed')
    }

    const data: AdminLoginResponse = await response.json()
    
    // Store the admin JWT in a secure httpOnly cookie
    await this.storeAdminSession(data)
    
    return data
  }

  /**
   * Store admin session in secure cookies
   */
  static async storeAdminSession(loginResponse: AdminLoginResponse) {
    const cookieStore = await cookies()
    
    // Store the JWT token
    cookieStore.set(ADMIN_TOKEN_COOKIE, loginResponse.admin_jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: loginResponse.expires_in, // Use the expiration from the response
    })
    
    // Store session metadata
    const sessionData: AdminSession = {
      token: loginResponse.admin_jwt,
      expiresAt: new Date(loginResponse.expires_at),
      sessionId: loginResponse.session_id,
      user: loginResponse.user,
      permissions: loginResponse.permissions,
      // Computed properties for backward compatibility
      isValid: true,
      adminId: loginResponse.user.id,
      email: loginResponse.user.email,
      role: loginResponse.user.role,
    }
    
    cookieStore.set(ADMIN_SESSION_COOKIE, JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: loginResponse.expires_in,
    })
  }

  /**
   * Get current admin session
   */
  static async getAdminSession(): Promise<AdminSession | null> {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)
    
    if (!sessionCookie?.value) {
      return null
    }
    
    try {
      const session: AdminSession = JSON.parse(sessionCookie.value)
      
      // Check if session is expired
      const isExpired = new Date(session.expiresAt) < new Date()
      if (isExpired) {
        await this.clearAdminSession()
        return null
      }
      
      // Ensure computed properties are set for backward compatibility
      session.isValid = !isExpired
      session.adminId = session.user?.id || session.adminId
      session.email = session.user?.email || session.email  
      session.role = session.user?.role || session.role
      
      return session
    } catch (error) {
      console.error('Failed to parse admin session:', error)
      return null
    }
  }

  /**
   * Get admin JWT token
   */
  static async getAdminToken(): Promise<string | null> {
    const cookieStore = await cookies()
    const tokenCookie = cookieStore.get(ADMIN_TOKEN_COOKIE)
    return tokenCookie?.value || null
  }

  /**
   * Check if admin is authenticated
   */
  static async isAdminAuthenticated(): Promise<boolean> {
    const session = await this.getAdminSession()
    return session !== null
  }

  /**
   * Check if admin has specific permission
   */
  static async hasPermission(permission: string): Promise<boolean> {
    const session = await this.getAdminSession()
    if (!session) return false
    
    // Check for wildcard permissions
    const permissionParts = permission.split(':')
    const wildcardPermission = `${permissionParts[0]}:*`
    
    return session.permissions.includes(permission) || 
           session.permissions.includes(wildcardPermission) ||
           session.permissions.includes('admin:*')
  }

  /**
   * Clear admin session (logout)
   */
  static async clearAdminSession() {
    const cookieStore = await cookies()
    cookieStore.delete(ADMIN_TOKEN_COOKIE)
    cookieStore.delete(ADMIN_SESSION_COOKIE)
  }

  /**
   * Refresh token if needed (called before API requests)
   */
  static async ensureValidToken(): Promise<string | null> {
    const session = await this.getAdminSession()
    if (!session) return null
    
    const now = new Date()
    const expiresAt = new Date(session.expiresAt)
    const timeUntilExpiry = expiresAt.getTime() - now.getTime()
    
    // If token expires in less than 2 minutes, we should refresh
    // But since the backend doesn't have a refresh endpoint yet,
    // we'll just return the current token
    if (timeUntilExpiry < JWT_REFRESH_THRESHOLD) {
      console.warn('Admin token expiring soon, please re-login')
      // TODO: Implement token refresh when backend supports it
      // For now, return null to force re-login
      if (timeUntilExpiry <= 0) {
        await this.clearAdminSession()
        return null
      }
    }
    
    return session.token
  }

  /**
   * Get authorization headers for admin API calls.
   * Note: Content-Type is NOT included here - set it per-request when sending JSON body.
   * This allows these headers to work correctly for GET requests, file uploads, etc.
   */
  static async getAuthHeaders(adminReason?: string): Promise<Record<string, string>> {
    const token = await this.ensureValidToken()
    if (!token) {
      throw new Error('Admin authentication required')
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
    }

    // Add admin reason header if provided (required for sensitive operations)
    if (adminReason) {
      headers['x-admin-reason'] = adminReason
    }

    return headers
  }

  /**
   * Check if user has specific role
   */
  static async hasRole(role: 'admin' | 'super_admin'): Promise<boolean> {
    const session = await this.getAdminSession()
    if (!session) return false
    
    return session.user.role === role || session.user.role === 'super_admin'
  }

  /**
   * Check if user can create admin users (super_admin only)
   */
  static async canCreateAdmins(): Promise<boolean> {
    return this.hasRole('super_admin')
  }

  /**
   * Check if user can revoke admin privileges (super_admin only)
   */
  static async canRevokeAdmins(): Promise<boolean> {
    return this.hasRole('super_admin')
  }

  /**
   * Check if user can view admin list
   */
  static async canViewAdminList(): Promise<boolean> {
    const session = await this.getAdminSession()
    if (!session) return false
    
    return ['admin', 'super_admin'].includes(session.user.role)
  }
}