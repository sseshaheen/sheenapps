/**
 * Admin Management API Client (Browser-Safe)
 * Client-side version without server-only imports
 */

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