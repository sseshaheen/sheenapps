/**
 * 🧪 Test RLS Migration Functions
 * 
 * Compare original service client functions with new RLS functions
 * Phase 2 validation before replacing original implementations
 */

import { NextRequest, NextResponse } from 'next/server'
import { makeUserCtx, makeAdminCtx, type DbCtx } from '@/lib/db'
import { userHasOrgAccess, verifyProjectAccess } from '@/lib/server/auth'
import { 
  userHasOrgAccessRLS, 
  verifyProjectAccessRLS, 
  getOrganizationForUser,
  getProjectForUser,
  checkUserOrgAccess,
  checkUserProjectAccess 
} from '@/lib/server/auth-rls'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId') || '00000000-0000-0000-0000-000000000000'
  const orgId = searchParams.get('orgId') || '00000000-0000-0000-0000-000000000000'  
  const projectId = searchParams.get('projectId') || '00000000-0000-0000-0000-000000000000'

  const results: any = {
    timestamp: new Date().toISOString(),
    testParameters: { userId, orgId, projectId },
    comparisons: {}
  }

  console.log('🧪 TESTING RLS MIGRATION FUNCTIONS')
  console.log('Parameters:', { userId, orgId, projectId })

  // Test 1: Organization access comparison
  console.log('\n--- TESTING ORGANIZATION ACCESS ---')
  try {
    // Original service client function
    console.log('Testing original userHasOrgAccess...')
    const originalOrgResult = await userHasOrgAccess(userId, orgId)
    
    // New RLS function with user context
    console.log('Testing new userHasOrgAccessRLS...')
    const userCtx = await makeUserCtx()
    const rlsOrgResult = await userHasOrgAccessRLS(userCtx, orgId)
    
    // New RLS function with admin context (for comparison)
    console.log('Testing new userHasOrgAccessRLS with admin context...')
    const adminCtx = makeAdminCtx()
    const adminOrgResult = await userHasOrgAccessRLS(adminCtx, orgId)
    
    // Convenience wrapper test
    console.log('Testing convenience wrapper checkUserOrgAccess...')
    const convenienceOrgResult = await checkUserOrgAccess(orgId)
    
    results.comparisons.organizationAccess = {
      original: { success: true, result: originalOrgResult, method: 'service_client' },
      rlsUser: { success: true, result: rlsOrgResult, method: 'authenticated_client' },
      rlsAdmin: { success: true, result: adminOrgResult, method: 'service_client_via_rls' },
      convenience: { success: true, result: convenienceOrgResult, method: 'convenience_wrapper' },
      resultsMatch: originalOrgResult === rlsOrgResult,
      adminBypassWorks: adminOrgResult !== undefined // Admin should always be able to query
    }
    
  } catch (error) {
    results.comparisons.organizationAccess = {
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }
  }

  // Test 2: Project access comparison  
  console.log('\n--- TESTING PROJECT ACCESS ---')
  try {
    // Original service client function
    console.log('Testing original verifyProjectAccess...')
    const originalProjectResult = await verifyProjectAccess(userId, projectId)
    
    // New RLS function with user context
    console.log('Testing new verifyProjectAccessRLS...')
    const userCtx = await makeUserCtx()
    const rlsProjectResult = await verifyProjectAccessRLS(userCtx, projectId)
    
    // Direct project fetch test
    console.log('Testing direct project fetch...')
    const directProjectResult = await getProjectForUser(userCtx, projectId)
    
    // Convenience wrapper test
    console.log('Testing convenience wrapper checkUserProjectAccess...')
    const convenienceProjectResult = await checkUserProjectAccess(projectId)
    
    results.comparisons.projectAccess = {
      original: { success: true, result: originalProjectResult, method: 'service_client' },
      rlsUser: { success: true, result: rlsProjectResult, method: 'authenticated_client' },
      directFetch: { success: true, result: !!directProjectResult, hasData: !!directProjectResult, method: 'direct_fetch' },
      convenience: { success: true, result: convenienceProjectResult, method: 'convenience_wrapper' },
      resultsMatch: originalProjectResult === rlsProjectResult,
      directFetchConsistent: rlsProjectResult === !!directProjectResult
    }
    
  } catch (error) {
    results.comparisons.projectAccess = {
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }
  }

  // Test 3: Authentication state
  console.log('\n--- TESTING AUTHENTICATION STATE ---')
  try {
    const userCtx = await makeUserCtx()
    const { data: { user }, error: authError } = await userCtx.client.auth.getUser()
    
    results.authenticationState = {
      hasUser: !!user,
      userId: user?.id || null,
      email: user?.email || null,
      error: authError?.message || null
    }
    
  } catch (error) {
    results.authenticationState = {
      error: error instanceof Error ? error.message : 'Unknown error',
      hasUser: false
    }
  }

  console.log('\n🎯 TEST RESULTS:', JSON.stringify(results, null, 2))

  return NextResponse.json({
    success: true,
    message: 'RLS migration function comparison completed',
    results,
    analysis: {
      orgAccessFunctionsMatch: results.comparisons.organizationAccess?.resultsMatch,
      projectAccessFunctionsMatch: results.comparisons.projectAccess?.resultsMatch,
      authenticationWorking: results.authenticationState?.hasUser,
      readyForMigration: results.comparisons.organizationAccess?.resultsMatch && 
                        results.comparisons.projectAccess?.resultsMatch,
      recommendation: results.authenticationState?.hasUser 
        ? (results.comparisons.organizationAccess?.resultsMatch 
           ? 'RLS functions working correctly - ready for migration'
           : 'RLS functions need debugging - results differ from original')
        : 'Need authenticated user session for meaningful comparison'
    }
  })
}