/**
 * Admin Management API Client
 * Handles all admin user management operations
 */

import { AdminAuthService } from './admin-auth-service'

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL || 'http://localhost:8081'

export interface CreateAdminRequest {
  email: string
  password: string
  role: 'admin' | 'super_admin'
  permissions?: string[]
  display_name?: string
}

export interface CreateAdminResponse {
  success: boolean
  message: string
  user: {
    id: string
    email: string
    role: 'admin' | 'super_admin'
    permissions: string[]
    temporary_password: string
    created_by: string
    created_at: string
  }
  instructions: string
}

export interface AdminUser {
  id: string
  email: string
  role: 'admin' | 'super_admin'
  permissions: string[]
  created_at: string
  created_by: string
  display_name?: string
}

export interface ListAdminsResponse {
  success: boolean
  admins: AdminUser[]
  total: number
}

export interface AdminError {
  error: string
  code: string
  message?: string
  required_role?: string
  current_role?: string
}

export class AdminManagementClient {
  /**
   * Create a new admin user (super_admin only)
   */
  static async createAdminUser(
    data: CreateAdminRequest,
    reason: string
  ): Promise<CreateAdminResponse> {
    // Check permission client-side first
    const canCreate = await AdminAuthService.canCreateAdmins()
    if (!canCreate) {
      throw new Error('Only super admins can create admin users')
    }

    const headers = await AdminAuthService.getAuthHeaders(reason)
    
    const response = await fetch(`${WORKER_BASE_URL}/v1/admin/management/users/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error: AdminError = await response.json()
      throw new Error(error.error || error.message || 'Failed to create admin user')
    }

    return response.json()
  }

  /**
   * List all admin users
   */
  static async listAdmins(reason: string): Promise<ListAdminsResponse> {
    // Check permission client-side first
    const canView = await AdminAuthService.canViewAdminList()
    if (!canView) {
      throw new Error('You do not have permission to view admin users')
    }

    const headers = await AdminAuthService.getAuthHeaders(reason)
    
    const response = await fetch(`${WORKER_BASE_URL}/v1/admin/management/users`, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      const error: AdminError = await response.json()
      throw new Error(error.error || error.message || 'Failed to fetch admin users')
    }

    return response.json()
  }

  /**
   * Revoke admin privileges (super_admin only)
   */
  static async revokeAdminPrivileges(
    userId: string,
    reason: string
  ): Promise<{ success: boolean; message: string }> {
    // Check permission client-side first
    const canRevoke = await AdminAuthService.canRevokeAdmins()
    if (!canRevoke) {
      throw new Error('Only super admins can revoke admin privileges')
    }

    const headers = await AdminAuthService.getAuthHeaders(reason)
    
    const response = await fetch(`${WORKER_BASE_URL}/v1/admin/management/users/${userId}`, {
      method: 'DELETE',
      headers,
    })

    if (!response.ok) {
      const error: AdminError = await response.json()
      
      // Handle specific error codes
      if (error.code === 'INSUFFICIENT_PRIVILEGES') {
        throw new Error(`Insufficient privileges: ${error.required_role} role required`)
      }
      
      throw new Error(error.error || error.message || 'Failed to revoke admin privileges')
    }

    return response.json()
  }

  /**
   * Handle admin action with error recovery
   */
  static async handleAdminAction<T>(
    action: () => Promise<T>,
    options?: {
      onAuthError?: () => void
      onPermissionError?: () => void
      onReasonRequired?: () => Promise<string | null>
    }
  ): Promise<T> {
    try {
      return await action()
    } catch (error: any) {
      // Handle authentication errors
      if (error.message?.includes('authentication required')) {
        options?.onAuthError?.()
        throw error
      }

      // Handle permission errors
      if (error.message?.includes('permission') || error.message?.includes('privileges')) {
        options?.onPermissionError?.()
        throw error
      }

      // Handle missing reason header
      if (error.message?.includes('x-admin-reason')) {
        if (options?.onReasonRequired) {
          const reason = await options.onReasonRequired()
          if (reason) {
            // Retry with reason
            return action()
          }
        }
      }

      throw error
    }
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long')
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number')
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }
}