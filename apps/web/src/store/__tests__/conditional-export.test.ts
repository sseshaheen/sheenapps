/**
 * Test for conditional auth store export
 */

import { describe, it, expect, vi } from 'vitest'

describe('Conditional Auth Store Export', () => {
  it('should export the correct auth store based on ENABLE_SUPABASE flag', async () => {
    // Test with ENABLE_SUPABASE = false (default)
    const { useAuthStore } = await import('@/store')
    expect(useAuthStore).toBeDefined()
    expect(typeof useAuthStore).toBe('function')
    
    // Create a store instance
    const store = useAuthStore.getState()
    
    // Check for mock auth methods (from auth-store.ts)
    expect(store.login).toBeDefined()
    expect(store.logout).toBeDefined()
    expect(store.canPerformAction).toBeDefined()
    
    // Check if this is the mock store (no signIn/signUp) or Supabase store (has signIn/signUp)
    // Since ENABLE_SUPABASE is undefined in test env, it should be mock store
    if (process.env.ENABLE_SUPABASE !== 'true') {
      expect((store as any).signIn).toBeUndefined()
      expect((store as any).signUp).toBeUndefined()
    }
  })

  it('should maintain consistent interface between both stores', async () => {
    const { useAuthStore } = await import('@/store')
    const store = useAuthStore.getState()
    
    // Both stores should have these common methods
    expect(store.login).toBeDefined()
    expect(store.logout).toBeDefined()
    expect(store.checkAuth).toBeDefined()
    expect(store.updateUsage).toBeDefined()
    expect(store.canPerformAction).toBeDefined()
    expect(store.requestUpgrade).toBeDefined()
    expect(store.openLoginModal).toBeDefined()
    expect(store.closeLoginModal).toBeDefined()
    expect(store.openUpgradeModal).toBeDefined()
    expect(store.closeUpgradeModal).toBeDefined()
    
    // Both stores should have these common state properties
    expect(store.user).toBeDefined()
    expect(store.isAuthenticated).toBeDefined()
    expect(store.isGuest).toBeDefined()
    expect(store.sessionLimits).toBeDefined()
    expect(store.showLoginModal).toBeDefined()
    expect(store.showUpgradeModal).toBeDefined()
    expect(store.upgradeContext).toBeDefined()
  })
})