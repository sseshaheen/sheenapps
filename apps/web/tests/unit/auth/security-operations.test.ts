/**
 * 🔐 Security-Critical Operation Tests
 * Tests for password changes, email changes, and other security-sensitive operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  changePasswordWithVerification,
  changeEmail,
  updatePassword
} from '@/lib/actions/auth-actions'
import {
  revokeAllSessions,
  changePasswordSecurely,
  changeEmailSecurely,
  detectSuspiciousActivity
} from '@/lib/auth-security'
import {
  createAuthScenarioMock,
  mockSecurityOperations
} from '../../utils/auth'
import { createMockUser, createMockSession } from '../../mocks/services'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

// Mock Supabase client
const mockSupabase = createAuthScenarioMock('AUTHENTICATED')

vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => mockSupabase),
  createServerSupabaseClientNew: vi.fn(() => mockSupabase)
}))

import { createServerSupabaseClientNew, createClient } from '@/lib/supabase'
import { logger } from '@/utils/logger'

describe('🔐 Security-Critical Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to authenticated state
    const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
    vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
    vi.mocked(createClient).mockReturnValue(mockSupabase)
  })
  
  describe('Password Change Operations', () => {
    describe('changePasswordWithVerification (Server Action)', () => {
      it('should verify current password before changing', async () => {
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
        
        const result = await changePasswordWithVerification('current-password', 'new-secure-password')
        
        expect(result.success).toBe(true)
        
        // Verify security flow
        expect(mockSupabase.auth.getUser).toHaveBeenCalled() // Get current user
        expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'current-password'
        })
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
          password: 'new-secure-password'
        })
        expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
      })
      
      it('should reject incorrect current password', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        
        // Mock failed current password verification
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
        
        // Should not update password if verification fails
        expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled()
        expect(mockSupabase.auth.signOut).not.toHaveBeenCalled()
      })
      
      it('should handle unauthenticated users', async () => {
        const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await changePasswordWithVerification('current-password', 'new-password')
        
        expect(result.success).toBe(false)
        expect(result.error).toBe('Authentication required. Please sign in again.')
      })
      
      it('should handle password update failures', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        const user = createMockUser()
        const session = createMockSession()
        
        // Mock successful verification
        mockSupabase.auth.signInWithPassword.mockResolvedValue({
          data: { user, session },
          error: null
        })
        
        // Mock failed password update
        mockSupabase.auth.updateUser.mockResolvedValue({
          data: { user: null },
          error: {
            message: 'New password should be different from the old password',
            name: 'AuthApiError',
            __isAuthError: true
          } as any
        })
        
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await changePasswordWithVerification('current-password', 'current-password')
        
        expect(result.success).toBe(false)
        expect(result.error).toContain('New password should be different')
      })
    })
    
    describe('changePasswordSecurely (Security Module)', () => {
      it('should change password and revoke all sessions', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        mockSecurityOperations.passwordChange(mockSupabase, true)
        mockSecurityOperations.globalSignOut(mockSupabase)
        vi.mocked(createClient).mockReturnValue(mockSupabase)
        
        const result = await changePasswordSecurely('old-password', 'new-password')
        
        expect(result.success).toBe(true)
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
          password: 'new-password'
        })
        expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
      })
      
      it('should continue even if session revocation fails', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        mockSecurityOperations.passwordChange(mockSupabase, true)
        
        // Mock session revocation failure
        mockSupabase.auth.signOut.mockResolvedValue({
          error: {
            message: 'Failed to revoke sessions',
            name: 'NetworkError',
            __isAuthError: true
          } as any
        })
        
        vi.mocked(createClient).mockReturnValue(mockSupabase)
        
        const result = await changePasswordSecurely('old-password', 'new-password')
        
        expect(result.success).toBe(true) // Password change still succeeds
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Password changed but session revocation failed')
        )
      })
    })
    
    describe('updatePassword (Simple Update)', () => {
      it('should update password for authenticated users', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        mockSecurityOperations.passwordChange(mockSupabase, true)
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await updatePassword('new-secure-password')
        
        expect(result.success).toBe(true)
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
          password: 'new-secure-password'
        })
      })
      
      it('should handle weak password rejection', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        
        mockSupabase.auth.updateUser.mockResolvedValue({
          data: { user: null },
          error: {
            message: 'Password should be at least 8 characters',
            name: 'AuthWeakPasswordError',
            __isAuthError: true
          } as any
        })
        
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await updatePassword('weak')
        
        expect(result.success).toBe(false)
        expect(result.error).toContain('Password should be at least 8 characters')
      })
    })
  })
  
  describe('Email Change Operations', () => {
    describe('changeEmail (Server Action)', () => {
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
      
      it('should handle email already in use', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        mockSecurityOperations.emailChange(mockSupabase, false)
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await changeEmail('existing@example.com')
        
        expect(result.success).toBe(false)
        expect(result.error).toContain('Email address already used')
      })
      
      it('should handle invalid email format', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        
        mockSupabase.auth.updateUser.mockResolvedValue({
          data: { user: null },
          error: {
            message: 'Invalid email format',
            name: 'AuthInvalidEmailError',
            __isAuthError: true
          } as any
        })
        
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await changeEmail('invalid-email')
        
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid email format')
      })
      
      it('should continue with operation even if session revocation fails', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        mockSecurityOperations.emailChange(mockSupabase, true)
        
        // Mock session revocation failure
        mockSupabase.auth.signOut.mockResolvedValue({
          error: {
            message: 'Failed to revoke sessions',
            name: 'NetworkError',
            __isAuthError: true
          } as any
        })
        
        vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)
        
        const result = await changeEmail('newemail@example.com')
        
        expect(result.success).toBe(true) // Email change still succeeds
        expect(logger.error).toHaveBeenCalledWith(
          'Sign out after email change error:',
          expect.any(Object)
        )
      })
    })
    
    describe('changeEmailSecurely (Security Module)', () => {
      it('should change email with automatic session revocation', async () => {
        const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
        mockSecurityOperations.emailChange(mockSupabase, true)
        mockSecurityOperations.globalSignOut(mockSupabase)
        vi.mocked(createClient).mockReturnValue(mockSupabase)
        
        const result = await changeEmailSecurely('newemail@example.com', 'http://localhost:3000/auth/confirm')
        
        expect(result.success).toBe(true)
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith(
          { email: 'newemail@example.com' },
          { emailRedirectTo: 'http://localhost:3000/auth/confirm' }
        )
        expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
      })
    })
  })
  
  describe('Global Session Revocation', () => {
    it('should revoke all sessions with proper logging', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      mockSecurityOperations.globalSignOut(mockSupabase)
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const result = await revokeAllSessions('security_incident')
      
      expect(result.success).toBe(true)
      expect(result.revokedSessions).toBe(1)
      expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Revoking all sessions: security_incident')
      )
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('All sessions revoked successfully')
      )
    })
    
    it('should handle revocation failures gracefully', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      mockSupabase.auth.signOut.mockResolvedValue({
        error: {
          message: 'Network error during signout',
          name: 'NetworkError',
          __isAuthError: true
        } as any
      })
      
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const result = await revokeAllSessions('emergency_logout')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error during signout')
      expect(logger.error).toHaveBeenCalledWith(
        '❌ Failed to revoke sessions:',
        expect.any(Object)
      )
    })
    
    it('should handle network errors during revocation', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      mockSupabase.auth.signOut.mockRejectedValue(new Error('Network timeout'))
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const result = await revokeAllSessions('timeout_test')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Network timeout')
    })
  })
  
  describe('Suspicious Activity Detection', () => {
    it('should detect rapid login attempts', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      const suspiciousUser = createMockUser({
        user_metadata: {
          last_login: new Date(Date.now() - 15000).toISOString() // 15 seconds ago
        }
      })
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: suspiciousUser },
        error: null
      })
      
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const result = await detectSuspiciousActivity()
      
      expect(result.suspicious).toBe(true)
      expect(result.reasons).toContain('Rapid successive login attempts')
    })
    
    it('should not flag normal login patterns', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      const normalUser = createMockUser({
        user_metadata: {
          last_login: new Date(Date.now() - 1800000).toISOString() // 30 minutes ago
        }
      })
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: normalUser },
        error: null
      })
      
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const result = await detectSuspiciousActivity()
      
      expect(result.suspicious).toBe(false)
      expect(result.reasons).toHaveLength(0)
    })
    
    it('should handle users without login metadata', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      const newUser = createMockUser({
        user_metadata: {} // No login history
      })
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: newUser },
        error: null
      })
      
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const result = await detectSuspiciousActivity()
      
      expect(result.suspicious).toBe(false)
      expect(result.reasons).toHaveLength(0)
    })
    
    it('should handle detection service errors', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Service unavailable'))
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const result = await detectSuspiciousActivity()
      
      expect(result.suspicious).toBe(false)
      expect(result.reasons).toHaveLength(0)
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ Suspicious activity detection failed:',
        expect.any(Error)
      )
    })
    
    it('should handle unauthenticated users gracefully', async () => {
      const mockSupabase = createAuthScenarioMock('UNAUTHENTICATED')
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const result = await detectSuspiciousActivity()
      
      expect(result.suspicious).toBe(false)
      expect(result.reasons).toHaveLength(0)
    })
  })
  
  describe('Security Operation Combinations', () => {
    it('should handle password change triggered by suspicious activity', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      // Step 1: Detect suspicious activity
      const suspiciousUser = createMockUser({
        user_metadata: {
          last_login: new Date(Date.now() - 10000).toISOString()
        }
      })
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: suspiciousUser },
        error: null
      })
      
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const suspiciousResult = await detectSuspiciousActivity()
      expect(suspiciousResult.suspicious).toBe(true)
      
      // Step 2: Force password change
      mockSecurityOperations.passwordChange(mockSupabase, true)
      mockSecurityOperations.globalSignOut(mockSupabase)
      
      const passwordResult = await changePasswordSecurely('old-password', 'new-secure-password')
      expect(passwordResult.success).toBe(true)
      
      // Step 3: Verify all sessions revoked
      expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    })
    
    it('should handle email change after security breach', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      // Step 1: Change email (breach response)
      mockSecurityOperations.emailChange(mockSupabase, true)
      mockSecurityOperations.globalSignOut(mockSupabase)
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const emailResult = await changeEmailSecurely('secure-new-email@example.com')
      expect(emailResult.success).toBe(true)
      
      // Step 2: Revoke all sessions
      const revokeResult = await revokeAllSessions('email_change_security')
      expect(revokeResult.success).toBe(true)
      
      // Both operations should have triggered session revocation
      expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(2)
    })
    
    it('should maintain security even with partial operation failures', async () => {
      const mockSupabase = createAuthScenarioMock('AUTHENTICATED')
      
      // Password change succeeds but session revocation fails
      mockSecurityOperations.passwordChange(mockSupabase, true)
      mockSupabase.auth.signOut.mockResolvedValue({
        error: {
          message: 'Revocation failed',
          name: 'NetworkError',
          __isAuthError: true
        } as any
      })
      
      vi.mocked(createClient).mockReturnValue(mockSupabase)
      
      const passwordResult = await changePasswordSecurely('old', 'new')
      expect(passwordResult.success).toBe(true) // Password change succeeded
      
      // Manual revocation should still be attempted
      const manualRevokeResult = await revokeAllSessions('manual_cleanup')
      expect(manualRevokeResult.success).toBe(false) // Expected to fail
      
      // Security operations should be logged
      expect(logger.warn).toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalled()
    })
  })
})