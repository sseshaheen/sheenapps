import { vi } from 'vitest'
import type { SupabaseClient, User, Session } from '@supabase/supabase-js'
import type Stripe from 'stripe'

// Mock User Factory
export const createMockUser = (overrides: Partial<User> = {}): User => {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    phone: null,
    phone_confirmed_at: null,
    confirmation_sent_at: null,
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    role: '',
    ...overrides
  }
}

// Mock Session Factory
export const createMockSession = (overrides: Partial<Session> = {}): Session => {
  const user = createMockUser(overrides.user)
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
    ...overrides
  }
}

// Mock Supabase Client
export const createMockSupabaseClient = (): SupabaseClient => {
  const mockAuth = {
    getUser: vi.fn().mockResolvedValue({
      data: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString()
        }
      },
      error: null
    }),
    
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
          expires_at: Date.now() + 3600000,
          user: {
            id: 'test-user-id',
            email: 'test@example.com'
          }
        }
      },
      error: null
    }),
    
    signUp: vi.fn().mockResolvedValue({
      data: {
        user: { id: 'new-user-id', email: 'new@example.com' },
        session: null
      },
      error: null
    }),
    
    signInWithPassword: vi.fn().mockResolvedValue({
      data: {
        user: { id: 'test-user-id', email: 'test@example.com' },
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token'
        }
      },
      error: null
    }),
    
    signOut: vi.fn().mockResolvedValue({ error: null }),
    
    setSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'mock-access-token' } },
      error: null
    }),
    
    onAuthStateChange: vi.fn().mockImplementation((callback) => {
      // Immediately call the callback with initial state
      callback('INITIAL_SESSION', null)
      
      // Return unsubscribe function
      return {
        data: { subscription: { unsubscribe: vi.fn() } }
      }
    }),
    
    // Additional auth methods for comprehensive testing
    signInWithOtp: vi.fn().mockResolvedValue({
      data: {},
      error: null
    }),
    
    signInWithOAuth: vi.fn().mockResolvedValue({
      data: { url: 'https://provider.com/oauth', provider: 'google' },
      error: null
    }),
    
    resetPasswordForEmail: vi.fn().mockResolvedValue({
      data: {},
      error: null
    }),
    
    updateUser: vi.fn().mockResolvedValue({
      data: { user: {
        id: 'test-user-id',
        email: 'test@example.com',
        email_confirmed_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phone: null,
        phone_confirmed_at: null,
        confirmation_sent_at: null,
        confirmed_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        role: ''
      }},
      error: null
    }),
    
    refreshSession: vi.fn().mockResolvedValue({
      data: { session: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          email_confirmed_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          phone: null,
          phone_confirmed_at: null,
          confirmation_sent_at: null,
          confirmed_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          role: ''
        }
      }},
      error: null
    })
  }
  
  const mockFrom = (table: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockResolvedValue({ data: [], error: null })
  })
  
  const mockStorage = {
    from: vi.fn().mockImplementation((bucket: string) => ({
      upload: vi.fn().mockResolvedValue({
        data: { path: `${bucket}/mock-file.jpg` },
        error: null
      }),
      download: vi.fn().mockResolvedValue({
        data: new Blob(['mock-file-content']),
        error: null
      }),
      remove: vi.fn().mockResolvedValue({
        data: [{ name: 'mock-file.jpg' }],
        error: null
      }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: `https://mock-storage.supabase.co/${bucket}/mock-file.jpg` }
      })
    }))
  }
  
  return {
    auth: mockAuth,
    from: mockFrom,
    storage: mockStorage,
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    })
  } as unknown as SupabaseClient
}

// Mock Stripe Client
export const createMockStripeClient = (): Stripe => {
  const mockCustomers = {
    create: vi.fn().mockResolvedValue({
      id: 'cus_mock123',
      email: 'test@example.com',
      metadata: {}
    }),
    retrieve: vi.fn().mockResolvedValue({
      id: 'cus_mock123',
      email: 'test@example.com',
      subscriptions: { data: [] }
    }),
    update: vi.fn().mockResolvedValue({
      id: 'cus_mock123',
      email: 'test@example.com'
    })
  }
  
  const mockSubscriptions = {
    create: vi.fn().mockResolvedValue({
      id: 'sub_mock123',
      customer: 'cus_mock123',
      status: 'active',
      items: { data: [{ price: { id: 'price_mock123' } }] }
    }),
    retrieve: vi.fn().mockResolvedValue({
      id: 'sub_mock123',
      status: 'active'
    }),
    update: vi.fn().mockResolvedValue({
      id: 'sub_mock123',
      status: 'active'
    }),
    cancel: vi.fn().mockResolvedValue({
      id: 'sub_mock123',
      status: 'canceled'
    })
  }
  
  const mockCheckout = {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: 'cs_mock123',
        url: 'https://checkout.stripe.com/mock',
        customer: 'cus_mock123'
      })
    }
  }
  
  const mockBillingPortal = {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: 'bps_mock123',
        url: 'https://billing.stripe.com/mock'
      })
    }
  }
  
  const mockWebhooks = {
    constructEvent: vi.fn().mockImplementation((payload, sig, secret) => {
      // Return mock event based on payload
      return {
        id: 'evt_mock123',
        type: 'checkout.session.completed',
        data: { object: JSON.parse(payload) }
      }
    })
  }
  
  return {
    customers: mockCustomers,
    subscriptions: mockSubscriptions,
    checkout: mockCheckout,
    billingPortal: mockBillingPortal,
    webhooks: mockWebhooks,
    prices: {
      list: vi.fn().mockResolvedValue({
        data: [
          { id: 'price_free', unit_amount: 0 },
          { id: 'price_pro', unit_amount: 2900 },
          { id: 'price_business', unit_amount: 9900 }
        ]
      })
    }
  } as unknown as Stripe
}

// Mock AI Service
export const createMockAIService = () => {
  const mockGenerate = vi.fn().mockImplementation(async ({ stream = false }) => {
    const mockContent = {
      sections: [
        {
          id: 'hero-1',
          type: 'hero',
          content: {
            title: 'Welcome to Your Business',
            subtitle: 'AI-generated content for your website'
          }
        }
      ]
    }
    
    if (stream) {
      // Mock streaming response
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify(mockContent)))
          controller.close()
        }
      })
      return { stream }
    }
    
    return { data: mockContent }
  })
  
  return {
    generate: mockGenerate,
    validatePrompt: vi.fn().mockReturnValue({ isValid: true }),
    getTierLimits: vi.fn().mockReturnValue({
      maxTokens: 10000,
      maxRequests: 100
    })
  }
}

// Mock OpenAI Client
export const createMockOpenAIClient = () => {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Mock AI response',
              role: 'assistant'
            }
          }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150
          }
        })
      }
    }
  }
}

// Mock Anthropic Client
export const createMockAnthropicClient = () => {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: 'Mock Claude response'
        }],
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      })
    }
  }
}

// Mock React Query Client
export const createMockQueryClient = () => {
  const queryCache = new Map()
  const mutationCache = new Map()
  
  return {
    getQueryData: vi.fn((key) => queryCache.get(JSON.stringify(key))),
    setQueryData: vi.fn((key, data) => {
      queryCache.set(JSON.stringify(key), data)
    }),
    invalidateQueries: vi.fn(),
    refetchQueries: vi.fn(),
    cancelQueries: vi.fn(),
    setMutationDefaults: vi.fn(),
    getMutationCache: vi.fn(() => mutationCache),
    clear: vi.fn(() => {
      queryCache.clear()
      mutationCache.clear()
    })
  }
}

// Mock Next.js Router
export const createMockRouter = (overrides = {}) => {
  return {
    pathname: '/',
    route: '/',
    query: {},
    asPath: '/',
    basePath: '',
    locale: 'en',
    locales: ['en', 'ar-eg', 'ar-sa', 'ar-ae', 'ar', 'fr', 'fr-ma', 'es', 'de'],
    defaultLocale: 'en',
    push: vi.fn().mockResolvedValue(true),
    replace: vi.fn().mockResolvedValue(true),
    reload: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
    beforePopState: vi.fn(),
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    },
    isFallback: false,
    isReady: true,
    isPreview: false,
    ...overrides
  }
}

// Export all mocks
export const mocks = {
  supabase: createMockSupabaseClient,
  stripe: createMockStripeClient,
  ai: createMockAIService,
  openai: createMockOpenAIClient,
  anthropic: createMockAnthropicClient,
  queryClient: createMockQueryClient,
  router: createMockRouter
}