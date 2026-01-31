/**
 * Critical Security Test: Events API Authentication
 * Regression test for security vulnerability fix
 */

import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '../route'

// Mock the dependencies
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClientNew: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }
}))

const { createServerSupabaseClientNew } = await import('@/lib/supabase')

describe('Build Events API - Authentication Security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when user is not authenticated', async () => {
    // Mock Supabase to return no user
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error('No user')
        })
      }
    }
    vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase)

    const request = new NextRequest('http://localhost:3000/api/builds/test-build-id/events')
    const params = Promise.resolve({ buildId: 'test-build-id' })

    const response = await GET(request, { params })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('Unauthorized - invalid session')
    expect(body.events).toEqual([])
  })

  it('should use userId from session, not from query parameters', async () => {
    const mockUserId = 'authenticated-user-id'
    const mockBuildId = 'build_01234567890123456789' // Valid ULID length
    
    // Mock Supabase query builder chain - each eq() returns self to allow chaining
    const mockQuery = {
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [],
        error: null
      })
    }
    
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: mockUserId } },
          error: null
        })
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery)
      })
    }
    vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase as any)

    // Try to pass different userId in query params (should be ignored)
    const request = new NextRequest(`http://localhost:3000/api/builds/${mockBuildId}/events?userId=malicious-user-id`)
    const params = Promise.resolve({ buildId: mockBuildId })

    const response = await GET(request, { params })

    // Verify the query chain was called correctly
    expect(mockSupabase.from).toHaveBeenCalledWith('project_build_events')
    expect(mockQuery.eq).toHaveBeenCalledWith('build_id', mockBuildId)
    expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId) // Session user, not query param
    expect(mockQuery.eq).toHaveBeenCalledWith('user_visible', true)
    expect(mockQuery.eq).not.toHaveBeenCalledWith('user_id', 'malicious-user-id')
    expect(response.status).toBe(200)
  })

  it('should prevent access to other users build events', async () => {
    const authenticatedUserId = 'user-123'
    const mockBuildId = 'build_01234567890123456789' // Valid ULID length
    
    // Mock Supabase query builder chain
    const mockQuery = {
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [], // No events returned (as expected with proper RLS)
        error: null
      })
    }
    
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: authenticatedUserId } },
          error: null
        })
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(mockQuery)
      })
    }
    vi.mocked(createServerSupabaseClientNew).mockResolvedValue(mockSupabase as any)

    const request = new NextRequest(`http://localhost:3000/api/builds/${mockBuildId}/events`)
    const params = Promise.resolve({ buildId: mockBuildId })

    await GET(request, { params })

    // Verify the query filters by the authenticated user's ID
    expect(mockSupabase.from).toHaveBeenCalledWith('project_build_events')
    expect(mockQuery.eq).toHaveBeenCalledWith('build_id', mockBuildId)
    expect(mockQuery.eq).toHaveBeenCalledWith('user_id', authenticatedUserId)
    expect(mockQuery.eq).toHaveBeenCalledWith('user_visible', true)
  })
})