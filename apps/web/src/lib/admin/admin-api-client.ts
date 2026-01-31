/**
 * Admin API Client (Server-Only)
 * Centralized client for all admin API calls to the worker backend
 * Uses JWT Bearer token authentication for admin endpoints
 */

import 'server-only'

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL || 'http://localhost:8081'

interface AdminApiOptions {
  method?: string
  body?: any
  headers?: Record<string, string>
  correlationId?: string
  adminToken?: string // JWT token from admin session
}

export class AdminApiClient {
  private static instance: AdminApiClient
  
  private constructor() {}
  
  static getInstance(): AdminApiClient {
    if (!AdminApiClient.instance) {
      AdminApiClient.instance = new AdminApiClient()
    }
    return AdminApiClient.instance
  }

  /**
   * Helper to build clean query strings without undefined values
   * Adds cache-busting timestamp to prevent browser disk caching
   */
  private buildQueryString(params?: Record<string, any>, addCacheBuster: boolean = true): string {
    const cleanParams: Record<string, string> = {}
    
    // Add provided params
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          cleanParams[key] = String(value)
        }
      })
    }
    
    // Add cache-busting timestamp to prevent browser disk caching
    if (addCacheBuster) {
      cleanParams._t = Date.now().toString()
    }
    
    return Object.keys(cleanParams).length > 0 
      ? `?${new URLSearchParams(cleanParams).toString()}` 
      : ''
  }

  /**
   * Make authenticated request to admin API
   */
  async request<T = any>(
    endpoint: string,
    options: AdminApiOptions = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {}, correlationId, adminToken } = options
    
    // Construct full URL
    const url = endpoint.startsWith('http') 
      ? endpoint 
      : `${WORKER_BASE_URL}/v1/admin${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
    
    // Build auth headers for admin API (using JWT Bearer token)
    const authHeaders: Record<string, string> = {}
    
    // Add Bearer token if provided
    if (adminToken) {
      authHeaders['Authorization'] = `Bearer ${adminToken}`
    }
    
    // Add correlation ID if provided
    if (correlationId) {
      authHeaders['x-correlation-id'] = correlationId
    }
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log(`Admin API request failed: ${method} ${url}`, {
        status: response.status,
        error: errorText.substring(0, 200),
        hasToken: !!adminToken
      })
      throw new Error(`Admin API Error: ${response.status} - ${errorText}`)
    }
    
    return response.json()
  }

  // Dashboard & Overview
  async getDashboard(options?: { adminToken?: string }) {
    const query = this.buildQueryString() // Just adds cache buster
    return this.request(`/dashboard${query}`, options)
  }

  // User Management
  async getUsers(params?: Record<string, any>, options?: { adminToken?: string }) {
    const query = this.buildQueryString(params)
    return this.request(`/users${query}`, options)
  }

  async updateUserStatus(
    userId: string, 
    action: 'suspend' | 'ban' | 'activate', 
    reason: string,
    duration?: string,
    options?: { adminToken?: string; correlationId?: string }
  ) {
    const body: any = { action, reason }
    if (duration) {
      body.duration = duration
    }
    
    return this.request(`/users/${userId}/status`, {
      method: 'PUT',
      body,
      headers: {
        'x-admin-reason': reason
      },
      ...options
    })
  }

  // Two-Person Approval System
  async getPendingApprovals(options?: { adminToken?: string }) {
    const query = this.buildQueryString() // Just adds cache buster
    return this.request(`/approvals/pending${query}`, options)
  }

  async approveRequest(id: string, reason: string, options?: { adminToken?: string }) {
    return this.request(`/approvals/${id}/approve`, {
      method: 'POST',
      body: { reason },
      ...options
    })
  }

  async rejectRequest(id: string, reason: string, options?: { adminToken?: string }) {
    return this.request(`/approvals/${id}/reject`, {
      method: 'POST',
      body: { reason },
      ...options
    })
  }

  // Financial Operations
  async getFinancialOverview(options?: { adminToken?: string }) {
    const query = this.buildQueryString() // Just adds cache buster
    return this.request(`/finance/overview${query}`, options)
  }

  async processRefund(data: any, options?: { adminToken?: string }) {
    return this.request('/finance/refunds', {
      method: 'POST',
      body: data,
      ...options
    })
  }

  // Support System
  async getSupportTickets(params?: Record<string, any>, options?: { adminToken?: string }) {
    const query = this.buildQueryString(params)
    return this.request(`/support/tickets${query}`, options)
  }

  async getTicketDetails(id: string, options?: { adminToken?: string }) {
    return this.request(`/support/tickets/${id}`, options)
  }

  async addTicketMessage(id: string, message: string, isInternal: boolean, options?: { adminToken?: string }) {
    return this.request(`/support/tickets/${id}/messages`, {
      method: 'POST',
      body: { message, is_internal: isInternal },
      ...options
    })
  }

  async updateTicketStatus(id: string, status: string, options?: { adminToken?: string }) {
    return this.request(`/support/tickets/${id}/status`, {
      method: 'PUT',
      body: { status },
      ...options
    })
  }

  // Advisor Management
  async getAdvisorApplications(params?: { status?: string, adminToken?: string }) {
    const { status, adminToken, ...otherParams } = params || {}
    const queryParams = status ? { status, ...otherParams } : otherParams
    const query = this.buildQueryString(queryParams)
    return this.request(`/advisors/applications${query}`, { adminToken })
  }

  async updateAdvisorApproval(id: string, approved: boolean, notes?: string, options?: { adminToken?: string }) {
    return this.request(`/advisors/${id}/approval`, {
      method: 'PUT',
      body: { approved, notes },
      ...options
    })
  }
  
  async approveAdvisor(id: string, action: 'approve' | 'reject', reason: string, options?: { adminToken?: string, correlationId?: string }) {
    return this.request(`/advisors/${id}/approval`, {
      method: 'PUT',
      body: { action, reason, notes: reason },
      ...options
    })
  }

  // Revenue Metrics
  async getRevenueMetrics(options?: { adminToken?: string }) {
    const query = this.buildQueryString() // Just adds cache buster
    return this.request(`/metrics/dashboard${query}`, options)
  }

  // Performance Metrics (Web Vitals)
  async getWebVitals(params?: {
    range?: string;
    route?: string;
    build?: string;
  }, options?: { adminToken?: string }) {
    const query = this.buildQueryString(params)
    return this.request(`/performance/web-vitals${query}`, options)
  }

  async getMRR(options?: { adminToken?: string }) {
    return this.request('/metrics/mrr', options)
  }

  async getLTV(options?: { adminToken?: string }) {
    return this.request('/metrics/ltv', options)
  }

  async getARPU(options?: { adminToken?: string }) {
    return this.request('/metrics/arpu', options)
  }

  async getGrowthMetrics(options?: { adminToken?: string }) {
    return this.request('/metrics/growth', options)
  }

  // Promotion Management
  async getPromotions(options?: { adminToken?: string }) {
    const query = this.buildQueryString() // Just adds cache buster
    return this.request(`/promotions${query}`, options)
  }

  async createPromotion(
    data: any, 
    reason: string,
    options?: { adminToken?: string; correlationId?: string }
  ) {
    return this.request('/promotions', {
      method: 'POST',
      body: data,
      headers: {
        'x-admin-reason': reason
      },
      ...options
    })
  }

  async getPromotionDetails(id: string, options?: { adminToken?: string }) {
    return this.request(`/promotions/${id}`, options)
  }

  async updatePromotion(
    id: string, 
    data: any, 
    reason: string,
    options?: { adminToken?: string; correlationId?: string }
  ) {
    return this.request(`/promotions/${id}`, {
      method: 'PATCH',
      body: data,
      headers: {
        'x-admin-reason': reason
      },
      ...options
    })
  }

  async getPromotionAnalytics(options?: { adminToken?: string }) {
    return this.request('/promotions/analytics', options)
  }

  // Pricing Management
  async getPricingCatalogs(options?: { adminToken?: string }) {
    const query = this.buildQueryString() // Just adds cache buster
    return this.request(`/pricing/catalogs${query}`, options)
  }

  async getCatalogDetails(id: string, options?: { adminToken?: string }) {
    return this.request(`/pricing/catalogs/${id}`, options)
  }

  async createPricingCatalog(data: any, options?: { adminToken?: string }) {
    return this.request('/pricing/catalogs', {
      method: 'POST',
      body: data,
      ...options
    })
  }

  async activateCatalog(id: string, options?: { adminToken?: string }) {
    return this.request(`/pricing/catalogs/${id}/activate`, {
      method: 'PUT',
      ...options
    })
  }
  
  async activatePricingCatalog(id: string, reason: string, options?: { adminToken?: string, correlationId?: string }) {
    return this.request(`/pricing/catalogs/${id}/activate`, {
      method: 'PUT',
      body: { reason },
      ...options
    })
  }

  async getPricingAnalytics(options?: { adminToken?: string }) {
    return this.request('/pricing/analytics', options)
  }

  // Trust & Safety
  async getRiskScores(options?: { adminToken?: string }) {
    const query = this.buildQueryString() // Just adds cache buster
    return this.request(`/trust-safety/risk-scores${query}`, options)
  }

  async getUserRiskScore(userId: string, options?: { adminToken?: string }) {
    return this.request(`/trust-safety/risk-score/${userId}`, options)
  }

  async getViolations(options?: { adminToken?: string }) {
    const query = this.buildQueryString() // Just adds cache buster
    return this.request(`/trust-safety/violations${query}`, options)
  }

  async getSecurityEvents(options?: { adminToken?: string }) {
    const query = this.buildQueryString() // Just adds cache buster
    return this.request(`/trust-safety/security-events${query}`, options)
  }

  async executeViolationAction(data: any, options?: { adminToken?: string }) {
    return this.request('/trust-safety/violation-action', {
      method: 'POST',
      body: data,
      ...options
    })
  }

  async executeEmergencyAction(data: any, options?: { adminToken?: string }) {
    return this.request('/trust-safety/emergency-action', {
      method: 'POST',
      body: data,
      ...options
    })
  }

  // Audit Logs
  async getAuditLogs(params?: Record<string, any>, options?: { adminToken?: string }) {
    const query = this.buildQueryString(params)
    return this.request(`/audit/logs${query}`, options)
  }
  
  async getAuditLogById(id: string, options?: { adminToken?: string }) {
    return this.request(`/audit/logs/${id}`, options)
  }
  
  async getAuditLogStats(options?: { adminToken?: string }) {
    return this.request('/audit/logs/stats/summary', options)
  }
  
  async getSecurityAlerts(params?: Record<string, any>, options?: { adminToken?: string; correlationId?: string }) {
    const query = this.buildQueryString(params)
    return this.request(`/audit/alerts${query}`, options)
  }

  // Usage Monitoring
  async getUsageSpikes(params?: Record<string, any>, options?: { adminToken?: string }) {
    const query = this.buildQueryString(params)
    return this.request(`/usage/spikes${query}`, options)
  }

  // Build Logs Management
  async getBuildsList(params?: {
    limit?: number;
    offset?: number;
    status?: string;
    userId?: string;
    projectId?: string;
    minDurationMs?: number;
    maxDurationMs?: number;
  }, options?: { adminToken?: string }) {
    const query = this.buildQueryString(params)
    return this.request(`/builds${query}`, options)
  }

  async getBuildInfo(buildId: string, options?: { adminToken?: string }) {
    return this.request(`/builds/${buildId}/info`, options)
  }

  /**
   * Stream build logs as NDJSON
   * Returns a Response object for manual stream processing
   */
  async streamBuildLogs(
    buildId: string,
    options?: {
      adminToken?: string;
      bytes?: string; // e.g., "-1024" for last 1KB
      range?: string; // HTTP Range header, e.g., "bytes=0-1023"
    }
  ): Promise<Response> {
    const { adminToken, bytes, range, ...otherOptions } = options || {}

    // Build URL with query params if bytes specified
    const query = bytes ? this.buildQueryString({ bytes }, false) : ''
    const url = `${WORKER_BASE_URL}/v1/admin/builds/${buildId}/logs${query}`

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-ndjson; charset=utf-8'
    }

    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`
    }

    if (range) {
      headers['Range'] = range
    }

    const response = await fetch(url, {
      method: 'GET',
      headers
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.log(`Build logs stream failed: GET ${url}`, {
        status: response.status,
        error: errorText.substring(0, 200),
        hasToken: !!adminToken
      })
      throw new Error(`Build Logs Error: ${response.status} - ${errorText}`)
    }

    return response
  }
}

// Export singleton instance
export const adminApiClient = AdminApiClient.getInstance()