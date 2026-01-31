/**
 * 🔐 Server-Side Auth Utilities
 * 
 * Phase 2.2: Separated Client Architecture
 * Expert-validated auth patterns with proper client separation
 * 
 * CRITICAL: Uses separated auth/database clients
 * - createServerSupabaseClientNew() for user sessions and auth operations
 * - getServiceClient() for user data queries (if needed)
 * 
 * Reference: SERVER_ONLY_SUPABASE_ARCHITECTURE_PLAN.md Phase 2.2
 */

import 'server-only'
import { cookies } from 'next/headers'
import { getServiceClient } from './supabase-clients'
import { createServerSupabaseClientNew } from '../supabase-server'
import type { User } from '@supabase/auth-js'

// 🔄 RLS Migration: Import new RLS-based auth functions
import { 
  userHasOrgAccessRLS, 
  verifyProjectAccessRLS,
  getProjectForUser,
  checkUserOrgAccess,
  checkUserProjectAccess 
} from './auth-rls'
import { makeUserCtx } from '@/lib/db'

// ====================================
// CORE AUTH FUNCTIONS
// ====================================

/**
 * Get current authenticated user from session
 * Uses auth client with proper cookie handling
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const authClient = await createServerSupabaseClientNew()
    
    const { data: { user }, error } = await authClient.auth.getUser()
    
    if (error) {
      console.error('Get user error:', error.message)
      return null
    }
    
    return user
  } catch (error) {
    console.error('Auth operation failed:', error)
    return null
  }
}

/**
 * Get current user or throw error (for protected routes)
 * Uses auth client with proper cookie handling
 */
export async function getCurrentUserOrThrow(): Promise<User> {
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('Unauthorized: No valid user session')
  }
  
  return user
}

/**
 * Get current user ID (convenience function)
 * Returns null if no valid session
 */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser()
  return user?.id || null
}

/**
 * Get current session information
 * Uses auth client with proper cookie handling
 */
export async function getCurrentSession() {
  try {
    const authClient = await createServerSupabaseClientNew()
    
    const { data: { session }, error } = await authClient.auth.getSession()
    
    if (error) {
      console.error('Get session error:', error.message)
      return null
    }
    
    return session
  } catch (error) {
    console.error('Session operation failed:', error)
    return null
  }
}

// ====================================
// USER VALIDATION FUNCTIONS
// ====================================

/**
 * Check if user has access to a specific resource
 * Generic function for ownership validation
 */
export async function validateUserAccess(
  userId: string, 
  resourceOwnerId: string,
  resourceName?: string
): Promise<void> {
  if (userId !== resourceOwnerId) {
    const resource = resourceName ? ` ${resourceName}` : ' resource'
    throw new Error(`Forbidden: Access denied to${resource}`)
  }
}

/**
 * Check if current user owns a resource
 * Combines auth check with ownership validation
 */
export async function validateCurrentUserAccess(
  resourceOwnerId: string,
  resourceName?: string
): Promise<User> {
  const user = await getCurrentUserOrThrow()
  await validateUserAccess(user.id, resourceOwnerId, resourceName)
  return user
}

// ====================================
// MULTI-TENANT ACCESS FUNCTIONS
// ====================================

/**
 * Check if user has access to an organization
 * 🔄 RLS MIGRATION: Now uses authenticated client with RLS policies
 */
export async function userHasOrgAccess(userId: string, orgId: string): Promise<boolean> {
  try {
    console.log('🔄 Using RLS-based userHasOrgAccess')
    const userCtx = await makeUserCtx()
    return await userHasOrgAccessRLS(userCtx, orgId)
  } catch (error) {
    console.error('RLS org access check failed:', error)
    return false
  }
}

/**
 * DEPRECATED: Old service client version (for reference)
 * @deprecated Use userHasOrgAccess() which now uses RLS
 */
async function userHasOrgAccessLegacy(userId: string, orgId: string): Promise<boolean> {
  try {
    const serviceClient = getServiceClient()
    
    // EXPERT OPTIMIZATION: Use count with head: true for existence check
    // FIXED: Use organization_id for organization_members table (not org_id)
    const { count, error } = await (serviceClient as any)
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .eq('status', 'active')
    
    if (error) {
      console.error('Org access check error:', error)
      return false
    }
    
    return !!count && count > 0
  } catch (error) {
    console.error('Org access check failed:', error)
    return false
  }
}

/**
 * Verify user can access a project (personal or org)
 * 🔄 RLS MIGRATION: Now uses authenticated client with RLS policies
 */
export async function verifyProjectAccess(userId: string, projectId: string): Promise<boolean> {
  try {
    console.log('🔄 Using RLS-based verifyProjectAccess')
    const userCtx = await makeUserCtx()
    return await verifyProjectAccessRLS(userCtx, projectId)
  } catch (error) {
    console.error('RLS project access verification failed:', error)
    return false
  }
}

/**
 * DEPRECATED: Old service client version (for reference)
 * @deprecated Use verifyProjectAccess() which now uses RLS
 */
async function verifyProjectAccessLegacy(userId: string, projectId: string): Promise<boolean> {
  try {
    const serviceClient = getServiceClient()
    
    // Get project ownership info
    // Note: TypeScript types are outdated - org_id exists in actual schema
    const { data: project, error } = await serviceClient
      .from('projects')
      .select('owner_id, org_id')
      .eq('id', projectId)
      .single()
    
    if (error || !project) {
      return false
    }
    
    // Type assertion for schema fields not in TypeScript types
    const projectWithOrgId = project as any
    
    // Personal project access
    if (projectWithOrgId.owner_id === userId) {
      return true
    }
    
    // Organization project access
    if (projectWithOrgId.org_id) {
      return await userHasOrgAccessLegacy(userId, projectWithOrgId.org_id)
    }
    
    return false
  } catch (error) {
    console.error('Project access verification failed:', error)
    return false
  }
}

/**
 * Get project with access validation
 * 🔄 RLS MIGRATION: Now uses authenticated client with RLS policies
 */
export async function getUserProjectOrThrow(userId: string, projectId: string) {
  try {
    console.log('🔄 Using RLS-based getUserProjectOrThrow')
    const userCtx = await makeUserCtx()
    
    // Expert v4 pattern: Direct fetch - if we can see it via RLS, we have access
    const project = await getProjectForUser(userCtx, projectId)
    
    if (!project) {
      throw new Error('Forbidden: Project access denied or not found')
    }
    
    return project
  } catch (error) {
    console.error('RLS getUserProjectOrThrow failed:', error)
    throw error
  }
}

/**
 * DEPRECATED: Old service client version (for reference)
 * @deprecated Use getUserProjectOrThrow() which now uses RLS
 */
async function getUserProjectOrThrowLegacy(userId: string, projectId: string) {
  const hasAccess = await verifyProjectAccessLegacy(userId, projectId)
  
  if (!hasAccess) {
    throw new Error('Forbidden: Project access denied')
  }
  
  const serviceClient = getServiceClient()
  const { data: project, error } = await serviceClient
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()
  
  if (error || !project) {
    throw new Error('Project not found')
  }
  
  return project
}

// ====================================
// AUTHORIZATION HELPERS
// ====================================

/**
 * Create an authorization context for a user
 * Useful for passing around user info and permissions
 */
export interface AuthContext {
  user: User
  userId: string
  isAuthenticated: true
}

/**
 * Create auth context from current session
 */
export async function createAuthContext(): Promise<AuthContext | null> {
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }
  
  return {
    user,
    userId: user.id,
    isAuthenticated: true as const
  }
}

/**
 * Create auth context or throw (for protected routes)
 */
export async function createAuthContextOrThrow(): Promise<AuthContext> {
  const context = await createAuthContext()
  
  if (!context) {
    throw new Error('Unauthorized: Authentication required')
  }
  
  return context
}

// ====================================
// EXPERT SECURITY NOTES
// ====================================

/*
SECURITY ARCHITECTURE NOTES:

1. ✅ CLIENT SEPARATION:
   - getCurrentUser(): Uses auth client for session management
   - verifyProjectAccess(): Uses service client for database queries
   - Clear separation of concerns

2. ✅ ERROR HANDLING:
   - Auth errors logged but don't expose sensitive info
   - Consistent error messages for unauthorized access
   - Graceful handling of missing sessions

3. ✅ MULTI-TENANT READY:
   - userHasOrgAccess(): Organization membership validation
   - verifyProjectAccess(): Personal + org project access
   - Easy to extend for role-based permissions

4. ✅ PERFORMANCE:
   - Minimal database queries for access checks
   - Single query for project + ownership info
   - Caching-friendly patterns

5. ✅ TYPE SAFETY:
   - Proper TypeScript interfaces
   - User type from Supabase auth
   - AuthContext for consistent user data

USAGE PATTERNS:

// ✅ Protected API routes
export async function GET() {
  const user = await getCurrentUserOrThrow()
  // ... rest of handler
}

// ✅ Resource access validation
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUserOrThrow()
  const project = await getUserProjectOrThrow(user.id, params.id)
  // ... rest of handler
}

// ✅ Multi-tenant access
export async function updateProject(userId: string, projectId: string, updates: any) {
  const hasAccess = await verifyProjectAccess(userId, projectId)
  if (!hasAccess) throw new Error('Access denied')
  // ... update logic
}
*/