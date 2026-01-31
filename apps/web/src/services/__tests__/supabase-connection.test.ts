/**
 * Basic Supabase Connection Test
 * Verifies that our Supabase setup is working
 */

import { createClient } from '@/lib/supabase-client'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { logger } from '@/utils/logger';

describe('Supabase Connection', () => {
  // Skip tests if we don't have real credentials
  const hasCredentials = process.env.NEXT_PUBLIC_SUPABASE_URL && 
                        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!hasCredentials) {
    logger.info('⚠️ Skipping Supabase tests - no credentials provided');
  }

  it('should create a client without errors', () => {
    expect(() => {
      const supabase = createClient()
      expect(supabase).toBeDefined()
    }).not.toThrow()
  })

  it('should have feature flags configured', () => {
    expect(typeof FEATURE_FLAGS.REALTIME_COLLABORATION).toBe('boolean')
    expect(typeof FEATURE_FLAGS.VERSION_HISTORY).toBe('boolean')
    expect(typeof FEATURE_FLAGS.AUTO_SAVE).toBe('boolean')
    expect(FEATURE_FLAGS.MAX_REALTIME_CONNECTIONS).toBeGreaterThan(0)
  })

  // Only run live tests if we have credentials
  if (hasCredentials) {
    it('should connect to Supabase and check auth', async () => {
      const supabase = createClient()
      
      try {
        // Try to get session (should return null for unauthenticated)
        const { data, error } = await supabase.auth.getSession()
        
        expect(error).toBeNull()
        expect(data).toBeDefined()
        expect(data.session).toBeNull() // Should be null since we're not logged in
      } catch (error) {
        // If this fails, it might be a connection issue
        logger.error('Connection test failed:', error);
        throw error
      }
    })

    // Skip database query test for now due to fetch mock interference
    it.skip('should be able to query system tables', async () => {
      const supabase = createClient()
      
      try {
        // Try a simple query that should work even without auth
        const { data, error } = await supabase
          .from('projects')
          .select('count')
          .limit(0)
        
        // We expect this to work (even if it returns empty results)
        // Any RLS restrictions should still allow the query structure
        expect(error).toBeNull()
      } catch (error) {
        logger.error('Table query test failed:', error);
        throw error
      }
    })
  }
})