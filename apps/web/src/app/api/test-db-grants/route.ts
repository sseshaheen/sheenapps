/**
 * 🧪 Test Database Grants
 * 
 * Tests what operations work with authenticated client vs service client
 * to understand current grant situation
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/server/supabase-clients'

export async function GET(request: NextRequest) {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {}
  }

  console.log('🧪 TESTING DATABASE GRANTS')

  // Test 1: Schema access with authenticated client
  try {
    console.log('Testing authenticated client schema access...')
    const authClient = await createServerSupabaseClientNew()
    
    // Try to query projects table (should respect RLS if grants exist)
    const { data, error, count } = await authClient
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    
    results.tests.authenticatedSchemaAccess = {
      success: !error,
      error: error?.message || null,
      code: error?.code || null,
      hint: error?.hint || null,
      hasData: !!data
    }
    
    console.log('✅ Authenticated schema test:', results.tests.authenticatedSchemaAccess)
  } catch (error) {
    results.tests.authenticatedSchemaAccess = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      exception: true
    }
    console.log('❌ Authenticated schema test failed:', error)
  }

  // Test 2: Organization members access with authenticated client
  try {
    console.log('Testing organization_members access...')
    const authClient = await createServerSupabaseClientNew()
    
    const { data, error } = await authClient
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    
    results.tests.authenticatedOrgMembersAccess = {
      success: !error,
      error: error?.message || null,
      code: error?.code || null,
      hint: error?.hint || null
    }
    
    console.log('✅ Org members test:', results.tests.authenticatedOrgMembersAccess)
  } catch (error) {
    results.tests.authenticatedOrgMembersAccess = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      exception: true
    }
    console.log('❌ Org members test failed:', error)
  }

  // Test 3: Service client comparison
  try {
    console.log('Testing service client access...')
    const serviceClient = getServiceClient()
    
    const { data, error } = await serviceClient
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    
    results.tests.serviceClientAccess = {
      success: !error,
      error: error?.message || null,
      code: error?.code || null
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
    message: 'Database grants test completed',
    results,
    analysis: {
      needsGrants: !results.tests.authenticatedSchemaAccess?.success && 
                   results.tests.serviceClientAccess?.success,
      permissionDeniedCode: results.tests.authenticatedSchemaAccess?.code === '42501',
      recommendation: results.tests.authenticatedSchemaAccess?.success 
        ? 'Authenticated client has access - RLS should work'
        : 'Need to grant base privileges to authenticated role'
    }
  })
}