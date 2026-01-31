/**
 * Admin Types
 * Client-safe type definitions for admin functionality
 * This file can be imported in both client and server components
 */

// Admin permission types
export type AdminPermission = 
  | 'admin.read' 
  | 'admin.approve'
  | 'admin.elevated'
  | 'users.read'
  | 'users.write'
  | 'users.suspend' 
  | 'users.ban' 
  | 'advisors.read'
  | 'advisors.approve' 
  | 'finance.read'
  | 'finance.refund' 
  | 'support.read'
  | 'support.write'
  | 'audit.read'
  | 'audit.view'
  | 'promotion:read'
  | 'promotion:write'
  | 'promotion:*'
  | 'promotion:provider_config'
  | 'pricing.read'
  | 'pricing.write'
  | 'violations.enforce'
  | 'trust_safety.read'
  | 'trust_safety.write'
  | 'analytics.read'

// Admin role types
export type AdminRole = 'admin' | 'super_admin'

// Admin session interface
export interface AdminSession {
  user: {
    id: string
    email: string
    role: AdminRole
  }
  permissions: AdminPermission[]
  expiresAt?: string
}

// Admin context interface (for server-side use)
export interface AdminContext {
  user: {
    id: string
    email: string
  }
  isAdmin: boolean
  adminRole: AdminRole
  permissions: AdminPermission[]
  correlationId: string
  reason?: string | null
}