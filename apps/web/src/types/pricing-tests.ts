// Type overrides for pricing test APIs to prevent deployment issues

export interface PricingTest {
  id: string
  name: string
  description?: string
  test_type: 'ab_test' | 'gradual_rollout' | 'geographic' | 'segment'
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
  source_catalog_id: string
  test_catalog_id: string
  test_config: any
  success_criteria: any
  current_metrics?: any
  created_at: string
  updated_at: string
  actual_start_at?: string
  actual_end_at?: string
}

export interface TestResult {
  id: string
  test_id: string
  test_group: string
  metrics: any
  sample_size?: number
  measured_at: string
  is_statistically_significant?: boolean
  p_value?: number
  confidence_level?: number
}

// Type-safe database functions
export const createPricingTest = async (supabase: any, params: any) => {
  return await supabase.rpc('create_pricing_test', params) as { data: string | null, error: any }
}

export const startPricingTest = async (supabase: any, params: any) => {
  return await supabase.rpc('start_pricing_test', params) as { data: boolean | null, error: any }
}

export const recordTestMetrics = async (supabase: any, params: any) => {
  return await supabase.rpc('record_test_metrics', params) as { data: string | null, error: any }
}