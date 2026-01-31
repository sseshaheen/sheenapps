/**
 * 🧪 Test API: Auth Functions RLS Test
 * 
 * Test endpoint to compare service client vs authenticated client auth functions
 * Usage: GET /api/test-auth-rls?userId=xxx&projectId=xxx&orgId=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { authTestFunctions } from '@/lib/server/auth-test'
import { getCurrentUser } from '@/lib/server/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const projectId = searchParams.get('projectId')  
    const orgId = searchParams.get('orgId')
    const test = searchParams.get('test') || 'all'

    console.log('\n🧪 AUTH RLS TEST ENDPOINT CALLED')
    console.log('Parameters:', { userId, projectId, orgId, test })

    // Get current user for context
    let currentUser = null
    try {
      currentUser = await getCurrentUser()
      console.log('Current authenticated user:', currentUser?.id)
    } catch (error) {
      console.log('No authenticated user (testing with provided IDs)')
    }

    const results: any = {
      timestamp: new Date().toISOString(),
      currentUser: currentUser?.id || null,
      testParameters: { userId, projectId, orgId, test }
    }

    // Test 1: Smoke test (functions work without service key)
    if (test === 'smoke' || test === 'all') {
      console.log('\n--- RUNNING SMOKE TEST ---')
      results.smokeTest = await authTestFunctions.simulateSmokeTest()
    }

    // Test 2: Org access comparison (if orgId provided)
    if ((test === 'org' || test === 'all') && userId && orgId) {
      console.log('\n--- TESTING ORG ACCESS ---')
      try {
        results.orgAccessComparison = await authTestFunctions.compareOrgAccessMethods(userId, orgId)
      } catch (error) {
        results.orgAccessError = {
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error
        }
      }
    }

    // Test 3: Project access comparison (if projectId provided)  
    if ((test === 'project' || test === 'all') && userId && projectId) {
      console.log('\n--- TESTING PROJECT ACCESS ---')
      try {
        results.projectAccessComparison = await authTestFunctions.compareProjectAccessMethods(userId, projectId)
      } catch (error) {
        results.projectAccessError = {
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error
        }
      }
    }

    // Test 4: Direct function tests
    if (test === 'direct' || test === 'all') {
      console.log('\n--- TESTING DIRECT FUNCTIONS ---')
      
      if (userId && orgId) {
        try {
          results.directOrgTest = await authTestFunctions.testUserHasOrgAccess(userId, orgId)
        } catch (error) {
          results.directOrgError = error instanceof Error ? error.message : 'Unknown error'
        }
      }
      
      if (userId && projectId) {
        try {
          results.directProjectTest = await authTestFunctions.testVerifyProjectAccess(userId, projectId)
        } catch (error) {
          results.directProjectError = error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    console.log('\n🎯 TEST RESULTS:', JSON.stringify(results, null, 2))

    return NextResponse.json({
      success: true,
      message: 'Auth RLS tests completed',
      results,
      usage: {
        examples: [
          'GET /api/test-auth-rls?test=smoke (test without service key)',
          'GET /api/test-auth-rls?userId=xxx&projectId=xxx&test=project',
          'GET /api/test-auth-rls?userId=xxx&orgId=xxx&test=org',
          'GET /api/test-auth-rls?userId=xxx&projectId=xxx&orgId=xxx&test=all'
        ]
      }
    })

  } catch (error) {
    console.error('❌ Auth RLS test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 })
  }
}

// Enable for all HTTP methods for testing
export async function POST(request: NextRequest) {
  return GET(request)
}