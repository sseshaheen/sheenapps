/**
 * 🧪 Test Authenticated Client Access
 * 
 * Tests if authenticated client can access tables after grants
 * Phase 3.1 validation - should work once grants are applied
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/server/supabase-clients'

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: []
  }

  console.log('🧪 TESTING AUTHENTICATED CLIENT ACCESS')

  try {
    // Test 1: Service client (should always work)
    console.log('Test 1: Service client access...')
    try {
      const serviceClient = getServiceClient()
      const { data: serviceData, error: serviceError } = await serviceClient
        .from('projects')
        .select('id')
        .limit(1)

      results.tests.push({
        name: 'service_client_access',
        success: !serviceError,
        error: serviceError?.message || null,
        rowsFound: serviceData?.length || 0,
        note: 'Service client should always work - baseline test'
      })

      console.log(`✅ Service client: ${serviceError ? 'FAILED' : 'SUCCESS'}`)
    } catch (error) {
      results.tests.push({
        name: 'service_client_access',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        exception: true
      })
    }

    // Test 2: Authenticated client (this is what we're testing)
    console.log('Test 2: Authenticated client access...')
    try {
      const authClient = await createServerSupabaseClientNew()
      const { data: authData, error: authError } = await authClient
        .from('projects')
        .select('id')
        .limit(1)

      results.tests.push({
        name: 'authenticated_client_access',
        success: !authError,
        error: authError?.message || null,
        errorCode: authError?.code || null,
        rowsFound: authData?.length || 0,
        note: 'This will fail with 42501 if grants are missing'
      })

      const isGrantsWorking = !authError || authError.code !== '42501'
      console.log(`${isGrantsWorking ? '✅' : '❌'} Authenticated client: ${authError ? `FAILED (${authError.code})` : 'SUCCESS'}`)
      
      if (authError?.code === '42501') {
        console.log('⚠️  42501 error means grants are missing - need to apply migration 031')
      }

    } catch (error) {
      results.tests.push({
        name: 'authenticated_client_access', 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        exception: true
      })
    }

    // Test 3: Organization members table
    console.log('Test 3: Organization members access...')
    try {
      const authClient = await createServerSupabaseClientNew()
      const { data: orgData, error: orgError } = await authClient
        .from('organization_members')
        .select('user_id')
        .limit(1)

      results.tests.push({
        name: 'org_members_access',
        success: !orgError,
        error: orgError?.message || null,
        errorCode: orgError?.code || null,
        rowsFound: orgData?.length || 0,
        note: 'Tests organization_members table access'
      })

      console.log(`${!orgError || orgError.code !== '42501' ? '✅' : '❌'} Organization members: ${orgError ? `FAILED (${orgError.code})` : 'SUCCESS'}`)

    } catch (error) {
      results.tests.push({
        name: 'org_members_access',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        exception: true
      })
    }

  } catch (error) {
    console.error('Test suite failed:', error)
    results.error = {
      message: error instanceof Error ? error.message : 'Unknown error',
      exception: true
    }
  }

  const successfulTests = results.tests.filter((test: any) => test.success).length
  const totalTests = results.tests.length
  const overallSuccess = successfulTests === totalTests

  console.log(`📊 Test Results: ${successfulTests}/${totalTests} passed`)

  return NextResponse.json({
    success: overallSuccess,
    message: `${successfulTests}/${totalTests} access tests passed`,
    grantStatus: results.tests.find((t: any) => t.name === 'authenticated_client_access')?.error?.includes('42501') 
      ? 'MISSING - Apply migration 031_authenticated_role_grants.sql'
      : 'PRESENT - Grants are working',
    results,
    nextSteps: overallSuccess 
      ? 'Authenticated client access working - proceed to test RLS functions'
      : 'Apply database grants first - check migration 031_authenticated_role_grants.sql'
  })
}

export async function POST() {
  return NextResponse.json({
    error: 'Use GET method to run tests',
    usage: 'GET /api/test-authenticated-access'
  }, { status: 405 })
}