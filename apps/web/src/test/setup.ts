// Test setup file
import '@testing-library/jest-dom/vitest'
import { vi, beforeEach, beforeAll, afterAll } from 'vitest'

// Clear localStorage before each test to prevent store persistence interference
beforeEach(() => {
  localStorage.clear()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any

// Suppress console errors during tests unless explicitly testing them
const originalError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOMTestUtils.act is deprecated')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})

// AI Tier Testing Setup
// Mock environment variables for AI services
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'

// Add Supabase test environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dpnvqzrchxudbmxlofii.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwbnZxenJjaHh1ZGJteGxvZmlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ3ODQ3MDAsImV4cCI6MjA1MDM2MDcwMH0.oFHFuJ3jEQfcLNxwDyoFM_1tkTKtN-GjqpyGqPIqcnE'
process.env.ENABLE_REALTIME = 'true'
process.env.ENABLE_HISTORY = 'true'

// Mock fetch for AI API calls
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content: 'Mock AI response' } }],
      usage: { total_tokens: 100 }
    }),
    text: () => Promise.resolve('Mock AI response'),
    headers: new Headers(),
    url: 'https://api.mock.ai/test'
  })
)

// Mock setTimeout and setInterval for faster tests
vi.mock('timers', () => ({
  setTimeout: vi.fn((fn, delay) => {
    if (delay > 100) {
      // Speed up long delays in tests
      return global.setTimeout(fn, 10)
    }
    return global.setTimeout(fn, delay)
  }),
  setInterval: vi.fn((fn, delay) => {
    if (delay > 100) {
      return global.setInterval(fn, 10)
    }
    return global.setInterval(fn, delay)
  }),
  clearTimeout: vi.fn(global.clearTimeout),
  clearInterval: vi.fn(global.clearInterval)
}))

// Mock performance.now for consistent timing in tests
global.performance = {
  ...global.performance,
  now: vi.fn(() => Date.now())
}

// Mock crypto.subtle once globally for all tests (cuts test time and boilerplate)
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: async (algorithm: string, data: ArrayBuffer) => {
        // Mock SHA-256 hash for tests
        const mockHash = new Uint8Array(32)
        for (let i = 0; i < 32; i++) {
          mockHash[i] = Math.floor(Math.random() * 256)
        }
        return mockHash.buffer
      }
    },
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 15)
  }
})

// Setup for AI tier tests - reset state before each test
beforeEach(() => {
  // Clear any cached AI tier configurations
  vi.clearAllMocks()
  
  // Reset Date.now to consistent value for tests
  vi.setSystemTime(new Date('2024-12-21T00:00:00Z'))
})

// Custom matchers for AI tier testing
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received)
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected}`,
        pass: true
      }
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected}`,
        pass: false
      }
    }
  }
})