/**
 * 🛡️ Server-Side Authentication Validation Tests
 * Tests for API middleware, server actions, and SSR auth patterns
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { 
  authenticateRequest, 
  withApiAuth, 
  authPresets,
  getCurrentUser,
  type AuthResult
} from '@/lib/auth-middleware'
import {
  signInWithPassword,
  sendMagicLink,
  changeEmail,
  checkSession,
  changePasswordWithVerification
} from '@/lib/actions/auth-actions'
import { 
  createAuthScenarioMock,
  AUTH_STATES,
  createServerAuthContext,
  mockAuthFlows,
  mockSecurityOperations
} from '../../utils/auth'
import { createMockUser, createMockSession } from '../../mocks/services'

// Mock Next.js server components
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClientNew: vi.fn()
}))

// Mock feature flags to enable Supabase
vi.mock('@/lib/feature-flags', () => ({
  FEATURE_FLAGS: {
    ENABLE_SUPABASE: true
  }
}))

// Import the mocked function
import { createServerSupabaseClientNew } from '@/lib/supabase'

describe('🛡️ Server-Side Auth Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set up default mock to return authenticated scenario
    vi.mocked(createServerSupabaseClientNew).mockResolvedValue(createAuthScenarioMock('AUTHENTICATED'))
  })
  
  describe('authenticateRequest - Core Auth Function', () => {
    it('should authenticate valid requests with getUser()', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/test')
      const result = await authenticateRequest(request)
      
      expect(result.success).toBe(true)
      expect(result.user).toBeTruthy()
      expect(result.user?.email).toBe('test@example.com')
      expect(result.error).toBeUndefined()
      
      // Verify it uses getUser() for security
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
    })
    
    it('should reject requests with tampered sessions', async () => {
      const mockSupabase = createAuthScenarioMock('TAMPERED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/test')
      const result = await authenticateRequest(request)
      
      expect(result.success).toBe(false)
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('AUTH_ERROR')
      expect(result.error?.message).toContain('Invalid JWT token')
    })
    
    it('should handle expired sessions correctly', async () => {
      const mockSupabase = createAuthScenarioMock('EXPIRED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/test')
      const result = await authenticateRequest(request)
      
      expect(result.success).toBe(false)
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('AUTH_ERROR')
      expect(result.error?.message).toContain('Session expired')
    })
    
    it('should handle unauthenticated requests', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/test')
      const result = await authenticateRequest(request)
      
      expect(result.success).toBe(false)
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('NO_USER')
    })
  })
  
  describe('withApiAuth Middleware', () => {
    const mockHandler = vi.fn(async (req, ctx) => {
      return NextResponse.json({ 
        success: true, 
        userId: ctx.user?.id 
      })
    })
    
    beforeEach(() => {
      mockHandler.mockClear()
    })
    
    it('should protect routes requiring authentication', async () => {
      const protectedHandler = withApiAuth(mockHandler, { requireAuth: true })
      
      // Test authenticated request
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/protected')
      const response = await protectedHandler(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.userId).toBeTruthy()
      expect(mockHandler).toHaveBeenCalledWith(request, { user: expect.any(Object) })
    })
    
    it('should reject unauthenticated requests to protected routes', async () => {
      const protectedHandler = withApiAuth(mockHandler, { requireAuth: true })
      
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/protected')
      const response = await protectedHandler(request)
      const data = await response.json()
      
      expect(response.status).toBe(401)
      expect(data.error).toBeTruthy()
      expect(data.code).toBe('NO_USER')
      expect(mockHandler).not.toHaveBeenCalled()
    })
    
    it('should enforce email verification when required', async () => {
      const verifiedHandler = withApiAuth(mockHandler, { 
        requireAuth: true,
        requireEmailVerified: true 
      })
      
      const mockSupabase = createAuthScenarioMock('UNVERIFIED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/verified-only')
      const response = await verifiedHandler(request)
      const data = await response.json()
      
      expect(response.status).toBe(403)
      expect(data.code).toBe('EMAIL_NOT_VERIFIED')
      expect(mockHandler).not.toHaveBeenCalled()
    })
    
    it('should enforce role-based access control', async () => {
      const adminHandler = withApiAuth(mockHandler, {
        requireAuth: true,
        allowedRoles: ['admin', 'super_admin']
      })
      
      // Create user without admin role
      const mockUser = createMockUser({ 
        user_metadata: { roles: ['user'] }
      })
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      })
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/admin')
      const response = await adminHandler(request)
      const data = await response.json()
      
      expect(response.status).toBe(403)
      expect(data.code).toBe('FORBIDDEN')
      expect(mockHandler).not.toHaveBeenCalled()
    })
    
    it('should apply rate limiting', async () => {
      const rateLimitedHandler = withApiAuth(mockHandler, {
        rateLimit: { windowMs: 1000, maxRequests: 2 }
      })
      
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/rate-limited', {
        headers: { 'x-forwarded-for': '192.168.1.1' }
      })
      
      // First two requests should pass
      let response = await rateLimitedHandler(request)
      expect(response.status).toBe(200)
      
      response = await rateLimitedHandler(request)
      expect(response.status).toBe(200)
      
      // Third request should be rate limited
      response = await rateLimitedHandler(request)
      const data = await response.json()
      
      expect(response.status).toBe(429)
      expect(data.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(response.headers.get('Retry-After')).toBe('1')
    })
  })
  
  describe('Auth Presets', () => {
    const mockHandler = vi.fn(async () => NextResponse.json({ success: true }))
    
    it('should have correct configuration for public endpoints', async () => {
      const publicHandler = authPresets.public(mockHandler)
      
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/public')
      const response = await publicHandler(request)
      
      expect(response.status).toBe(200)
      expect(mockHandler).toHaveBeenCalled()
    })
    
    it('should have correct configuration for authenticated endpoints', async () => {
      const authHandler = authPresets.authenticated(mockHandler)
      
      // Test with unauthenticated request
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/auth-required')
      const response = await authHandler(request)
      
      expect(response.status).toBe(401)
      expect(mockHandler).not.toHaveBeenCalled()
    })
    
    it('should have correct configuration for admin endpoints', async () => {
      const adminHandler = authPresets.admin(mockHandler)
      
      // Test with non-admin user
      const mockUser = createMockUser({ 
        email_confirmed_at: new Date().toISOString(),
        user_metadata: { roles: ['user'] }
      })
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      })
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/admin')
      const response = await adminHandler(request)
      
      expect(response.status).toBe(403)
      expect(mockHandler).not.toHaveBeenCalled()
    })
  })
  
  describe('Server Actions', () => {
    describe('signInWithPassword', () => {
      it('should successfully sign in with valid credentials', async () => {
        const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
        const user = createMockUser()
        const session = createMockSession()
        mockAuthFlows.loginSuccess(mockSupabase, user, session)
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await signInWithPassword('test@example.com', 'password123')
        
        expect(result.success).toBe(true)
        expect(result.tokens).toBeTruthy()
        expect(result.tokens?.access_token).toBe('mock-access-token')
        expect(result.error).toBeUndefined()
      })
      
      it('should handle invalid credentials', async () => {
        const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
        mockAuthFlows.loginInvalidCredentials(mockSupabase)
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await signInWithPassword('test@example.com', 'wrong-password')
        
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid email or password')
        expect(result.tokens).toBeUndefined()
      })
      
      it('should handle unconfirmed email', async () => {
        const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
        mockAuthFlows.loginEmailNotConfirmed(mockSupabase)
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await signInWithPassword('unverified@example.com', 'password123')
        
        expect(result.success).toBe(false)
        expect(result.error).toContain('check your email and click the confirmation link')
      })
    })
    
    describe('changePasswordWithVerification', () => {
      it('should change password after verifying current password', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        const user = createMockUser()
        const session = createMockSession()
        
        // Mock current password verification
        mockSupabase.auth.signInWithPassword.mockResolvedValue({
          data: { user, session },
          error: null
        })
        
        // Mock password update
        mockSecurityOperations.passwordChange(mockSupabase, true)
        mockSecurityOperations.globalSignOut(mockSupabase)
        
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await changePasswordWithVerification('current-password', 'new-password')
        
        expect(result.success).toBe(true)
        expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'current-password'
        })
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
          password: 'new-password'
        })
        expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
      })
      
      it('should reject incorrect current password', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        
        // Mock failed password verification
        mockSupabase.auth.signInWithPassword.mockResolvedValue({
          data: { user: null, session: null },
          error: { 
            message: 'Invalid login credentials',
            name: 'AuthApiError',
            __isAuthError: true
          } as any
        })
        
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await changePasswordWithVerification('wrong-password', 'new-password')
        
        expect(result.success).toBe(false)
        expect(result.error).toBe('Current password is incorrect')
        expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled()
      })
    })
    
    describe('changeEmail', () => {
      it('should change email and revoke all sessions', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        mockSecurityOperations.emailChange(mockSupabase, true)
        mockSecurityOperations.globalSignOut(mockSupabase)
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await changeEmail('newemail@example.com')
        
        expect(result.success).toBe(true)
        expect(result.data?.newEmail).toBe('newemail@example.com')
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
          email: 'newemail@example.com'
        })
        expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
      })
    })
    
    describe('checkSession', () => {
      it('should check session status using getSession', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await checkSession()
        
        expect(result.success).toBe(true)
        expect(result.data?.hasSession).toBe(true)
        
        // Note: This uses getSession which is appropriate for checking session existence
        expect(mockSupabase.auth.getSession).toHaveBeenCalled()
      })
    })
  })
  
  describe('getCurrentUser Helper', () => {
    it('should extract user from request using getUser', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/test')
      const user = await getCurrentUser(request)
      
      expect(user).toBeTruthy()
      expect(user?.email).toBe('test@example.com')
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
    })
    
    it('should return null for unauthenticated requests', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
      
      const request = new NextRequest('http://localhost:3000/api/test')
      const user = await getCurrentUser(request)
      
      expect(user).toBeNull()
    })
  })
})