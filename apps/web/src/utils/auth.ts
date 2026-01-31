/**
 * Auth utilities for Worker API integration
 * Handles user authentication state and security checks
 */

import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { FEATURE_FLAGS } from '@/lib/feature-flags';

/**
 * Get current authenticated user ID (server-side)
 * Uses server-side Supabase client to validate auth token
 * @throws Error if user is not authenticated
 */
export async function getCurrentUserId(): Promise<string> {
  const supabase = await createServerSupabaseClientNew();
  
  // Use getUser() for server-side validation (validates token with Supabase)
  // This is more secure than getSession() which only reads cookies
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('User not authenticated');
  }
  
  return user.id;
}

/**
 * Get current authenticated user (server-side)
 * Returns full user object with metadata
 */
export async function getCurrentUser() {
  const supabase = await createServerSupabaseClientNew();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return null;
  }
  
  return user;
}

/**
 * Check if user is authenticated (server-side)
 * Returns boolean without throwing errors
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();
    return !!userId;
  } catch {
    return false;
  }
}

/**
 * Get user session for client-side operations
 * Only use for UI decisions, not for privileged operations
 */
export async function getUserSession() {
  if (FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
    // When server auth is enabled, session should be managed server-side
    return null;
  }
  
  // This is only for backward compatibility with client-side auth
  const { createClient } = await import('@/lib/supabase-client');
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  return session;
}

/**
 * Validate user has required permissions for operation
 * Can be extended for role-based access control
 */
export async function validateUserPermissions(
  requiredPermission?: 'read' | 'write' | 'admin'
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    
    // For now, all authenticated users have read/write permissions
    // Admin permission uses existing admin role system
    if (requiredPermission === 'admin') {
      // ✅ BACKEND CONFIRMED: Connect to existing admin system
      const { isAdmin } = await import('@/lib/admin-auth');
      const adminStatus = await isAdmin(userId);

      if (!adminStatus) {
        return { valid: false, error: 'Admin permissions required' };
      }
    }
    
    return { valid: true, userId };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Authentication failed' 
    };
  }
}

/**
 * Extract user ID from request headers (for API routes)
 * Used when user ID is passed via authorization headers
 */
export function extractUserIdFromHeaders(headers: Headers): string | null {
  // Check for user ID in various header formats
  const userId = headers.get('x-user-id') || 
                 headers.get('user-id') ||
                 headers.get('authorization')?.replace('Bearer ', '');
  
  return userId || null;
}