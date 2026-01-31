// Test environment configuration
import { vi, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { mockBrowserAPIs } from '../utils/common'

// Set test environment variables
;(process.env as any).NODE_ENV = 'test'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
process.env.STRIPE_SECRET_KEY = 'sk_test_mock'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock'
process.env.OPENAI_API_KEY = 'sk-test-mock'
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-mock'

// Disable event system in tests by default
process.env.ENABLE_EVENT_SYSTEM = 'false'

// Apply browser API mocks
const browserMocks = mockBrowserAPIs()
browserMocks.apply()

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    pathname: '/',
    query: {}
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({})
}))

// Mock Next.js dynamic imports
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<any>) => {
    const Component = () => null
    Component.displayName = 'DynamicComponent'
    return Component
  }
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const translations: Record<string, any> = {
      navigation: {
        howItWorks: 'How It Works',
        pricing: 'Pricing',
        features: 'Features',
        startBuilding: 'Start Building',
        login: 'Login',
        signup: 'Sign Up'
      },
      hero: {
        title: 'Build Your Website',
        subtitle: 'Create stunning websites',
        badge: 'AI-Powered',
        welcome: 'Welcome to SheenApps',
        description: 'Build amazing websites'
      }
    }
    
    return (key: string) => {
      if (namespace && translations[namespace]) {
        return translations[namespace][key] || `${namespace}.${key}`
      }
      return namespace ? `${namespace}.${key}` : key
    }
  },
  useLocale: () => 'en',
  useMessages: () => ({}),
  NextIntlClientProvider: ({ children }: any) => children
}))

vi.mock('next-intl/server', () => ({
  getMessages: async ({ locale }: { locale: string }) => {
    // Return mock messages for tests - namespace-based structure
    const mockMessages: any = {}
    
    // Load namespace files for testing
    try {
      // Load builder namespace which contains buildEvents
      const builder = (await import(`../../src/messages/${locale}/builder.json`)).default
      mockMessages.builder = builder
    } catch {
      // Fallback to English if locale not found
      try {
        const builder = (await import('../../src/messages/en/builder.json')).default
        mockMessages.builder = builder
      } catch {
        // Provide minimal mock if files don't exist
        mockMessages.builder = {
          buildEvents: {
            BUILD_COMPLETE: 'Build complete!',
            BUILD_FAILED: 'Build failed: {reason}'
          }
        }
      }
    }
    
    // Add error namespace for tests
    try {
      const errors = (await import(`../../src/messages/${locale}/errors.json`)).default
      mockMessages.errors = errors
    } catch {
      // Provide mock error messages
      mockMessages.errors = {
        INSUFFICIENT_BALANCE: 'Insufficient balance. Please top up your account.',
        AI_LIMIT_REACHED: 'AI limit reached. Please try again later.'
      }
    }
    
    mockMessages.common = {}
    
    return mockMessages
  },
  unstable_setRequestLocale: vi.fn(),
  getRequestConfig: vi.fn()
}))

// Mock Supabase
vi.mock('@supabase/supabase-js', async () => {
  const { createMockSupabaseClient } = await import('../mocks/services')
  return {
    createClient: () => createMockSupabaseClient()
  }
})

// Mock Stripe
vi.mock('stripe', async () => {
  const { createMockStripeClient } = await import('../mocks/services')
  return {
    default: function Stripe() {
      return createMockStripeClient()
    }
  }
})

// Mock fetch for API calls
global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
  // Default successful response
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
    text: async () => 'OK',
    headers: new Headers()
  })
})

// Mock console methods to reduce noise
const originalConsole = { ...console }
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

// Restore console for test output
export const restoreConsole = () => {
  global.console = originalConsole
}

// Mock performance API
global.performance = {
  ...global.performance,
  mark: vi.fn(),
  measure: vi.fn(),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
  getEntriesByName: vi.fn(() => []),
  getEntriesByType: vi.fn(() => [])
}

// Crypto API is already mocked in src/test/setup.ts

// Setup global test utilities
global.testUtils = {
  flushPromises: () => new Promise(resolve => setImmediate(resolve)),
  tickAsync: (ms = 0) => new Promise(resolve => setTimeout(resolve, ms)),
  mockDate: (date: Date | string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(date))
    return () => vi.useRealTimers()
  }
}

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

// Export test utilities
export * from '../factories'
export * from '../mocks/services'
export * from '../utils/localization'
export * from '../utils/common'