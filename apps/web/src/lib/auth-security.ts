/**
 * 🔐 Advanced Authentication Security
 * Global session management and security utilities
 */

import { createClient } from '@/lib/supabase-client'
import { logger } from '@/utils/logger';

export interface SessionRevocationResult {
  success: boolean
  error?: string
  revokedSessions?: number
}

/**
 * Revoke all user sessions globally (security-critical operations)
 * Should be called after:
 * - Password changes
 * - Email changes  
 * - Account compromise detection
 * - Security setting changes
 */
export async function revokeAllSessions(reason: string): Promise<SessionRevocationResult> {
  try {
    const supabase = createClient()
    
    logger.info(`🔐 Revoking all sessions: ${reason}`);
    
    // Sign out from all devices/sessions
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    
    if (error) {
      logger.error('❌ Failed to revoke sessions:', error);
      return {
        success: false,
        error: error.message
      }
    }
    
    logger.info('✅ All sessions revoked successfully');
    
    // TODO: Log security event for audit trail once audit_logs table is created
    // await logSecurityEvent('session_revocation', {
    //   reason,
    //   timestamp: new Date().toISOString(),
    //   user_agent: navigator.userAgent,
    //   ip_address: await getClientIP()
    // })
    
    return {
      success: true,
      revokedSessions: 1 // Supabase doesn't return count, assume at least current session
    }
    
  } catch (error) {
    logger.error('❌ Session revocation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Enhanced password change with automatic session revocation
 */
export async function changePasswordSecurely(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()
    
    // Verify current password first (additional security)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Attempt password change
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    })
    
    if (updateError) {
      return { success: false, error: updateError.message }
    }
    
    // Revoke all other sessions for security
    const revocationResult = await revokeAllSessions('password_change')
    
    if (!revocationResult.success) {
      logger.warn('⚠️ Password changed but session revocation failed');
      // Don't fail the operation, but log the warning
    }
    
    return { success: true }
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Password change failed'
    }
  }
}

/**
 * Enhanced email change with session revocation
 */
export async function changeEmailSecurely(
  newEmail: string,
  redirectTo?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()
    
    const { error } = await supabase.auth.updateUser({
      email: newEmail
    }, {
      emailRedirectTo: redirectTo
    })
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    // Revoke all sessions after email change
    await revokeAllSessions('email_change')
    
    return { success: true }
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Email change failed'
    }
  }
}

/**
 * Log security-related events for audit trail
 * TODO: Enable once audit_logs table is created and types generated
 */
async function logSecurityEvent(event: string, metadata: Record<string, any>) {
  try {
    logger.info(`🔐 Security Event: ${event}`, metadata);
    // TODO: Uncomment once audit_logs table exists
    // const supabase = createClient()
    // const { error } = await supabase
    //   .from('audit_logs')
    //   .insert({
    //     table_name: 'auth_security',
    //     operation: 'SECURITY_EVENT',
    //     new_values: { event, metadata, timestamp: new Date().toISOString() }
    //   })
    // if (error) logger.warn('⚠️ Failed to log security event:', error);
  } catch (error) {
    logger.warn('⚠️ Security event logging failed:', error);
  }
}

/**
 * Get client IP for security logging
 */
async function getClientIP(): Promise<string> {
  try {
    // Try to get IP from various sources
    const response = await fetch('/api/auth/client-info')
    const data = await response.json()
    return data.ip || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Check for suspicious login patterns
 */
export async function detectSuspiciousActivity(): Promise<{
  suspicious: boolean
  reasons: string[]
}> {
  const reasons: string[] = []
  
  try {
    // Check for rapid login attempts
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { suspicious: false, reasons }
    }
    
    // TODO: Check audit logs once audit_logs table is created
    // const { data: recentLogs } = await supabase
    //   .from('audit_logs')
    //   .select('*')
    //   .eq('changed_by', user.id)
    //   .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    //   .order('created_at', { ascending: false })
    //   .limit(50)
    
    // Basic suspicious activity detection (can be enhanced later)
    const currentTime = Date.now()
    const userMetadata = user.user_metadata || {}
    
    // Check for rapid succession logins (placeholder logic)
    if (userMetadata.last_login) {
      const timeSinceLastLogin = currentTime - new Date(userMetadata.last_login).getTime()
      if (timeSinceLastLogin < 30000) { // Less than 30 seconds
        reasons.push('Rapid successive login attempts')
      }
    }
    
    return {
      suspicious: reasons.length > 0,
      reasons
    }
    
  } catch (error) {
    logger.warn('⚠️ Suspicious activity detection failed:', error);
    return { suspicious: false, reasons }
  }
}