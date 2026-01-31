/**
 * 🔄 RLS Authentication Functions  
 * 
 * Phase 2 Implementation: Authenticated Client + RLS Pattern
 * Expert v4 validated approach using DbCtx pattern
 * 
 * MIGRATION APPROACH:
 * - Create new functions alongside existing ones
 * - Test thoroughly with real user sessions
 * - Replace original functions once validated
 * - Remove service client dependencies
 */

import 'server-only'
import type { DbCtx } from '@/lib/db'
import { makeUserCtx, validateWebContext, describeContext } from '@/lib/db'

// ====================================
// RLS-BASED AUTH FUNCTIONS
// ====================================

/**
 * Check if user has access to an organization (RLS version)
 * Uses authenticated client + RLS instead of service client
 */
export async function userHasOrgAccessRLS(ctx: DbCtx, orgId: string): Promise<boolean> {
  try {
    // Expert v4: Runtime safety check
    validateWebContext(ctx)
    
    console.log(`🔍 Checking org access with ${describeContext(ctx)}`)
    
    // Expert v4: Use head + count pattern (no .single() conflict)  
    const { count, error } = await (ctx.client as any)
      .from('organization_members')
      .select('user_id', { head: true, count: 'exact' })  // Fixed: head first, count second
      .eq('organization_id', orgId)  // Fixed: Use correct column name
      .eq('status', 'active')
    
    if (error) {
      console.debug('Org membership check error:', {
        code: error.code,
        message: error.message,
        mode: ctx.mode,
        orgId
      })
      return false  // Error means no access
    }
    
    const hasAccess = (count ?? 0) > 0
    console.log(`✅ Org access result: ${hasAccess} (count: ${count})`)
    
    return hasAccess  // RLS filtered to user's memberships only
  } catch (error) {
    console.error('Org access check failed:', error)
    return false
  }
}

/**
 * Get organization for user (Direct fetch pattern - Expert v4 preferred)
 * Returns organization if user has access, null if not visible via RLS
 */
export async function getOrganizationForUser(ctx: DbCtx, orgId: string): Promise<any | null> {
  try {
    validateWebContext(ctx)
    
    console.log(`🔍 Fetching organization with ${describeContext(ctx)}`)
    
    // Expert v4: Use .maybeSingle() to avoid exceptions
    const { data: organization, error } = await ctx.client
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle()  // Returns null without exception
    
    if (error) {
      console.debug('Organization fetch error:', {
        code: error.code,
        message: error.message,
        mode: ctx.mode,
        orgId
      })
      throw error  // Genuine database/network error
    }
    
    console.log(`✅ Organization result: ${organization ? 'found' : 'not visible'}`)
    
    return organization  // null = not found or not visible (RLS filtered)
  } catch (error) {
    console.error('Organization fetch failed:', error)
    throw error
  }
}

/**
 * Verify project access (RLS version)  
 * Uses authenticated client + RLS instead of service client
 */
export async function verifyProjectAccessRLS(ctx: DbCtx, projectId: string): Promise<boolean> {
  try {
    validateWebContext(ctx)
    
    console.log(`🔍 Checking project access with ${describeContext(ctx)}`)
    
    // Expert v4: Direct project fetch - if we can see it via RLS, we have access
    const { data: project, error } = await ctx.client
      .from('projects')
      .select('id')  // Minimal select for existence check
      .eq('id', projectId)
      .maybeSingle()  // Returns null without exception
    
    if (error) {
      console.debug('Project access check error:', {
        code: error.code,
        message: error.message,
        mode: ctx.mode,
        projectId
      })
      return false  // Error means no access
    }
    
    const hasAccess = !!project
    console.log(`✅ Project access result: ${hasAccess}`)
    
    return hasAccess  // If we can see it, we have access
  } catch (error) {
    console.error('Project access verification failed:', error)
    return false
  }
}

/**
 * Get project with access validation (RLS version)
 * Expert v4: Direct fetch pattern - combines access check + data retrieval
 */
export async function getProjectForUser(ctx: DbCtx, projectId: string): Promise<any | null> {
  try {
    validateWebContext(ctx)
    
    console.log(`🔍 Fetching project with ${describeContext(ctx)}`)
    
    const { data: project, error } = await ctx.client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle()  // Expert v4: Returns null without exception
    
    if (error) {
      console.debug('Project fetch error:', {
        code: error.code,
        message: error.message,
        mode: ctx.mode,
        projectId
      })
      throw error  // Genuine database/network error
    }
    
    console.log(`✅ Project result: ${project ? 'found' : 'not visible'}`)
    
    return project  // null = not found or not visible (404 by design)
  } catch (error) {
    console.error('Project fetch failed:', error)
    throw error
  }
}

// ====================================
// CONVENIENCE WRAPPERS
// ====================================

/**
 * Check org access with automatic user context creation
 * Convenience wrapper for common usage pattern
 */
export async function checkUserOrgAccess(orgId: string): Promise<boolean> {
  const userCtx = await makeUserCtx()
  return await userHasOrgAccessRLS(userCtx, orgId)
}

/**
 * Check project access with automatic user context creation
 * Convenience wrapper for common usage pattern  
 */
export async function checkUserProjectAccess(projectId: string): Promise<boolean> {
  const userCtx = await makeUserCtx()
  return await verifyProjectAccessRLS(userCtx, projectId)
}

// ====================================
// EXPERT IMPLEMENTATION NOTES
// ====================================

/*
EXPERT v4 PATTERNS IMPLEMENTED:

✅ EXPLICIT DbCtx:
- All functions take ctx parameter with explicit mode
- Runtime validation prevents admin mode in web context
- Clear logging shows which mode is being used

✅ RLS RELIANCE:
- No manual access checking logic
- Let database policies filter results
- "If you can see it, you have access" pattern

✅ ERROR HANDLING:
- 404 for "not found or not visible" (RLS invisibility)
- Throw only for genuine database/network errors
- Structured debug logging for troubleshooting

✅ QUERY PATTERNS:
- .maybeSingle() to avoid exceptions on missing rows
- head: true, count: 'exact' for existence checks  
- Minimal selects for performance

MIGRATION TESTING:
1. Create test API endpoints using these functions
2. Compare results with original service client versions
3. Test with real authenticated user sessions
4. Verify RLS policies work as expected
5. Replace original functions once validated
*/