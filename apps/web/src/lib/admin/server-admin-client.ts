/**
 * 🛡️ Server-Side Admin Client (BFF Pattern)
 * Expert-validated server-only admin backend client
 * 
 * Key principles:
 * - Never expose admin tokens to browser
 * - All admin operations proxy through Next.js API routes
 * - Expert's header standardization and correlation tracking
 * - Idempotency support for financial operations
 */

import 'server-only'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'

// Expert's standardized error class
export class AdminApiError extends Error {
  constructor(
    message: string,
    public correlationId: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'AdminApiError'
  }
}

// Expert's admin client interface
export interface AdminDashboardData {
  metrics: {
    totalUsers: number
    activeUsers: number
    totalRevenue: number
    monthlyRevenue: number
    pendingApprovals: number
  }
  recentActions: Array<{
    id: string
    action: string
    adminUser: string
    timestamp: string
    correlationId: string
  }>
}

export interface AdminUserData {
  id: string
  email: string
  status: 'active' | 'suspended' | 'banned'
  createdAt: string
  lastActive?: string
  metadata: Record<string, any>
}

export interface AdminRefundRequest {
  invoiceId: string
  amount: number
  reason: string
  idempotency_key: string
  correlation_id: string
}

export interface AdminRefundResponse {
  success: boolean
  refund_id: string
  correlation_id: string
  deduped: boolean
}

/**
 * Expert's server-side admin client
 * Only called from Next.js API routes, never from browser
 */
export class ServerAdminClient {
  private adminBaseUrl: string
  
  constructor() {
    // Expert pattern: Server-side environment variables only
    // Use WORKER_BASE_URL for consistency with the worker API on port 8081
    this.adminBaseUrl = process.env.ADMIN_BASE_URL || process.env.WORKER_BASE_URL || 'http://localhost:8081'
  }

  /**
   * Expert's request method with correlation tracking
   * Protected so it can be used by extending classes like PromotionsAdminClient
   */
  protected async request<T>(
    method: string, 
    endpoint: string, 
    body?: any,
    correlationId?: string,
    reason?: string,
    idempotencyKey?: string
  ): Promise<{ data: T; correlationId: string }> {
    const requestCorrelationId = correlationId || crypto.randomUUID()
    
    try {
      // Expert pattern: Use existing Supabase server auth for admin backend calls
      const supabase = await createServerSupabaseClientNew()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new AdminApiError(
          'No valid admin session',
          requestCorrelationId,
          'NO_SESSION'
        )
      }

      // Expert's standardized headers with canonical casing
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Correlation-Id': requestCorrelationId,
        // Use Supabase JWT for admin backend authentication  
        'Authorization': `Bearer ${session.access_token}`,
        ...(reason && { 'X-Admin-Reason': reason }),
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey })
      }
      
      logger.info('Admin backend request', {
        method,
        endpoint,
        correlationId: requestCorrelationId,
        hasReason: !!reason,
        hasIdempotencyKey: !!idempotencyKey
      })

      const response = await fetch(`${this.adminBaseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      })
      
      const responseCorrelationId = response.headers.get('X-Correlation-Id') || requestCorrelationId
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
        logger.error('Admin backend error', {
          method,
          endpoint,
          status: response.status,
          correlationId: responseCorrelationId,
          error: errorData
        })
        
        throw new AdminApiError(
          errorData.message || `Request failed with status ${response.status}`,
          responseCorrelationId,
          errorData.code || 'API_ERROR',
          response.status
        )
      }

      const responseData = await response.json()
      
      logger.info('Admin backend success', {
        method,
        endpoint,
        status: response.status,
        correlationId: responseCorrelationId
      })

      return {
        data: responseData,
        correlationId: responseCorrelationId
      }

    } catch (error) {
      if (error instanceof AdminApiError) {
        throw error
      }
      
      logger.error('Admin client error', {
        method,
        endpoint,
        correlationId: requestCorrelationId,
        error: error instanceof Error ? error.message : String(error)
      })
      
      throw new AdminApiError(
        error instanceof Error ? error.message : 'Unknown admin API error',
        requestCorrelationId,
        'CLIENT_ERROR'
      )
    }
  }

  /**
   * Dashboard operations
   */
  async getDashboard(correlationId?: string): Promise<{ data: AdminDashboardData; correlationId: string }> {
    return this.request<AdminDashboardData>('GET', '/api/v1/admin/dashboard', undefined, correlationId)
  }

  /**
   * User management operations
   */
  async getUsers(
    params: { search?: string; status?: string; page?: number; limit?: number } = {},
    correlationId?: string
  ): Promise<{ data: { users: AdminUserData[]; total: number; page: number }; correlationId: string }> {
    const queryParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString())
      }
    })
    
    const endpoint = `/api/v1/admin/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    return this.request('GET', endpoint, undefined, correlationId)
  }

  async suspendUser(
    userId: string, 
    reason: string, 
    correlationId?: string
  ): Promise<{ data: { success: boolean }; correlationId: string }> {
    return this.request(
      'POST', 
      `/api/v1/admin/users/${userId}/suspend`, 
      { reason }, 
      correlationId, 
      reason
    )
  }

  async banUser(
    userId: string, 
    reason: string, 
    correlationId?: string
  ): Promise<{ data: { success: boolean }; correlationId: string }> {
    return this.request(
      'POST', 
      `/api/v1/admin/users/${userId}/ban`, 
      { reason }, 
      correlationId, 
      reason
    )
  }

  async reactivateUser(
    userId: string, 
    reason: string, 
    correlationId?: string
  ): Promise<{ data: { success: boolean }; correlationId: string }> {
    return this.request(
      'POST', 
      `/api/v1/admin/users/${userId}/reactivate`, 
      { reason }, 
      correlationId, 
      reason
    )
  }

  /**
   * Advisor management operations  
   */
  async getAdvisors(
    params: { status?: 'pending' | 'approved' | 'rejected'; page?: number; limit?: number } = {},
    correlationId?: string
  ) {
    const queryParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString())
      }
    })
    
    const endpoint = `/api/v1/admin/advisors${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    return this.request('GET', endpoint, undefined, correlationId)
  }

  async approveAdvisor(
    advisorId: string, 
    reason: string, 
    correlationId?: string
  ) {
    return this.request(
      'PUT', 
      `/api/v1/admin/advisors/${advisorId}/approve`, 
      { reason }, 
      correlationId, 
      reason
    )
  }

  async rejectAdvisor(
    advisorId: string, 
    reason: string, 
    correlationId?: string
  ) {
    return this.request(
      'PUT', 
      `/api/v1/admin/advisors/${advisorId}/reject`, 
      { reason }, 
      correlationId, 
      reason
    )
  }

  /**
   * Financial operations with expert's idempotency pattern
   */
  async processRefund(
    request: AdminRefundRequest
  ): Promise<{ data: AdminRefundResponse; correlationId: string }> {
    return this.request<AdminRefundResponse>(
      'POST', 
      '/api/v1/admin/refunds',
      request,
      request.correlation_id,
      request.reason,
      request.idempotency_key
    )
  }

  /**
   * Audit operations
   */
  async getAuditLogs(
    params: { 
      adminUserId?: string
      action?: string 
      startDate?: string 
      endDate?: string
      correlationId?: string
      page?: number 
      limit?: number 
    } = {},
    correlationId?: string
  ) {
    const queryParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString())
      }
    })
    
    const endpoint = `/api/v1/admin/audit${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    return this.request('GET', endpoint, undefined, correlationId)
  }
}

// Expert pattern: Singleton instance for server-side use
export const serverAdminClient = new ServerAdminClient()