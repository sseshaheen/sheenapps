/**
 * 🔐 Authentication Test Utilities
 * Comprehensive mocks and helpers for testing auth flows and security patterns
 */

import { vi } from 'vitest'
import type { User, Session, AuthResponse, AuthError } from '@supabase/supabase-js'
import { createMockSupabaseClient, createMockUser, createMockSession } from '../mocks/services'

// 🔐 Auth Security Patterns
export const AUTH_SECURITY_PATTERNS = {
  // getSession() only reads cookies - can be tampered by malicious users
  // Safe for UI decisions but NOT for privileged operations
  GET_SESSION_USE_CASES: [
    'show/hide UI elements',
    'client-side redirects',
    'display user info',
    'check if logged in for UI'
  ],
  
  // getUser() re-validates the access token with Supabase Auth
  // Required for server-side data loading/mutations
  GET_USER_USE_CASES: [
    'API route authentication',
    'server-side data fetching',
    'permission checks',
    'mutations and writes',
    'security-critical operations'
  ]
}

// 🧪 Mock Auth States
export const AUTH_STATES = {
  // Authenticated with valid session
  AUTHENTICATED: {
    user: createMockUser({ email_confirmed_at: new Date().toISOString() }),
    session: createMockSession()
  },
  
  // Authenticated but email not verified
  UNVERIFIED: {
    user: createMockUser({ email_confirmed_at: null }),
    session: createMockSession()
  },
  
  // Session exists but expired
  EXPIRED: {
    user: null,
    session: createMockSession({ 
      expires_at: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
    })
  },
  
  // No session
  UNAUTHENTICATED: {
    user: null,
    session: null
  },
  
  // Tampered session (getSession returns data but getUser fails)
  TAMPERED: {
    sessionData: createMockSession(),
    getUserError: new Error('Invalid JWT token')
  }
}

// 🎭 Auth Mock Scenarios
export const createAuthScenarioMock = (scenario: keyof typeof AUTH_STATES) => {
  const mockClient = createMockSupabaseClient()
  
  switch (scenario) {
    case 'AUTHENTICATED':
      vi.mocked(mockClient.auth.getSession).mockResolvedValue({
        data: { session: AUTH_STATES.AUTHENTICATED.session },
        error: null
      })
      vi.mocked(mockClient.auth.getUser).mockResolvedValue({
        data: { user: AUTH_STATES.AUTHENTICATED.user },
        error: null
      })
      break
      
    case 'UNVERIFIED':
      vi.mocked(mockClient.auth.getSession).mockResolvedValue({
        data: { session: AUTH_STATES.UNVERIFIED.session },
        error: null
      })
      vi.mocked(mockClient.auth.getUser).mockResolvedValue({
        data: { user: AUTH_STATES.UNVERIFIED.user },
        error: null
      })
      break
      
    case 'EXPIRED':
      vi.mocked(mockClient.auth.getSession).mockResolvedValue({
        data: { session: AUTH_STATES.EXPIRED.session },
        error: { 
          message: 'Session expired',
          name: 'SessionExpiredError',
          __isAuthError: true,
          code: 'session_expired',
          status: 401
        } as AuthError
      })
      vi.mocked(mockClient.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Session expired',
          name: 'SessionExpiredError',
          __isAuthError: true,
          code: 'session_expired',
          status: 401
        } as AuthError
      })
      break
      
    case 'UNAUTHENTICATED':
      vi.mocked(mockClient.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null
      })
      vi.mocked(mockClient.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null
      })
      break
      
    case 'TAMPERED':
      // getSession returns session (reading cookies)
      vi.mocked(mockClient.auth.getSession).mockResolvedValue({
        data: { session: AUTH_STATES.TAMPERED.sessionData },
        error: null
      })
      // getUser fails (server validation)
      vi.mocked(mockClient.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Invalid JWT token',
          name: 'JWTInvalidError',
          __isAuthError: true,
          code: 'invalid_jwt',
          status: 401
        } as AuthError
      })
      break
  }
  
  return mockClient
}

// 🔄 Session Refresh Mock
export const mockSessionRefresh = (mockClient: any, newSession: Session) => {
  vi.mocked(mockClient.auth.refreshSession).mockResolvedValue({
    data: { session: newSession },
    error: null
  })
}

// 🚪 Auth Flow Mocks
export const mockAuthFlows = {
  // Successful signup
  signupSuccess: (mockClient: any, user: User) => {
    vi.mocked(mockClient.auth.signUp).mockResolvedValue({
      data: { user, session: null },
      error: null
    })
  },
  
  // Signup with existing email
  signupEmailExists: (mockClient: any) => {
    vi.mocked(mockClient.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: {
        message: 'User already registered',
        name: 'AuthApiError',
        status: 422,
        code: 'signup_disabled',
        __isAuthError: true
      } as AuthError
    })
  },
  
  // Successful login
  loginSuccess: (mockClient: any, user: User, session: Session) => {
    vi.mocked(mockClient.auth.signInWithPassword).mockResolvedValue({
      data: { user, session },
      error: null
    })
  },
  
  // Invalid credentials
  loginInvalidCredentials: (mockClient: any) => {
    vi.mocked(mockClient.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: {
        message: 'Invalid login credentials',
        name: 'AuthApiError',
        status: 400,
        code: 'invalid_credentials',
        __isAuthError: true
      } as AuthError
    })
  },
  
  // Email not confirmed
  loginEmailNotConfirmed: (mockClient: any) => {
    vi.mocked(mockClient.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: {
        message: 'Email not confirmed',
        name: 'AuthApiError',
        status: 400,
        code: 'email_not_confirmed',
        __isAuthError: true
      } as AuthError
    })
  },
  
  // Password reset success
  passwordResetSuccess: (mockClient: any) => {
    vi.mocked(mockClient.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: null
    })
  },
  
  // OAuth redirect
  oauthRedirect: (mockClient: any, provider: 'google' | 'github') => {
    vi.mocked(mockClient.auth.signInWithOAuth).mockResolvedValue({
      data: { url: `https://example.supabase.co/auth/v1/authorize?provider=${provider}`, provider },
      error: null
    })
  }
}

// 🔐 Security Operation Mocks
export const mockSecurityOperations = {
  // Global session revocation
  globalSignOut: (mockClient: any) => {
    vi.mocked(mockClient.auth.signOut).mockImplementation(async (options?: { scope?: 'global' | 'local' }) => {
      if (options?.scope === 'global') {
        // Simulate global signout
        return { error: null }
      }
      // Local signout
      return { error: null }
    })
  },
  
  // Password change with session revocation
  passwordChange: (mockClient: any, success = true) => {
    if (success) {
      vi.mocked(mockClient.auth.updateUser).mockResolvedValue({
        data: { user: createMockUser() },
        error: null
      })
    } else {
      vi.mocked(mockClient.auth.updateUser).mockResolvedValue({
        data: { user: null },
        error: {
          message: 'New password should be different from the old password',
          name: 'AuthApiError',
          code: 'same_password',
          status: 422,
          __isAuthError: true
        } as AuthError
      })
    }
  },
  
  // Email change
  emailChange: (mockClient: any, success = true) => {
    if (success) {
      vi.mocked(mockClient.auth.updateUser).mockResolvedValue({
        data: { user: createMockUser() },
        error: null
      })
    } else {
      vi.mocked(mockClient.auth.updateUser).mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Email address already used',
          name: 'AuthApiError',
          code: 'email_address_invalid',
          status: 422,
          __isAuthError: true
        } as AuthError
      })
    }
  }
}

// 🛡️ Protected Route Test Helper
export const testProtectedRoute = async (
  routeHandler: (req: Request) => Promise<Response>,
  options: {
    authenticated?: boolean
    requireEmailVerified?: boolean
    allowedRoles?: string[]
  } = {}
) => {
  const scenarios = [
    { name: 'unauthenticated', shouldPass: false, authState: 'UNAUTHENTICATED' },
    { name: 'authenticated', shouldPass: options.authenticated !== false, authState: 'AUTHENTICATED' },
    { name: 'unverified email', shouldPass: !options.requireEmailVerified, authState: 'UNVERIFIED' },
    { name: 'tampered session', shouldPass: false, authState: 'TAMPERED' }
  ]
  
  const results = []
  
  for (const scenario of scenarios) {
    const mockRequest = new Request('http://localhost:3000/api/test')
    const response = await routeHandler(mockRequest)
    
    results.push({
      scenario: scenario.name,
      status: response.status,
      passed: scenario.shouldPass ? response.ok : !response.ok
    })
  }
  
  return results
}

// 🔄 Auth State Change Listener Mock
export const mockAuthStateChangeListener = (mockClient: any) => {
  const listeners: ((event: string, session: Session | null) => void)[] = []
  
  vi.mocked(mockClient.auth.onAuthStateChange).mockImplementation((callback: any) => {
    listeners.push(callback)
    
    // Return unsubscribe function
    return {
      data: {
        subscription: {
          unsubscribe: vi.fn(() => {
            const index = listeners.indexOf(callback)
            if (index > -1) listeners.splice(index, 1)
          })
        }
      }
    }
  })
  
  // Helper to trigger auth state changes
  const triggerAuthStateChange = (event: string, session: Session | null) => {
    listeners.forEach(listener => listener(event, session))
  }
  
  return { triggerAuthStateChange, getListenerCount: () => listeners.length }
}

// 🧪 Auth Test Assertions
export const authAssertions = {
  // Assert proper getUser vs getSession usage
  assertSecureOperation: (mockClient: any, operationType: 'read' | 'write') => {
    if (operationType === 'write') {
      expect(mockClient.auth.getUser).toHaveBeenCalled()
      expect(mockClient.auth.getSession).not.toHaveBeenCalled()
    }
  },
  
  // Assert session handling
  assertSessionValid: (session: Session | null) => {
    expect(session).toBeTruthy()
    expect(session!.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000))
  },
  
  // Assert auth error handling
  assertAuthError: (error: any, expectedMessage?: string) => {
    expect(error).toBeTruthy()
    expect(error.__isAuthError).toBe(true)
    if (expectedMessage) {
      expect(error.message).toContain(expectedMessage)
    }
  }
}

// 🔐 Server-Side Auth Test Helper
export const createServerAuthContext = (user: User | null = null) => {
  return {
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn()
    },
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'test-agent'
    }),
    user
  }
}

// 📊 Auth Metrics Mock
export const mockAuthMetrics = () => {
  const metrics = {
    loginAttempts: 0,
    loginSuccesses: 0,
    loginFailures: 0,
    sessionRefreshes: 0,
    logouts: 0
  }
  
  return {
    metrics,
    recordLogin: (success: boolean) => {
      metrics.loginAttempts++
      if (success) metrics.loginSuccesses++
      else metrics.loginFailures++
    },
    recordSessionRefresh: () => metrics.sessionRefreshes++,
    recordLogout: () => metrics.logouts++
  }
}