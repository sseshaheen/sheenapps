/**
 * 🧪 Test Database Grants with Real Authentication
 * 
 * Tests database access with a real authenticated user session
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/server/supabase-clients'

export async function GET(request: NextRequest) {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {}
  }

  console.log('🧪 TESTING DATABASE GRANTS WITH REAL AUTH')

  // Test 1: Get current authenticated user
  try {
    console.log('Testing current authenticated user...')
    const authClient = await createServerSupabaseClientNew()
    
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    
    results.tests.currentUser = {
      success: !authError,
      authenticated: !!user,
      userId: user?.id || null,
      email: user?.email || null,
      error: authError?.message || null
    }
    
    console.log('✅ Current user test:', results.tests.currentUser)
    
    // If we have an authenticated user, test database access
    if (user) {
      console.log('Testing database access with authenticated user...')
      
      // Test projects access
      const { data: projects, error: projectsError } = await authClient
        .from('projects')
        .select('id, name, owner_id')
        .limit(5)
      
      results.tests.authenticatedProjectsAccess = {
        success: !projectsError,
        rowCount: projects?.length || 0,
        error: projectsError?.message || null,
        code: projectsError?.code || null,
        hint: projectsError?.hint || null,
        details: projectsError?.details || null
      }
      
      console.log('✅ Projects access test:', results.tests.authenticatedProjectsAccess)
      
      // Test organization_members access
      const { data: orgMembers, error: orgError } = await authClient
        .from('organization_members')
        .select('id, organization_id, user_id')
        .limit(5)
      
      results.tests.authenticatedOrgAccess = {
        success: !orgError,
        rowCount: orgMembers?.length || 0,
        error: orgError?.message || null,
        code: orgError?.code || null,
        hint: orgError?.hint || null,
        details: orgError?.details || null
      }
      
      console.log('✅ Org members access test:', results.tests.authenticatedOrgAccess)
      
    } else {
      results.tests.authenticatedProjectsAccess = {
        success: false,
        error: 'No authenticated user - cannot test database access',
        skipped: true
      }
      results.tests.authenticatedOrgAccess = {
        success: false,
        error: 'No authenticated user - cannot test database access', 
        skipped: true
      }
    }
    
  } catch (error) {
    results.tests.currentUser = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      exception: true
    }
    console.log('❌ Auth test failed:', error)
  }

  // Test 2: Service client comparison (same as before)
  try {
    console.log('Testing service client access...')
    const serviceClient = getServiceClient()
    
    const { data: projects, error: projectsError } = await serviceClient
      .from('projects')
      .select('id, name, owner_id')
      .limit(5)
    
    results.tests.serviceClientAccess = {
      success: !projectsError,
      rowCount: projects?.length || 0,
      error: projectsError?.message || null,
      code: projectsError?.code || null
    }
    
    console.log('✅ Service client test:', results.tests.serviceClientAccess)
  } catch (error) {
    results.tests.serviceClientAccess = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      exception: true
    }
    console.log('❌ Service client test failed:', error)
  }

  return NextResponse.json({
    success: true,
    message: 'Authenticated database grants test completed',
    results,
    analysis: {
      hasAuthenticatedUser: !!results.tests.currentUser?.authenticated,
      authenticatedDatabaseAccess: results.tests.authenticatedProjectsAccess?.success,
      serviceClientWorks: results.tests.serviceClientAccess?.success,
      needsAuthentication: !results.tests.currentUser?.authenticated,
      needsGrants: results.tests.currentUser?.authenticated && 
                   !results.tests.authenticatedProjectsAccess?.success &&
                   results.tests.authenticatedProjectsAccess?.code === '42501',
      recommendation: !results.tests.currentUser?.authenticated 
        ? 'Need to authenticate first to test database grants'
        : results.tests.authenticatedProjectsAccess?.success
          ? 'Authenticated client has database access - RLS migration should work'
          : 'Authenticated client lacks database access - need to grant base privileges'
    }
  })
}