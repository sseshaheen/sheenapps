/**
 * 🔐 Supabase getUser() vs getSession() Security Pattern Tests
 * Critical tests to ensure proper usage of Supabase auth methods
 * 
 * Security Context:
 * - getSession() only reads cookies (can be tampered)
 * - getUser() validates tokens with Supabase Auth server
 * - Misuse can lead to security vulnerabilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { 
  createAuthScenarioMock, 
  AUTH_STATES,
  authAssertions,
  AUTH_SECURITY_PATTERNS
} from '../../utils/auth'
import { createMockUser, createMockSession } from '../../mocks/services'

describe('🔐 Supabase Auth Security Patterns', () => {
  let mockSupabase: ReturnType<typeof createAuthScenarioMock>
  
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  describe('getSession() vs getUser() Usage Patterns', () => {
    it('should document correct use cases for getSession()', () => {
      // This test documents the correct usage patterns
      expect(AUTH_SECURITY_PATTERNS.GET_SESSION_USE_CASES).toEqual([
        'show/hide UI elements',
        'client-side redirects',
        'display user info',
        'check if logged in for UI'
      ])
    })
    
    it('should document correct use cases for getUser()', () => {
      // This test documents the correct usage patterns
      expect(AUTH_SECURITY_PATTERNS.GET_USER_USE_CASES).toEqual([
        'API route authentication',
        'server-side data fetching',
        'permission checks',
        'mutations and writes',
        'security-critical operations'
      ])
    })
  })
  
  describe('Security Vulnerability: Tampered Sessions', () => {
    it('should detect tampered sessions where getSession() returns data but getUser() fails', async () => {
      // Scenario: Malicious user tampers with cookies
      mockSupabase = createAuthScenarioMock('TAMPERED')
      
      // UI check using getSession (vulnerable to tampering)
      const sessionResult = await mockSupabase.auth.getSession()
      expect(sessionResult.data.session).toBeTruthy() // Session appears valid
      
      // Security check using getUser (catches tampering)
      const userResult = await mockSupabase.auth.getUser()
      expect(userResult.error).toBeTruthy()
      expect(userResult.error?.message).toContain('Invalid JWT token')
      expect(userResult.data.user).toBeNull()
      
      // This demonstrates why getUser() is required for security
    })
    
    it('should handle expired sessions correctly', async () => {
      mockSupabase = createAuthScenarioMock('EXPIRED')
      
      const sessionResult = await mockSupabase.auth.getSession()
      expect(sessionResult.error).toBeTruthy()
      expect(sessionResult.error?.message).toContain('Session expired')
      
      const userResult = await mockSupabase.auth.getUser()
      expect(userResult.error).toBeTruthy()
      expect(userResult.data.user).toBeNull()
    })
  })
  
  describe('UI Operations (Safe for getSession)', () => {
    beforeEach(() => {
      mockSupabase = createAuthScenarioMock('AUTHENTICATED')
    })
    
    it('should use getSession() for showing/hiding UI elements', async () => {
      // Simulating a header component checking auth status
      const checkAuthForUI = async () => {
        const { data: { session } } = await mockSupabase.auth.getSession()
        return {
          showUserMenu: !!session,
          showLoginButton: !session
        }
      }
      
      const uiState = await checkAuthForUI()
      expect(uiState.showUserMenu).toBe(true)
      expect(uiState.showLoginButton).toBe(false)
      
      // Verify only getSession was called
      expect(mockSupabase.auth.getSession).toHaveBeenCalled()
      expect(mockSupabase.auth.getUser).not.toHaveBeenCalled()
    })
    
    it('should use getSession() for client-side redirects', async () => {
      // Simulating a client-side auth guard
      const clientAuthGuard = async () => {
        const { data: { session } } = await mockSupabase.auth.getSession()
        if (!session) {
          return { redirect: '/login' }
        }
        return { redirect: null }
      }
      
      const result = await clientAuthGuard()
      expect(result.redirect).toBeNull()
      
      // Verify only getSession was called
      expect(mockSupabase.auth.getSession).toHaveBeenCalled()
      expect(mockSupabase.auth.getUser).not.toHaveBeenCalled()
    })
  })
  
  describe('Security-Critical Operations (Must use getUser)', () => {
    beforeEach(() => {
      mockSupabase = createAuthScenarioMock('AUTHENTICATED')
    })
    
    it('should use getUser() for API route authentication', async () => {
      // Simulating API route auth middleware
      const apiAuthMiddleware = async () => {
        const { data: { user }, error } = await mockSupabase.auth.getUser()
        
        if (error || !user) {
          return { 
            authenticated: false, 
            statusCode: 401,
            error: 'Unauthorized'
          }
        }
        
        return { 
          authenticated: true, 
          userId: user.id,
          email: user.email 
        }
      }
      
      const result = await apiAuthMiddleware()
      expect(result.authenticated).toBe(true)
      expect(result.userId).toBeDefined()
      
      // Verify getUser was called for security
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
      expect(mockSupabase.auth.getSession).not.toHaveBeenCalled()
    })
    
    it('should use getUser() for data mutations', async () => {
      // Simulating a data mutation operation
      const updateUserProfile = async (profileData: any) => {
        // CRITICAL: Must validate with getUser before mutations
        const { data: { user }, error } = await mockSupabase.auth.getUser()
        
        if (error || !user) {
          throw new Error('Unauthorized: Invalid session')
        }
        
        // Proceed with mutation
        return {
          success: true,
          userId: user.id,
          updated: profileData
        }
      }
      
      const result = await updateUserProfile({ name: 'Test User' })
      expect(result.success).toBe(true)
      
      // Verify security check was performed
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
      authAssertions.assertSecureOperation(mockSupabase, 'write')
    })
    
    it('should use getUser() for permission checks', async () => {
      // Simulating admin permission check
      const checkAdminPermission = async () => {
        const { data: { user }, error } = await mockSupabase.auth.getUser()
        
        if (error || !user) {
          return { isAdmin: false, reason: 'Not authenticated' }
        }
        
        // Check user metadata for admin role
        const roles = user.user_metadata?.roles || []
        return { 
          isAdmin: roles.includes('admin'),
          userId: user.id
        }
      }
      
      const result = await checkAdminPermission()
      expect(result.userId).toBeDefined()
      
      // Verify proper security check
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
    })
  })
  
  describe('Common Security Mistakes', () => {
    it('❌ WRONG: Using getSession() for data access', async () => {
      mockSupabase = createAuthScenarioMock('TAMPERED')
      
      // This is WRONG and vulnerable
      const insecureDataAccess = async () => {
        const { data: { session } } = await mockSupabase.auth.getSession()
        if (session) {
          // ❌ DON'T DO THIS - session can be tampered
          return { 
            data: 'sensitive user data',
            userId: session.user.id 
          }
        }
        return null
      }
      
      // This would return data even with tampered session
      const result = await insecureDataAccess()
      expect(result).toBeTruthy() // Data leaked!
      
      // The secure version would fail
      const { data: { user } } = await mockSupabase.auth.getUser()
      expect(user).toBeNull() // Properly rejected
    })
    
    it('✅ CORRECT: Using getUser() for data access', async () => {
      mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      // This is CORRECT and secure
      const secureDataAccess = async () => {
        const { data: { user }, error } = await mockSupabase.auth.getUser()
        
        if (error || !user) {
          return { error: 'Unauthorized', data: null }
        }
        
        return { 
          data: 'sensitive user data',
          userId: user.id 
        }
      }
      
      const result = await secureDataAccess()
      expect(result.data).toBeTruthy()
      expect(result.error).toBeUndefined()
    })
  })
  
  describe('Mixed Operations', () => {
    it('should use appropriate methods for different operations in same flow', async () => {
      mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      // Simulating a page that does both UI and data operations
      const pageLoad = async () => {
        // 1. UI Check - getSession is fine
        const { data: { session } } = await mockSupabase.auth.getSession()
        const uiState = {
          showUserMenu: !!session,
          userEmail: session?.user.email
        }
        
        // 2. Data Fetch - must use getUser
        const { data: { user }, error } = await mockSupabase.auth.getUser()
        if (error || !user) {
          return { uiState, userData: null, error: 'Unauthorized' }
        }
        
        // Fetch user data
        const userData = {
          profile: `Profile data for ${user.id}`,
          settings: `Settings for ${user.id}`
        }
        
        return { uiState, userData, error: null }
      }
      
      const result = await pageLoad()
      expect(result.uiState.showUserMenu).toBe(true)
      expect(result.userData).toBeTruthy()
      
      // Verify both methods were used appropriately
      expect(mockSupabase.auth.getSession).toHaveBeenCalledTimes(1)
      expect(mockSupabase.auth.getUser).toHaveBeenCalledTimes(1)
    })
  })
  
  describe('Email Verification Requirements', () => {
    it('should check email verification for sensitive operations', async () => {
      mockSupabase = createAuthScenarioMock('UNVERIFIED')
      
      const performSensitiveOperation = async () => {
        const { data: { user }, error } = await mockSupabase.auth.getUser()
        
        if (error || !user) {
          return { error: 'Not authenticated' }
        }
        
        // Check email verification
        if (!user.email_confirmed_at) {
          return { error: 'Email verification required' }
        }
        
        return { success: true, data: 'Sensitive operation completed' }
      }
      
      const result = await performSensitiveOperation()
      expect(result.error).toBe('Email verification required')
      expect(result.success).toBeUndefined()
    })
  })
})