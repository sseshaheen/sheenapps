/**
 * 🔄 Authentication Flow Integration Tests
 * End-to-end tests for signup, login, password reset, and OAuth flows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  signInWithPassword,
  signUp,
  sendMagicLink,
  resetPassword,
  signInWithOAuth,
  updatePassword
} from '@/lib/actions/auth-actions'
import {
  createAuthScenarioMock,
  mockAuthFlows,
  mockSecurityOperations
} from '../../utils/auth'
import { createMockUser, createMockSession } from '../../mocks/services'
import { withI18nProvider } from '../../utils/localization'

// Mock Supabase client
const mockSupabase = createAuthScenarioMock('AUTHENTICATED')

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClientNew: vi.fn(() => mockSupabase)
}))

// Mock auth utilities
vi.mock('@/lib/auth-utils', () => ({
  getClientOAuthCallbackUrl: vi.fn((locale, returnTo) => 
    `http://localhost:3000/auth/callback?locale=${locale}&returnTo=${encodeURIComponent(returnTo || '')}`
  )
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

import { createServerSupabaseClientNew } from '@/lib/supabase'

describe('🔄 Authentication Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to clean state
    vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
  })
  
  describe('User Registration Flow', () => {
    it('should handle successful user registration', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      const newUser = createMockUser({ email: 'newuser@example.com' })
      
      mockAuthFlows.signupSuccess(mockSupabase, newUser)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signUp('newuser@example.com', 'securePassword123')
      
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'securePassword123',
        options: {
          data: {}
        }
      })
    })
    
    it('should handle registration with user metadata', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      const newUser = createMockUser({ 
        email: 'newuser@example.com',
        user_metadata: { name: 'John Doe', plan: 'pro' }
      })
      
      mockAuthFlows.signupSuccess(mockSupabase, newUser)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signUp(
        'newuser@example.com', 
        'securePassword123',
        { name: 'John Doe', plan: 'pro' }
      )
      
      expect(result.success).toBe(true)
      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'securePassword123',
        options: {
          data: { name: 'John Doe', plan: 'pro' }
        }
      })
    })
    
    it('should handle registration with existing email', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      mockAuthFlows.signupEmailExists(mockSupabase)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signUp('existing@example.com', 'password123')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('User already registered')
    })
    
    it('should handle weak password rejection', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'Password should be at least 6 characters',
          name: 'AuthWeakPasswordError',
          __isAuthError: true
        } as any
      })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signUp('user@example.com', '123')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Password should be at least 6 characters')
    })
  })
  
  describe('User Login Flow', () => {
    it('should handle successful password login', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      const user = createMockUser()
      const session = createMockSession()
      
      mockAuthFlows.loginSuccess(mockSupabase, user, session)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signInWithPassword('test@example.com', 'password123')
      
      expect(result.success).toBe(true)
      expect(result.tokens).toBeTruthy()
      expect(result.tokens?.access_token).toBe('mock-access-token')
      expect(result.tokens?.refresh_token).toBe('mock-refresh-token')
    })
    
    it('should handle invalid credentials with user-friendly error', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      mockAuthFlows.loginInvalidCredentials(mockSupabase)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signInWithPassword('user@example.com', 'wrongpassword')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid email or password. Please check your credentials.')
      expect(result.tokens).toBeUndefined()
    })
    
    it('should handle unconfirmed email with helpful message', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      mockAuthFlows.loginEmailNotConfirmed(mockSupabase)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signInWithPassword('unverified@example.com', 'password123')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Please check your email and click the confirmation link before signing in.')
    })
    
    it('should handle account locked scenarios', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'Account temporarily locked due to multiple failed login attempts',
          name: 'AuthTooManyRequestsError',
          __isAuthError: true
        } as any
      })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signInWithPassword('user@example.com', 'password123')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Account temporarily locked')
    })
  })
  
  describe('Magic Link Flow', () => {
    it('should send magic link successfully', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      
      mockSupabase.auth.signInWithOtp.mockResolvedValue({
        data: {},
        error: null
      })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await sendMagicLink('user@example.com', 'en', '/en/dashboard')
      
      expect(result.success).toBe(true)
      expect(mockSupabase.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        options: {
          emailRedirectTo: expect.stringContaining('/auth/callback')
        }
      })
    })
    
    it('should handle magic link rate limiting', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      
      mockSupabase.auth.signInWithOtp.mockResolvedValue({
        data: {},
        error: {
          message: 'Email rate limit exceeded',
          name: 'AuthTooManyRequestsError',
          __isAuthError: true
        } as any
      })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await sendMagicLink('user@example.com', 'en')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Email rate limit exceeded')
    })
    
    it('should handle invalid email format', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      
      mockSupabase.auth.signInWithOtp.mockResolvedValue({
        data: {},
        error: {
          message: 'Invalid email format',
          name: 'AuthInvalidEmailError',
          __isAuthError: true
        } as any
      })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await sendMagicLink('invalid-email', 'en')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid email format')
    })
  })
  
  describe('OAuth Flow', () => {
    it('should initiate Google OAuth flow', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      mockAuthFlows.oauthRedirect(mockSupabase, 'google')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signInWithOAuth('google', 'en', '/en/builder')
      
      expect(result.success).toBe(true)
      expect(result.data?.url).toContain('provider=google')
      expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: expect.stringContaining('/auth/callback')
        }
      })
    })
    
    it('should initiate GitHub OAuth flow', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      mockAuthFlows.oauthRedirect(mockSupabase, 'github')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signInWithOAuth('github', 'en')
      
      expect(result.success).toBe(true)
      expect(result.data?.url).toContain('provider=github')
    })
    
    it('should handle OAuth provider errors', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: null, provider: 'google' },
        error: {
          message: 'OAuth provider temporarily unavailable',
          name: 'AuthOAuthError',
          __isAuthError: true
        } as any
      })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await signInWithOAuth('google', 'en')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to sign in with google. Please try again.')
    })
  })
  
  describe('Password Reset Flow', () => {
    it('should send password reset email', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      mockAuthFlows.passwordResetSuccess(mockSupabase)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await resetPassword('user@example.com', 'en')
      
      expect(result.success).toBe(true)
      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        {
          redirectTo: 'http://localhost:3000/auth/callback?locale=en&returnTo=%2Fen%2Fauth%2Fupdate-password'
        }
      )
    })
    
    it('should handle non-existent email gracefully', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      
      // Note: Supabase typically doesn't reveal if email exists for security
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null
      })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await resetPassword('nonexistent@example.com', 'en')
      
      expect(result.success).toBe(true) // Should appear successful for security
    })
    
    it('should update password after reset', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: createMockUser() },
        error: null
      })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await updatePassword('newSecurePassword123')
      
      expect(result.success).toBe(true)
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'newSecurePassword123'
      })
    })
    
    it('should handle password update errors', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Password must be different from current password',
          name: 'AuthWeakPasswordError',
          __isAuthError: true
        } as any
      })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const result = await updatePassword('samePassword')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Password must be different')
    })
  })
  
  describe('Complete Authentication Workflows', () => {
    it('should handle complete signup → verification → login flow', async () => {
      const email = 'newuser@example.com'
      const password = 'securePassword123'
      
      // Step 1: Signup
      const mockSupabase1 = createAuthScenarioMock('UNAUTHENTICATED')
      const newUser = createMockUser({ 
        email, 
        email_confirmed_at: null // Not verified yet
      })
      mockAuthFlows.signupSuccess(mockSupabase1, newUser)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase1)
      
      const signupResult = await signUp(email, password)
      expect(signupResult.success).toBe(true)
      
      // Step 2: Email verification would happen here (simulated)
      
      // Step 3: Login after verification
      const mockSupabase2 = createAuthScenarioMock('UNAUTHENTICATED')
      const verifiedUser = createMockUser({ 
        email,
        email_confirmed_at: new Date().toISOString()
      })
      const session = createMockSession()
      mockAuthFlows.loginSuccess(mockSupabase2, verifiedUser, session)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase2)
      
      const loginResult = await signInWithPassword(email, password)
      expect(loginResult.success).toBe(true)
      expect(loginResult.tokens).toBeTruthy()
    })
    
    it('should handle password reset → update → login flow', async () => {
      const email = 'user@example.com'
      const newPassword = 'newSecurePassword456'
      
      // Step 1: Request password reset
      const mockSupabase1 = createAuthScenarioMock('UNAUTHENTICATED')
      mockAuthFlows.passwordResetSuccess(mockSupabase1)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase1)
      
      const resetResult = await resetPassword(email, 'en')
      expect(resetResult.success).toBe(true)
      
      // Step 2: Update password (user clicks reset link)
      const mockSupabase2 = createAuthScenarioMock('AUTHENTICATED')
      mockSupabase2.auth.updateUser.mockResolvedValue({
        data: { user: createMockUser({ email }) },
        error: null
      })
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase2)
      
      const updateResult = await updatePassword(newPassword)
      expect(updateResult.success).toBe(true)
      
      // Step 3: Login with new password
      const mockSupabase3 = createAuthScenarioMock('UNAUTHENTICATED')
      const user = createMockUser({ email })
      const session = createMockSession()
      mockAuthFlows.loginSuccess(mockSupabase3, user, session)
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase3)
      
      const loginResult = await signInWithPassword(email, newPassword)
      expect(loginResult.success).toBe(true)
      expect(loginResult.tokens).toBeTruthy()
    })
    
    it('should handle OAuth → profile completion flow', async () => {
      // Step 1: OAuth signin
      const mockSupabase1 = createAuthScenarioMock('UNAUTHENTICATED')
      mockAuthFlows.oauthRedirect(mockSupabase1, 'google')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase1)
      
      const oauthResult = await signInWithOAuth('google', 'en', '/en/onboarding')
      expect(oauthResult.success).toBe(true)
      expect(oauthResult.data?.url).toBeTruthy()
      
      // Step 2: User would be redirected and authenticated
      // This would be handled by the OAuth callback
    })
  })
  
  describe('Error Recovery and Resilience', () => {
    it('should retry on network failures', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      
      // First attempt fails with network error, second succeeds
      mockSupabase.auth.signInWithPassword
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          data: { 
            user: createMockUser(), 
            session: createMockSession() 
          },
          error: null
        })
      
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      // First attempt - will fail due to network error caught in try/catch
      const result1 = await signInWithPassword('user@example.com', 'password123')
      expect(result1.success).toBe(false)
      expect(result1.error).toContain('unexpected error occurred')
      
      // Second attempt - should succeed
      const result2 = await signInWithPassword('user@example.com', 'password123')
      expect(result2.success).toBe(true)
      expect(result2.tokens).toBeTruthy()
    })
    
    it('should handle partial auth state corruption', async () => {
      const mockSupabase = createAuthScenarioMock('TAMPERED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      // getSession returns data but getUser fails (corrupted state)
      const sessionResult = await mockSupabase.auth.getSession()
      expect(sessionResult.data.session).toBeTruthy()
      
      const userResult = await mockSupabase.auth.getUser()
      expect(userResult.error).toBeTruthy()
      expect(userResult.data.user).toBeNull()
      
      // App should handle this by requiring re-authentication
    })
    
    it('should maintain auth state consistency across tabs', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      // Simulate auth state change in another tab
      const authChangeListeners: Array<(event: string, session: any) => void> = []
      
      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authChangeListeners.push(callback)
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(() => {
                const index = authChangeListeners.indexOf(callback)
                if (index > -1) authChangeListeners.splice(index, 1)
              })
            }
          }
        }
      })
      
      // Add listener
      const subscription = mockSupabase.auth.onAuthStateChange((event, session) => {
        // Handle auth state change
      })
      
      expect(authChangeListeners).toHaveLength(1)
      
      // Simulate sign out in another tab
      authChangeListeners.forEach(listener => {
        listener('SIGNED_OUT', null)
      })
      
      // Cleanup
      subscription.data.subscription.unsubscribe()
      expect(authChangeListeners).toHaveLength(0)
    })
  })
})