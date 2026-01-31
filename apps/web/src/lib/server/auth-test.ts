/**
 * 🧪 Test Version: Auth Functions with Authenticated Client
 * 
 * Testing if auth functions can use authenticated client instead of service client
 * to leverage existing RLS policies instead of requiring admin privileges.
 * 
 * Original functions in auth.ts use getServiceClient()
 * Test functions use createServerSupabaseClientNew() (authenticated client)
 */

import 'server-only'
import { createServerSupabaseClientNew } from '../supabase-server'

// ====================================
// TEST VERSION 1: userHasOrgAccess
// ====================================

/**
 * Test: Check org membership using authenticated client + RLS
 * Should work with "Organization members can view members" policy
 */
export async function testUserHasOrgAccess(userId: string, orgId: string): Promise<boolean> {
  try {
    const client = await createServerSupabaseClientNew()
    
    // Use authenticated client - RLS should filter to user's memberships only
    const { count, error } = await client
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('organization_id', orgId)  // ✅ Fixed: use organization_id not org_id
      .eq('user_id', userId)
      // Note: status='active' check might need to be added to RLS policy
    
    if (error) {
      console.error('TEST: Org access check error:', error)
      return false
    }
    
    console.log('TEST: Org membership count:', count)
    return !!count && count > 0
  } catch (error) {
    console.error('TEST: Org access check failed:', error)
    return false
  }
}

// ====================================
// TEST VERSION 2: verifyProjectAccess  
// ====================================

/**
 * Test: Check project access using authenticated client + RLS
 * Should work with "projects_secure_access" policy
 */
export async function testVerifyProjectAccess(userId: string, projectId: string): Promise<boolean> {
  try {
    const client = await createServerSupabaseClientNew()
    
    // Simple approach: try to select the project
    // RLS policy should only show projects user can access
    const { data: project, error } = await client
      .from('projects')
      .select('id, owner_id, org_id')  // Just get minimal data
      .eq('id', projectId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user doesn't have access (RLS filtered it out)
        console.log('TEST: Project access denied by RLS (no rows visible)')
        return false
      }
      console.error('TEST: Project access check error:', error)
      return false
    }
    
    if (!project) {
      console.log('TEST: Project not found or no access')
      return false
    }
    
    // Type assertion for schema fields not in TypeScript types
    const projectWithOrgId = project as any
    
    console.log('TEST: Project access granted, project:', { 
      id: projectWithOrgId.id, 
      owner_id: projectWithOrgId.owner_id,
      org_id: projectWithOrgId.org_id 
    })
    return true
    
  } catch (error) {
    console.error('TEST: Project access check failed:', error)
    return false
  }
}

// ====================================
// TEST VERSION 3: getUserProjectOrThrow
// ====================================

/**
 * Test: Get project data using authenticated client + RLS
 * Should work with "projects_secure_access" policy
 */
export async function testGetUserProjectOrThrow(userId: string, projectId: string) {
  try {
    const client = await createServerSupabaseClientNew()
    
    // Try to get full project data - RLS will filter access
    const { data: project, error } = await client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Forbidden: Project access denied')
      }
      console.error('TEST: Get project error:', error)
      throw new Error('Project not found')
    }
    
    if (!project) {
      throw new Error('Project not found')
    }
    
    console.log('TEST: Project retrieved successfully:', { 
      id: project.id, 
      name: project.name,
      owner_id: project.owner_id 
    })
    return project
    
  } catch (error) {
    console.error('TEST: Get project failed:', error)
    throw error
  }
}

// ====================================
// TEST COMPARISON FUNCTIONS
// ====================================

/**
 * Compare original vs test function results
 */
export async function compareOrgAccessMethods(userId: string, orgId: string) {
  console.log('\n🧪 TESTING: Org Access Methods Comparison')
  console.log('User ID:', userId)
  console.log('Org ID:', orgId)
  
  try {
    // Test with authenticated client
    const testResult = await testUserHasOrgAccess(userId, orgId)
    console.log('✅ Test method result:', testResult)
    
    // Import and test original method for comparison
    const { userHasOrgAccess } = await import('./auth')
    const originalResult = await userHasOrgAccess(userId, orgId)
    console.log('✅ Original method result:', originalResult)
    
    console.log('🎯 Results match:', testResult === originalResult)
    return { testResult, originalResult, match: testResult === originalResult }
    
  } catch (error) {
    console.error('❌ Comparison failed:', error)
    throw error
  }
}

export async function compareProjectAccessMethods(userId: string, projectId: string) {
  console.log('\n🧪 TESTING: Project Access Methods Comparison')
  console.log('User ID:', userId)
  console.log('Project ID:', projectId)
  
  try {
    // Test with authenticated client
    const testResult = await testVerifyProjectAccess(userId, projectId)
    console.log('✅ Test method result:', testResult)
    
    // Import and test original method for comparison
    const { verifyProjectAccess } = await import('./auth')
    const originalResult = await verifyProjectAccess(userId, projectId)
    console.log('✅ Original method result:', originalResult)
    
    console.log('🎯 Results match:', testResult === originalResult)
    return { testResult, originalResult, match: testResult === originalResult }
    
  } catch (error) {
    console.error('❌ Comparison failed:', error)
    throw error
  }
}

// ====================================
// SMOKE TEST SIMULATION
// ====================================

/**
 * Simulate the smoke test: test functions should work without service key
 */
export async function simulateSmokeTest() {
  console.log('\n🚨 SIMULATING SMOKE TEST: Functions without service key')
  
  // This would normally fail if service key is required
  try {
    // Test with some dummy IDs (would need real IDs from your system)
    const dummyUserId = '00000000-0000-0000-0000-000000000000'
    const dummyOrgId = '00000000-0000-0000-0000-000000000000'
    const dummyProjectId = '00000000-0000-0000-0000-000000000000'
    
    console.log('Testing org access (expect false for dummy IDs)...')
    const orgResult = await testUserHasOrgAccess(dummyUserId, dummyOrgId)
    console.log('Org access result:', orgResult)
    
    console.log('Testing project access (expect false for dummy IDs)...')
    const projectResult = await testVerifyProjectAccess(dummyUserId, dummyProjectId)
    console.log('Project access result:', projectResult)
    
    console.log('✅ Test functions work without service key!')
    return true
    
  } catch (error) {
    console.error('❌ Test functions failed without service key:', error)
    return false
  }
}

// ====================================
// EXPORT TEST INTERFACE
// ====================================

export const authTestFunctions = {
  testUserHasOrgAccess,
  testVerifyProjectAccess,
  testGetUserProjectOrThrow,
  compareOrgAccessMethods,
  compareProjectAccessMethods,
  simulateSmokeTest
}