import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { v4 as uuidv4 } from 'uuid'

// ✅ Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Check admin authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Check permissions
    const hasPermission = (await AdminAuthService.hasPermission('pricing.read')) || 
                         session.user.role === 'super_admin'
    if (!hasPermission) {
      return noCacheErrorResponse({ error: 'Insufficient permissions' }, 403)
    }

    const testId = params.id
    const { searchParams } = new URL(request.url)
    const include_results = searchParams.get('include_results') === 'true'
    const include_progress = searchParams.get('include_progress') === 'true'

    const supabase = await createServerSupabaseClientNew()

    // Get main test details
    const { data: test, error } = await supabase
      .from('pricing_tests')
      .select(`
        *,
        source_catalog:pricing_catalogs!source_catalog_id(id, version_tag, name, status),
        test_catalog:pricing_catalogs!test_catalog_id(id, version_tag, name, status),
        creator:auth.users!created_by(email, user_metadata),
        configurations:pricing_test_configurations(*)
      `)
      .eq('id', testId)
      .single()

    if (error || !test) {
      return noCacheErrorResponse({
        error: 'Test not found',
        details: error?.message
      }, 404)
    }

    // Get additional data if requested
    const additionalData: any = {}

    if (include_results) {
      const { data: results } = await supabase
        .from('pricing_test_results')
        .select('*')
        .eq('test_id', testId)
        .order('measured_at', { ascending: false })
        .limit(100) // Latest 100 results

      additionalData.recent_results = results || []

      // Calculate summary statistics
      if (results && results.length > 0) {
        const groupedResults = results.reduce((acc: any, result: any) => {
          if (!acc[result.test_group]) {
            acc[result.test_group] = []
          }
          acc[result.test_group].push(result)
          return acc
        }, {})

        additionalData.results_summary = Object.keys(groupedResults).map(group => {
          const groupResults = groupedResults[group]
          const latest = groupResults[0] // Most recent result
          
          return {
            test_group: group,
            latest_metrics: latest.metrics,
            sample_size: groupResults.reduce((sum: number, r: any) => sum + (r.sample_size || 0), 0),
            is_statistically_significant: latest.is_statistically_significant,
            p_value: latest.p_value,
            measurement_count: groupResults.length
          }
        })
      }
    }

    if (include_progress && test.test_type === 'gradual_rollout') {
      const { data: progress } = await supabase
        .from('pricing_test_rollout_progress')
        .select('*')
        .eq('test_id', testId)
        .order('target_percentage', { ascending: true })

      additionalData.rollout_progress = progress || []
    }

    return noCacheResponse({
      success: true,
      test: {
        ...test,
        ...additionalData
      }
    })

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to fetch test details',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

export async function PUT(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Check admin authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Check permissions
    const hasPermission = (await AdminAuthService.hasPermission('pricing.write')) || 
                         session.user.role === 'super_admin'
    if (!hasPermission) {
      return noCacheErrorResponse({ error: 'Insufficient permissions' }, 403)
    }

    const testId = params.id
    const updates = await request.json()
    const reason = request.headers.get('x-admin-reason') || 'Updating pricing test'
    const correlationId = uuidv4()

    const supabase = await createServerSupabaseClientNew()

    // Get current test state for audit logging
    const { data: currentTest, error: fetchError } = await supabase
      .from('pricing_tests')
      .select('*')
      .eq('id', testId)
      .single()

    if (fetchError || !currentTest) {
      return noCacheErrorResponse({
        error: 'Test not found',
        details: fetchError?.message
      }, 404)
    }

    // Check if test can be modified
    if (currentTest.status === 'completed' || currentTest.status === 'cancelled') {
      return noCacheErrorResponse({
        error: 'Cannot modify completed or cancelled test'
      }, 400)
    }

    // If status is being changed, validate the transition
    if (updates.status && updates.status !== currentTest.status) {
      const isValidTransition = validateStatusTransition(currentTest.status, updates.status)
      if (!isValidTransition) {
        return noCacheErrorResponse({
          error: `Invalid status transition from ${currentTest.status} to ${updates.status}`
        }, 400)
      }
    }

    // Update the test
    const { data: updatedTest, error: updateError } = await supabase
      .from('pricing_tests')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', testId)
      .select()
      .single()

    if (updateError) {
      return noCacheErrorResponse({
        error: 'Failed to update test',
        details: updateError.message
      }, 500)
    }

    // Create audit log entry
    await supabase
      .from('pricing_test_audit_logs')
      .insert({
        test_id: testId,
        action: 'test_updated',
        actor_id: session.user.id,
        actor_email: session.user.email,
        reason,
        correlation_id: correlationId,
        before_state: currentTest,
        after_state: updatedTest
      })

    return noCacheResponse({
      success: true,
      test: updatedTest,
      correlation_id: correlationId,
      message: 'Test updated successfully'
    })

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to update test',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

export async function DELETE(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Check admin authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Only super_admin can delete tests
    if (session.user.role !== 'super_admin') {
      return noCacheErrorResponse({ 
        error: 'Insufficient permissions. Super admin required for test deletion.',
        required: 'super_admin',
        current: session.user.role 
      }, 403)
    }

    const testId = params.id
    const reason = request.headers.get('x-admin-reason') || 'Deleting pricing test'
    const correlationId = uuidv4()

    const supabase = await createServerSupabaseClientNew()

    // Get current test state
    const { data: currentTest, error: fetchError } = await supabase
      .from('pricing_tests')
      .select('*')
      .eq('id', testId)
      .single()

    if (fetchError || !currentTest) {
      return noCacheErrorResponse({
        error: 'Test not found',
        details: fetchError?.message
      }, 404)
    }

    // Check if test can be deleted
    if (currentTest.status === 'running') {
      return noCacheErrorResponse({
        error: 'Cannot delete running test. Stop the test first.'
      }, 400)
    }

    // Soft delete: mark as cancelled instead of hard delete (preserves audit trail)
    const { error: updateError } = await supabase
      .from('pricing_tests')
      .update({
        status: 'cancelled',
        actual_end_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', testId)

    if (updateError) {
      return noCacheErrorResponse({
        error: 'Failed to delete test',
        details: updateError.message
      }, 500)
    }

    // Create audit log entry
    await supabase
      .from('pricing_test_audit_logs')
      .insert({
        test_id: testId,
        action: 'test_deleted',
        actor_id: session.user.id,
        actor_email: session.user.email,
        reason,
        correlation_id: correlationId,
        before_state: currentTest,
        after_state: { status: 'cancelled', deleted_at: new Date().toISOString() }
      })

    return noCacheResponse({
      success: true,
      correlation_id: correlationId,
      message: 'Test deleted successfully'
    })

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to delete test',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

function validateStatusTransition(currentStatus: string, newStatus: string): boolean {
  const validTransitions: Record<string, string[]> = {
    'draft': ['scheduled', 'running', 'cancelled'],
    'scheduled': ['running', 'cancelled'],
    'running': ['paused', 'completed', 'cancelled'],
    'paused': ['running', 'cancelled'],
    'completed': [], // Cannot transition from completed
    'cancelled': []  // Cannot transition from cancelled
  }

  return validTransitions[currentStatus]?.includes(newStatus) || false
}