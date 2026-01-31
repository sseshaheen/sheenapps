import { vi } from 'vitest'
import { createAuthScenarioMock } from '../../utils/auth'

// Global mock client that can be reconfigured per test
export let mockSupabaseClient: any

// Set up auth test environment
export function setupAuthTests() {
  // Default to authenticated scenario
  mockSupabaseClient = createAuthScenarioMock('AUTHENTICATED')
  
  // Mock the createClient function
  vi.mock('@/lib/supabase', () => ({
    createClient: vi.fn(() => mockSupabaseClient),
    createServerSupabaseClientNew: vi.fn(() => Promise.resolve(mockSupabaseClient))
  }))
  
  // Mock feature flags
  vi.mock('@/lib/feature-flags', () => ({
    FEATURE_FLAGS: {
      ENABLE_SUPABASE: true
    }
  }))
}

// Configure auth scenario for a specific test
export function setAuthScenario(scenario: 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'UNVERIFIED' | 'EXPIRED' | 'TAMPERED') {
  mockSupabaseClient = createAuthScenarioMock(scenario)
}

// Override specific auth methods for edge cases
export function mockAuthMethod(method: string, implementation: any) {
  if (mockSupabaseClient?.auth?.[method]) {
    mockSupabaseClient.auth[method] = implementation
  }
}