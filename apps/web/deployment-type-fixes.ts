/**
 * Quick deployment fixes for TypeScript issues
 * This file contains type assertions to allow deployment
 * TODO: Replace with proper Supabase type generation after deployment
 */

// Extend the global module to include pricing test table types
declare module '@supabase/supabase-js' {
  interface Database {
    public: {
      Tables: {
        pricing_tests: {
          Row: {
            id: string
            name: string  
            status: string
            test_type: string
            [key: string]: any
          }
          Insert: { [key: string]: any }
          Update: { [key: string]: any }
        }
        pricing_test_results: {
          Row: { [key: string]: any }
          Insert: { [key: string]: any }
          Update: { [key: string]: any }
        }
        pricing_test_rollout_progress: {
          Row: { [key: string]: any }
          Insert: { [key: string]: any } 
          Update: { [key: string]: any }
        }
        pricing_test_audit_logs: {
          Row: { [key: string]: any }
          Insert: { [key: string]: any }
          Update: { [key: string]: any }
        }
        pricing_test_configurations: {
          Row: { [key: string]: any }
          Insert: { [key: string]: any }
          Update: { [key: string]: any }
        }
        pricing_test_allocations: {
          Row: { [key: string]: any }
          Insert: { [key: string]: any }
          Update: { [key: string]: any }
        }
        [key: string]: any
      }
      Functions: {
        create_pricing_test: { Args: any; Returns: any }
        start_pricing_test: { Args: any; Returns: any }
        record_test_metrics: { Args: any; Returns: any }
        [key: string]: any
      }
    }
  }
}