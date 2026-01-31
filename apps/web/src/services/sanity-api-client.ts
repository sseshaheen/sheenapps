/**
 * Sanity CMS API Client
 * Handles communication with Worker Sanity integration endpoints
 * Follows existing AdvisorAPIClient pattern with HMAC authentication
 *
 * SERVER-ONLY MODULE - Do not import in client components
 */

import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';
import 'server-only';

import type {
  SanityConnection,
  SanityDocument,
  CreateSanityConnectionRequest,
  TestSanityConnectionRequest,
  TestSanityConnectionResponse,
  SyncDocumentsRequest,
  SyncDocumentsResponse,
  GroqQueryRequest,
  GroqQueryResponse,
  GetDocumentsFilters,
  CreatePreviewRequest,
  CreatePreviewResponse,
  ValidatePreviewResponse,
  HealthCheckResponse,
  BreakglassCredentialsRequest,
  BreakglassCredentialsResponse,
  ListBreakglassOptions,
  ListBreakglassResponse,
  ListWebhookEventsFilters,
  ListWebhookEventsResponse,
  SanityErrorCode
} from '@/types/sanity-integration';

import { SanityIntegrationError } from '@/types/sanity-integration';

export class SanityAPIClient {
  private readonly baseUrl: string;
  private readonly apiPrefix = '/api/integrations/sanity';

  constructor() {
    this.baseUrl = process.env.WORKER_BASE_URL || 'http://localhost:8081';
    
    if (!process.env.WORKER_SHARED_SECRET) {
      throw new Error('WORKER_SHARED_SECRET environment variable is required for Sanity API client');
    }
  }

  /**
   * Make authenticated API request to Worker backend
   */
  private async makeRequest<T>(
    method: string,
    path: string,
    body?: any,
    additionalHeaders: Record<string, string> = {}
  ): Promise<T> {
    try {
      const url = `${this.baseUrl}${this.apiPrefix}${path}`;
      const bodyString = body ? JSON.stringify(body) : '';
      
      // Generate HMAC authentication headers
      const authHeaders = createWorkerAuthHeaders(method, `${this.apiPrefix}${path}`, bodyString, additionalHeaders);
      
      logger.info(`📡 Sanity API ${method} ${path}`, { 
        url, 
        hasBody: !!body,
        headers: Object.keys(authHeaders)
      });

      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: bodyString || undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new SanityIntegrationError(
          errorData.error || 'Sanity API request failed',
          errorData.code || 'UNKNOWN_ERROR',
          response.status,
          errorData
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof SanityIntegrationError) {
        throw error;
      }
      
      logger.error('🚨 Sanity API request failed', { 
        method, 
        path, 
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw new SanityIntegrationError(
        'Network error during Sanity API request',
        'NETWORK_ERROR',
        0,
        error
      );
    }
  }

  // ==========================================
  // Connection Management
  // ==========================================

  /**
   * Test Sanity connection before creating
   */
  async testConnection(params: TestSanityConnectionRequest): Promise<TestSanityConnectionResponse> {
    logger.info('🔍 Testing Sanity connection', { 
      projectId: params.projectId,
      dataset: params.dataset 
    });

    return this.makeRequest<TestSanityConnectionResponse>(
      'POST',
      '/test-connection',
      params
    );
  }

  /**
   * Create new Sanity connection
   */
  async createConnection(params: CreateSanityConnectionRequest): Promise<SanityConnection> {
    logger.info('🔗 Creating Sanity connection', { 
      sanityProjectId: params.sanity_project_id,
      dataset: params.dataset_name 
    });

    // Add webhook URL to connection creation
    const webhookUrl = process.env.NEXT_PUBLIC_APP_BASE_URL 
      ? `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/sanity/webhook`
      : undefined;

    const requestBody = {
      ...params,
      webhook_url: webhookUrl
    };

    return this.makeRequest<SanityConnection>(
      'POST',
      '/connect',
      requestBody
    );
  }

  /**
   * List user's Sanity connections
   */
  async listConnections(projectId?: string): Promise<SanityConnection[]> {
    const queryParams = projectId ? `?project_id=${projectId}` : '';
    
    logger.info('📋 Listing Sanity connections', { projectId });

    return this.makeRequest<SanityConnection[]>(
      'GET',
      `/connections${queryParams}`
    );
  }

  /**
   * Get single Sanity connection
   */
  async getConnection(connectionId: string): Promise<SanityConnection> {
    logger.info('🔍 Getting Sanity connection', { connectionId });

    return this.makeRequest<SanityConnection>(
      'GET',
      `/connections/${connectionId}`
    );
  }

  /**
   * Update Sanity connection settings
   */
  async updateConnection(
    connectionId: string, 
    updates: Partial<CreateSanityConnectionRequest>
  ): Promise<SanityConnection> {
    logger.info('✏️ Updating Sanity connection', { connectionId, updates: Object.keys(updates) });

    return this.makeRequest<SanityConnection>(
      'PATCH',
      `/connections/${connectionId}`,
      updates
    );
  }

  /**
   * Delete Sanity connection
   */
  async deleteConnection(connectionId: string): Promise<{ success: boolean }> {
    logger.info('🗑️ Deleting Sanity connection', { connectionId });

    return this.makeRequest<{ success: boolean }>(
      'DELETE',
      `/connections/${connectionId}`
    );
  }

  /**
   * Check connection health
   */
  async checkConnectionHealth(connectionId: string): Promise<HealthCheckResponse> {
    logger.info('💓 Checking Sanity connection health', { connectionId });

    return this.makeRequest<HealthCheckResponse>(
      'POST',
      `/connections/${connectionId}/health-check`
    );
  }

  // ==========================================
  // Content Operations
  // ==========================================

  /**
   * Sync documents from Sanity
   */
  async syncDocuments(
    connectionId: string, 
    options: SyncDocumentsRequest = {}
  ): Promise<SyncDocumentsResponse> {
    const queryParams = options.force ? '?force=true' : '';
    
    logger.info('🔄 Syncing Sanity documents', { connectionId, force: options.force });

    return this.makeRequest<SyncDocumentsResponse>(
      'POST',
      `/connections/${connectionId}/sync${queryParams}`
    );
  }

  /**
   * Execute GROQ query
   */
  async executeQuery<T = any>(
    connectionId: string,
    params: GroqQueryRequest
  ): Promise<GroqQueryResponse<T>> {
    logger.info('🔍 Executing GROQ query', { 
      connectionId, 
      queryLength: params.groq_query.length,
      hasParams: !!params.params,
      cache: params.cache 
    });

    return this.makeRequest<GroqQueryResponse<T>>(
      'POST',
      `/connections/${connectionId}/query`,
      params
    );
  }

  /**
   * Get documents with filtering
   */
  async getDocuments(
    connectionId: string,
    filters: GetDocumentsFilters = {}
  ): Promise<SanityDocument[]> {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const path = `/connections/${connectionId}/documents${queryString ? `?${queryString}` : ''}`;
    
    logger.info('📄 Getting Sanity documents', { connectionId, filters });

    return this.makeRequest<SanityDocument[]>('GET', path);
  }

  // ==========================================
  // Preview System
  // ==========================================

  /**
   * Create preview
   */
  async createPreview(
    connectionId: string,
    params: CreatePreviewRequest
  ): Promise<CreatePreviewResponse> {
    logger.info('🎭 Creating Sanity preview', { 
      connectionId, 
      documentId: params.document_id,
      documentType: params.document_type 
    });

    return this.makeRequest<CreatePreviewResponse>(
      'POST',
      `/connections/${connectionId}/preview`,
      params
    );
  }

  /**
   * Validate preview secret
   */
  async validatePreview(previewId: string, secret: string): Promise<ValidatePreviewResponse> {
    logger.info('🔒 Validating preview secret', { previewId });

    return this.makeRequest<ValidatePreviewResponse>(
      'GET',
      `/preview/${previewId}/validate?secret=${encodeURIComponent(secret)}`
    );
  }

  /**
   * Get preview content
   */
  async getPreviewContent<T = any>(previewId: string, secret: string): Promise<T> {
    logger.info('📖 Getting preview content', { previewId });

    return this.makeRequest<T>(
      'GET',
      `/preview/${previewId}/content?secret=${encodeURIComponent(secret)}`
    );
  }

  // ==========================================
  // Webhook Management
  // ==========================================

  /**
   * List webhook events for connection
   */
  async listWebhookEvents(
    connectionId: string,
    filters: ListWebhookEventsFilters = {}
  ): Promise<ListWebhookEventsResponse> {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const path = `/connections/${connectionId}/webhooks${queryString ? `?${queryString}` : ''}`;
    
    logger.info('📨 Listing webhook events', { connectionId, filters });

    return this.makeRequest<ListWebhookEventsResponse>('GET', path);
  }

  // ==========================================
  // Admin/Breakglass Operations
  // ==========================================

  /**
   * Get breakglass credentials (admin only)
   */
  async getBreakglassCredentials(
    connectionId: string,
    params: BreakglassCredentialsRequest
  ): Promise<BreakglassCredentialsResponse> {
    logger.info('🚨 Requesting breakglass credentials', { 
      connectionId, 
      justification: params.justification.substring(0, 50) + '...' 
    });

    return this.makeRequest<BreakglassCredentialsResponse>(
      'GET',
      `/admin/breakglass/${connectionId}/credentials`,
      params
    );
  }

  /**
   * List breakglass entries (admin only)
   */
  async listBreakglassEntries(options: ListBreakglassOptions = {}): Promise<ListBreakglassResponse> {
    const queryParams = new URLSearchParams();
    
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const path = `/admin/breakglass${queryString ? `?${queryString}` : ''}`;
    
    logger.info('📋 Listing breakglass entries', { options });

    return this.makeRequest<ListBreakglassResponse>('GET', path);
  }
}

// Singleton instance
let sanityAPIClient: SanityAPIClient | null = null;

/**
 * Get singleton Sanity API client instance
 */
export function getSanityAPIClient(): SanityAPIClient {
  if (!sanityAPIClient) {
    sanityAPIClient = new SanityAPIClient();
  }
  return sanityAPIClient;
}

// Export error class for external use
export { SanityIntegrationError } from '@/types/sanity-integration';