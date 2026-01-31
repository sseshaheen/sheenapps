import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { v4 as uuidv4 } from 'uuid'
import { createPricingTest } from '@/types/pricing-tests'

// ✅ Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface CreateTestRequest {
  name: string
  description?: string
  test_type: 'ab_test' | 'gradual_rollout' | 'geographic' | 'segment'
  source_catalog_id: string
  test_catalog_id: string
  test_config: {
    ab_split?: {
      control_percentage: number
      variant_percentage: number
    }
    rollout_stages?: {
      name: string
      percentage: number
      duration_hours: number
      success_criteria?: any
    }[]
    geographic_rules?: {
      regions: string[]
      percentage_per_region: number
    }
    segment_rules?: {
      user_segments: string[]
      allocation: Record<string, number>
    }
    duration_days?: number
    traffic_allocation?: 'random' | 'deterministic'
  }
  success_criteria: {
    primary_metric: string
    minimum_improvement: number
    confidence_level: number
    minimum_sample_size: number
    auto_stop_on_significance?: boolean
  }
  auto_promote_on_success?: boolean
  scheduled_start_at?: string
  scheduled_end_at?: string
}

interface UpdateTestRequest extends Partial<CreateTestRequest> {
  status?: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled'
}

export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Check permissions
    const hasPermission = await AdminAuthService.hasPermission('pricing.read') || 
                         session.user.role === 'super_admin'
    if (!hasPermission) {
      return noCacheErrorResponse({ error: 'Insufficient permissions' }, 403)
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const test_type = searchParams.get('test_type')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const supabase = await createServerSupabaseClientNew()

    // Build query
    let query = supabase
      .from('pricing_tests')
      .select(`
        *,
        source_catalog:pricing_catalogs!source_catalog_id(id, version_tag, name),
        test_catalog:pricing_catalogs!test_catalog_id(id, version_tag, name),
        creator:auth.users!created_by(email, user_metadata)
      `)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }
    if (test_type) {
      query = query.eq('test_type', test_type)
    }

    const { data: tests, error, count } = await query
      .range(offset, offset + limit - 1)

    if (error) {
      return noCacheErrorResponse({ 
        error: 'Failed to fetch tests', 
        details: error.message 
      }, 500)
    }

    return noCacheResponse({
      success: true,
      tests: tests || [],
      pagination: {
        limit,
        offset,
        returned: tests?.length || 0,
        total: count || 0
      }
    })

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to fetch pricing tests',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Check permissions - only super_admin can create tests initially
    if (session.user.role !== 'super_admin') {
      return noCacheErrorResponse({ 
        error: 'Insufficient permissions. Super admin required for test creation.',
        required: 'super_admin',
        current: session.user.role 
      }, 403)
    }

    const body: CreateTestRequest = await request.json()
    const reason = request.headers.get('x-admin-reason') || 'Creating pricing test'
    const correlationId = uuidv4()

    // Validate required fields
    if (!body.name || !body.source_catalog_id || !body.test_catalog_id || !body.test_type) {
      return noCacheErrorResponse({
        error: 'Missing required fields',
        required: ['name', 'source_catalog_id', 'test_catalog_id', 'test_type']
      }, 400)
    }

    // Validate test configuration based on type
    const validationError = validateTestConfig(body.test_type, body.test_config)
    if (validationError) {
      return noCacheErrorResponse({
        error: 'Invalid test configuration',
        details: validationError
      }, 400)
    }

    const supabase = await createServerSupabaseClientNew()

    // Verify catalogs exist
    const { data: catalogs } = await supabase
      .from('pricing_catalogs')
      .select('id, version_tag')
      .in('id', [body.source_catalog_id, body.test_catalog_id])

    if (!catalogs || catalogs.length !== 2) {
      return noCacheErrorResponse({
        error: 'One or both pricing catalogs not found'
      }, 404)
    }

    // Create the test using the database function
    const { data: testId, error } = await createPricingTest(supabase, {
        p_name: body.name,
        p_description: body.description || null,
        p_test_type: body.test_type,
        p_source_catalog_id: body.source_catalog_id,
        p_test_catalog_id: body.test_catalog_id,
        p_test_config: body.test_config,
        p_success_criteria: body.success_criteria,
        p_created_by: session.user.id,
        p_reason: reason,
        p_correlation_id: correlationId
      })

    if (error) {
      return noCacheErrorResponse({
        error: 'Failed to create test',
        details: error.message
      }, 500)
    }

    // Create test configurations based on test type
    if (body.test_type === 'gradual_rollout' && body.test_config.rollout_stages) {
      for (const [index, stage] of body.test_config.rollout_stages.entries()) {
        await supabase
          .from('pricing_test_configurations')
          .insert({
            test_id: testId,
            config_type: 'rollout_stage',
            config_data: stage,
            execution_order: index + 1
          })
      }
    }

    return noCacheResponse({
      success: true,
      test_id: testId,
      correlation_id: correlationId,
      message: 'Pricing test created successfully'
    })

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to create pricing test',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

function validateTestConfig(testType: string, config: any): string | null {
  switch (testType) {
    case 'ab_test':
      if (!config.ab_split) return 'A/B test requires ab_split configuration'
      if (config.ab_split.control_percentage + config.ab_split.variant_percentage !== 100) {
        return 'A/B split percentages must sum to 100'
      }
      break
      
    case 'gradual_rollout':
      if (!config.rollout_stages || config.rollout_stages.length === 0) {
        return 'Gradual rollout requires rollout_stages configuration'
      }
      // Validate that percentages are increasing
      let lastPercentage = 0
      for (const stage of config.rollout_stages) {
        if (stage.percentage <= lastPercentage) {
          return 'Rollout stages must have increasing percentages'
        }
        lastPercentage = stage.percentage
      }
      break
      
    case 'geographic':
      if (!config.geographic_rules || !config.geographic_rules.regions) {
        return 'Geographic test requires geographic_rules with regions'
      }
      break
      
    case 'segment':
      if (!config.segment_rules || !config.segment_rules.user_segments) {
        return 'Segment test requires segment_rules with user_segments'
      }
      break
      
    default:
      return `Unknown test type: ${testType}`
  }
  
  return null
}