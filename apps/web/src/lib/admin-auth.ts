import { createBrowserClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import type { User } from '@supabase/auth-js'

// Admin users - in production, store these in environment variables or database
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean)

// Expert's enhanced admin context interface
export interface AdminContext {
  user: User
  isAdmin: boolean
  adminRole: 'admin' | 'super_admin'
  permissions: AdminPermission[]
  correlationId: string
  reason?: string | null
}

// Expert's admin permission types
export type AdminPermission = 
  | 'admin.read' 
  | 'users.suspend' 
  | 'users.ban' 
  | 'advisors.approve' 
  | 'finance.refund' 
  | 'audit.view'
  | 'promotion:read'      // ✅ NEW: View promotions and analytics
  | 'promotion:write'     // ✅ NEW: Create/edit promotions 
  | 'promotion:*'         // ✅ NEW: Full promotion access
  | 'promotion:provider_config' // ✅ NEW: Configure providers (future)

// Expert's reason codes with categories
export const REASON_CODES = {
  trust: [
    { code: 'T01', label: 'Spam or promotional content' },
    { code: 'T02', label: 'Harassment or abusive behavior' },
    { code: 'T03', label: 'Fraud or chargeback risk' },
    { code: 'T04', label: 'Terms of service violation' },
    { code: 'T05', label: 'Multiple reports from users' }
  ],
  finance: [
    { code: 'F01', label: 'Duplicate charge or billing error' },
    { code: 'F02', label: 'Customer dissatisfaction' },
    { code: 'F03', label: 'Fraud reversal or chargeback' }
  ]
} as const

export async function isAdmin(userId: string): Promise<boolean> {
  try {
    // Check if service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Fallback: Use the server client to get user data
      const { createServerSupabaseClientReadOnly } = await import('@/lib/supabase-server')
      const supabase = await createServerSupabaseClientReadOnly()
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error || !user || user.id !== userId) {
        return false
      }
      
      // Check if user email is in admin list
      const isAdminUser = ADMIN_EMAILS.includes(user.email || '')
      
      // Alternatively, check user metadata for admin role
      const hasAdminRole = user.user_metadata?.role === 'admin'
      
      return isAdminUser || hasAdminRole
    }
    
    // Original implementation with service role key
    const supabase = createBrowserClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: user, error } = await supabase
      .auth.admin.getUserById(userId)

    if (error || !user) {
      return false
    }

    // Check if user email is in admin list
    const isAdminUser = ADMIN_EMAILS.includes(user.user.email || '')

    // Alternatively, check user metadata for admin role
    const hasAdminRole = user.user.user_metadata?.role === 'admin'

    return isAdminUser || hasAdminRole
  } catch (error) {
    logger.error('Failed to check admin status', error)
    return false
  }
}

// Expert's enhanced admin role detection
export async function getAdminRole(userId: string): Promise<'admin' | 'super_admin' | null> {
  try {
    // Check if service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Fallback: Use the server client to get user data
      const { createServerSupabaseClientReadOnly } = await import('@/lib/supabase-server')
      const supabase = await createServerSupabaseClientReadOnly()
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error || !user || user.id !== userId) {
        return null
      }
      
      // Check if user email is in admin list
      const isAdminUser = ADMIN_EMAILS.includes(user.email || '')
      const metadataRole = user.user_metadata?.role
      
      if (!isAdminUser && metadataRole !== 'admin' && metadataRole !== 'super_admin') {
        return null
      }
      
      // Super admin determination (for now, first admin email is super admin)
      const isSuperAdmin = ADMIN_EMAILS[0] === user.email || metadataRole === 'super_admin'
      
      return isSuperAdmin ? 'super_admin' : 'admin'
    }
    
    // Original implementation with service role key
    const supabase = createBrowserClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: user, error } = await supabase
      .auth.admin.getUserById(userId)

    if (error || !user) {
      return null
    }

    // Check if user email is in admin list
    const isAdminUser = ADMIN_EMAILS.includes(user.user.email || '')
    const metadataRole = user.user.user_metadata?.role

    if (!isAdminUser && metadataRole !== 'admin' && metadataRole !== 'super_admin') {
      return null
    }

    // Super admin determination (for now, first admin email is super admin)
    const isSuperAdmin = ADMIN_EMAILS[0] === user.user.email || metadataRole === 'super_admin'
    
    return isSuperAdmin ? 'super_admin' : 'admin'
  } catch (error) {
    logger.error('Failed to get admin role', error)
    return null
  }
}

// Expert's admin permissions mapping
export function getAdminPermissions(role: 'admin' | 'super_admin'): AdminPermission[] {
  const basePermissions: AdminPermission[] = [
    'admin.read', 
    'users.suspend', 
    'advisors.approve', 
    'audit.view',
    'promotion:read' // ✅ NEW: All admins can view promotions
  ]
  
  if (role === 'super_admin') {
    return [...basePermissions, 'users.ban', 'finance.refund', 'promotion:*']
  }
  
  // Regular admins get basic promotion permissions
  return [...basePermissions, 'promotion:write']
}

// Expert's PII sanitization utilities
export function sanitizeReason(reason: string | null): string | null {
  if (!reason) return null
  
  let clean = reason.length > 1000 ? reason.substring(0, 1000) + '...' : reason
  
  // Strip credit card numbers
  clean = clean.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]')
  // Strip API keys/tokens (32+ character alphanumeric strings)
  clean = clean.replace(/\b[a-zA-Z0-9]{32,}\b/g, '[TOKEN_REDACTED]')
  // Strip email addresses from reasons (privacy)
  clean = clean.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
  
  return clean
}

// Expert's sensitive operation detection
export function isMutatingOperation(url: string, method: string): boolean {
  if (method === 'GET') return false
  
  const sensitivePatterns = [
    '/refunds', '/payouts', '/chargebacks',  // Financial
    '/ban', '/suspend',                      // User actions  
    '/approve', '/reject'                    // Approvals
  ]
  
  return sensitivePatterns.some(pattern => url.includes(pattern))
}

// Expert's action taxonomy mapping
export function standardizeActionName(url: string, method: string): string {
  const actionMap: Record<string, string> = {
    'POST /api/admin/users/.*/suspend': 'user.suspend.temporary',
    'POST /api/admin/users/.*/ban': 'user.ban.permanent', 
    'POST /api/admin/refunds': 'refund.issue',
    'PUT /api/admin/advisors/.*/approve': 'advisor.approve',
    'POST /api/admin/tickets/.*/resolve': 'ticket.resolve',
    'GET /api/admin/dashboard': 'dashboard.view',
    'GET /api/admin/users': 'users.list',
    'GET /api/admin/audit': 'audit.view'
  }
  
  const key = `${method} ${url}`
  for (const [pattern, action] of Object.entries(actionMap)) {
    if (new RegExp(pattern).test(key)) return action
  }
  
  // Fallback to path-based naming  
  const segments = url.split('/').filter(Boolean)
  return `${segments.slice(-2).join('.')}.${method.toLowerCase()}`
}

// Expert's audit logging interface
export interface AdminAuditLog {
  adminUserId: string
  action: string
  reason?: string | null
  correlationId: string
  targetUserId?: string
  metadata?: Record<string, any>
  timestamp?: Date
}

// ✅ EXPERT VALIDATED: Enhanced audit logging with database storage
export async function logAdminAction(log: AdminAuditLog): Promise<void> {
  try {
    // ✅ EXPERT PATTERN: Server-side Supabase client for audit writes (already has 'server-only' directive)
    const { createServerSupabaseClientNew } = await import('@/lib/supabase-server')
    const supabase = await createServerSupabaseClientNew()

    // ✅ Connect to existing audit infrastructure
    const { error } = await supabase
      .from('security_audit_log') // ✅ Table exists (verified in migration schema)
      .insert({
        event_type: log.action,
        details: {
          ...log.metadata,
          adminUserId: log.adminUserId,
          targetUserId: log.targetUserId,
          correlationId: log.correlationId, // ✅ EXPERT: Include correlation ID in stored record
          requestId: log.metadata?.requestId || log.correlationId // ✅ EXPERT: x-request-id passthrough
        },
        severity: 'medium',
        user_id: log.adminUserId,
        created_at: log.timestamp || new Date().toISOString()
      })

    if (error) {
      logger.error('Failed to log admin action to database:', error)
      // ✅ Fallback to structured logging (existing pattern)
      logger.info('Admin action logged', {
        ...log,
        timestamp: log.timestamp || new Date(),
        reason: sanitizeReason(log.reason) // ✅ EXPERT: PII protection already implemented
      })
    } else {
      // ✅ Success: Log to both database and structured logging for redundancy
      logger.info('Admin action logged to database', {
        ...log,
        timestamp: log.timestamp || new Date(),
        reason: sanitizeReason(log.reason)
      })
    }

    // ✅ EXPERT SUGGESTION: Add lint rule to prevent PII in audit logs
    // TODO: Create ESLint rule to detect potential PII patterns in audit metadata
  } catch (error) {
    logger.error('Failed to log admin action', error)

    // ✅ Fallback to structured logging if database fails
    logger.info('Admin action logged (fallback)', {
      ...log,
      timestamp: log.timestamp || new Date(),
      reason: sanitizeReason(log.reason)
    })
  }
}

// Expert's enhanced requireAdmin with audit and correlation tracking
export function requireAdminWithAudit(
  handler: (request: NextRequest, context: AdminContext) => Promise<NextResponse>,
  options: { requireReason?: boolean; requiredPermissions?: AdminPermission[] } = {}
) {
  return async (request: NextRequest, context: any): Promise<NextResponse> => {
    try {
      const { user } = context

      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required', correlation_id: crypto.randomUUID() },
          { status: 401 }
        )
      }

      const adminRole = await getAdminRole(user.id)
      if (!adminRole) {
        const correlationId = crypto.randomUUID()
        logger.warn('Non-admin user attempted to access admin endpoint', {
          userId: user.id.slice(0, 8),
          correlationId
        })
        
        return NextResponse.json(
          { error: 'Admin access required', correlation_id: correlationId },
          { status: 403, headers: { 'X-Correlation-Id': correlationId } }
        )
      }

      // Expert's header standardization (canonical casing)
      const reason = request.headers.get('X-Admin-Reason')
      const correlationId = request.headers.get('X-Correlation-Id') || crypto.randomUUID()

      // Expert's smart reason enforcement
      const isSensitiveOp = options.requireReason || isMutatingOperation(request.url, request.method)
      if (isSensitiveOp && !reason) {
        return NextResponse.json(
          { 
            error: 'X-Admin-Reason header required for this operation', 
            correlation_id: correlationId,
            hint: 'Sensitive operations require a structured reason. Format: [CODE] details'
          },
          { status: 400, headers: { 'X-Correlation-Id': correlationId } }
        )
      }

      // Permission validation
      const userPermissions = getAdminPermissions(adminRole)
      if (options.requiredPermissions) {
        const hasPermissions = options.requiredPermissions.every(perm => 
          userPermissions.includes(perm)
        )
        if (!hasPermissions) {
          return NextResponse.json(
            { 
              error: 'Insufficient permissions',
              required: options.requiredPermissions,
              available: userPermissions,
              correlation_id: correlationId
            },
            { status: 403, headers: { 'X-Correlation-Id': correlationId } }
          )
        }
      }

      // Enhanced admin context
      const adminContext: AdminContext = {
        user,
        isAdmin: true,
        adminRole,
        permissions: userPermissions,
        correlationId,
        reason: sanitizeReason(reason)
      }

      try {
        const response = await handler(request, adminContext)
        
        // Expert's audit logging (only successful mutations)
        if (request.method !== 'GET' && response.status < 400) {
          await logAdminAction({
            adminUserId: user.id,
            action: standardizeActionName(request.url, request.method),
            reason: adminContext.reason,
            correlationId,
            metadata: {
              method: request.method,
              url: request.url,
              statusCode: response.status
            }
          })
        }
        
        // Expert's correlation ID propagation (header + body)
        const responseData = response.status !== 204 ? await response.json() : {}
        return NextResponse.json(
          { ...responseData, correlation_id: correlationId },
          { 
            status: response.status,
            headers: { 'X-Correlation-Id': correlationId }
          }
        )
      } catch (error) {
        // Expert's error envelope with correlation ID
        logger.error('Admin endpoint error', { error, correlationId })
        return NextResponse.json(
          { 
            error: error instanceof Error ? error.message : 'Internal server error',
            correlation_id: correlationId 
          },
          { status: 500, headers: { 'X-Correlation-Id': correlationId } }
        )
      }

    } catch (error) {
      const correlationId = crypto.randomUUID()
      logger.error('Admin middleware error', { error, correlationId })
      return NextResponse.json(
        { error: 'Internal server error', correlation_id: correlationId },
        { status: 500, headers: { 'X-Correlation-Id': correlationId } }
      )
    }
  }
}

// ✅ NEW: Specific permissions requirement for promotion endpoints
export async function requireAdminWithPermissions(
  request: NextRequest,
  requiredPermissions: AdminPermission[],
  action: string
): Promise<AdminContext> {
  // Get user from request (assuming middleware adds user)
  const user = (request as any).user
  
  if (!user) {
    throw new Error('Authentication required')
  }

  const adminRole = await getAdminRole(user.id)
  if (!adminRole) {
    const correlationId = crypto.randomUUID()
    logger.warn('Non-admin user attempted to access admin endpoint', {
      userId: user.id,
      email: user.email,
      correlationId
    })
    
    throw new Error('Admin access required')
  }

  // Check permissions  
  const userPermissions = getAdminPermissions(adminRole)
  const hasPermission = requiredPermissions.some(perm => 
    userPermissions.includes(perm) ||
    userPermissions.includes(perm.split(':')[0] + ':*' as AdminPermission)
  )
  
  if (!hasPermission) {
    throw new Error(`Insufficient permissions. Required: ${requiredPermissions.join(', ')}`)
  }
  
  const correlationId = request.headers.get('X-Correlation-Id') || crypto.randomUUID()
  const reason = request.headers.get('X-Admin-Reason')
  
  return {
    user,
    isAdmin: true,
    adminRole,
    permissions: userPermissions,
    correlationId,
    reason: sanitizeReason(reason)
  }
}

// Backward compatibility - existing requireAdmin function
export function requireAdmin(handler: (request: any, context: any) => Promise<any>) {
  return async (request: any, context: any) => {
    const { user } = context

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const adminStatus = await isAdmin(user.id)
    if (!adminStatus) {
      logger.warn('Non-admin user attempted to access admin endpoint', {
        userId: user.id,
        email: user.email
      })
      
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Add admin flag to context
    context.isAdmin = true
    
    return handler(request, context)
  }
}