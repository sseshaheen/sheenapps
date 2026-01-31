/**
 * 🚨 Test: Original Auth Functions Should Fail Without Service Key
 * 
 * This endpoint tests what happens when we call the original auth functions
 * when SUPABASE_SERVICE_ROLE_KEY is commented out
 */

import { NextRequest, NextResponse } from 'next/server'
import { userHasOrgAccess, verifyProjectAccess } from '@/lib/server/auth'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId') || '00000000-0000-0000-0000-000000000000'
  const orgId = searchParams.get('orgId') || '00000000-0000-0000-0000-000000000000'
  const projectId = searchParams.get('projectId') || '00000000-0000-0000-0000-000000000000'

  const results: any = {
    timestamp: new Date().toISOString(),
    serviceKeyPresent: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    testingWithIds: { userId, orgId, projectId }
  }

  console.log('🚨 TESTING ORIGINAL AUTH FUNCTIONS WITHOUT SERVICE KEY')
  console.log('Service key present:', results.serviceKeyPresent)

  // Test 1: userHasOrgAccess
  try {
    console.log('Testing original userHasOrgAccess...')
    const orgResult = await userHasOrgAccess(userId, orgId)
    results.originalOrgAccess = { success: true, result: orgResult }
    console.log('✅ Original userHasOrgAccess worked:', orgResult)
  } catch (error) {
    results.originalOrgAccess = { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown'
    }
    console.log('❌ Original userHasOrgAccess failed:', error)
  }

  // Test 2: verifyProjectAccess  
  try {
    console.log('Testing original verifyProjectAccess...')
    const projectResult = await verifyProjectAccess(userId, projectId)
    results.originalProjectAccess = { success: true, result: projectResult }
    console.log('✅ Original verifyProjectAccess worked:', projectResult)
  } catch (error) {
    results.originalProjectAccess = { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown'
    }
    console.log('❌ Original verifyProjectAccess failed:', error)
  }

  return NextResponse.json({
    success: true,
    message: 'Original auth functions test completed',
    results
  })
}