/**
 * Unified Integration Platform Type Definitions
 * 
 * This file contains all TypeScript type definitions for the unified integration platform.
 * It serves as the single source of truth for integration-related types across the application.
 */

// ============================================
// Core Enums (matching database enums)
// ============================================

export enum IntegrationProvider {
  // MENA Payment Providers (Priority)
  TapPayments = 'tap_payments',
  Paymob = 'paymob',
  Tabby = 'tabby',
  Tamara = 'tamara',
  Moyasar = 'moyasar',
  PayTabs = 'paytabs',
  
  // MENA Communication
  Unifonic = 'unifonic',
  Infobip = 'infobip',
  
  // MENA Logistics
  Aramex = 'aramex',
  SMSA = 'smsa',
  Fetchr = 'fetchr',
  
  // MENA Cloud
  AWSME = 'aws_me',
  AzureME = 'azure_me',
  
  // Existing Core
  GitHub = 'github',
  Supabase = 'supabase',
  Cloudflare = 'cloudflare',
  Vercel = 'vercel',
  
  // International Payments
  Stripe = 'stripe',
  PayPal = 'paypal',
  Square = 'square',
  Paddle = 'paddle',
  
  // Communication
  Resend = 'resend',
  Twilio = 'twilio',
  SendGrid = 'sendgrid',
  Slack = 'slack',
  Discord = 'discord',
  
  // Analytics & Monitoring
  PostHog = 'posthog',
  Sentry = 'sentry',
  GoogleAnalytics = 'google_analytics',
  Mixpanel = 'mixpanel',
  Datadog = 'datadog',
  Segment = 'segment',
  
  // Auth & Identity
  Clerk = 'clerk',
  Auth0 = 'auth0',
  
  // Storage & Media
  Cloudinary = 'cloudinary',
  AWSS3 = 'aws_s3',
  
  // Development
  Linear = 'linear',
  GitLab = 'gitlab',
  Bitbucket = 'bitbucket',
  Jira = 'jira',
  
  // Databases
  MongoDBAtlas = 'mongodb_atlas',
  Firebase = 'firebase',
  PlanetScale = 'planetscale',
  Neon = 'neon',
  
  // CRM & Marketing
  HubSpot = 'hubspot',
  Salesforce = 'salesforce',
  Mailchimp = 'mailchimp',
  Intercom = 'intercom',
  CustomerIO = 'customerio'
}

export enum IntegrationCategory {
  Payment = 'payment',
  Communication = 'communication',
  Logistics = 'logistics',
  Deploy = 'deploy',
  Auth = 'auth',
  Analytics = 'analytics',
  Development = 'development',
  Database = 'database',
  Storage = 'storage',
  Monitoring = 'monitoring',
  Marketing = 'marketing',
  CRM = 'crm'
}

export enum IntegrationAuthMethod {
  OAuth2 = 'oauth2',
  OAuth2PKCE = 'oauth2_pkce',
  APIKey = 'api_key',
  WebhookSecret = 'webhook_secret',
  JWT = 'jwt',
  BasicAuth = 'basic_auth',
  Custom = 'custom'
}

export enum IntegrationConnectionStatus {
  Pending = 'pending',
  Connected = 'connected',
  Failed = 'failed',
  Expired = 'expired',
  Refreshing = 'refreshing',
  Disconnected = 'disconnected',
  Suspended = 'suspended'
}

export enum IntegrationEventStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Retrying = 'retrying',
  DeadLetter = 'dead_letter'
}

// ============================================
// Core Interfaces
// ============================================

/**
 * Payment capability types for provider selection
 */
export enum PaymentCapability {
  OneTime = 'one_time',
  Recurring = 'recurring',
  Installments = 'installments',
  BNPL = 'bnpl', // Buy Now Pay Later
  Wallets = 'wallets',
  CashCollection = 'cash_collection',
  Marketplace = 'marketplace',
  Connect = 'connect',
  Tokenization = 'tokenization'
}

/**
 * Provider registry entry defining integration capabilities
 */
export interface IntegrationProviderConfig {
  provider: IntegrationProvider;
  name: string;
  category: IntegrationCategory;
  authMethods: IntegrationAuthMethod[];
  capabilities: Record<string, any>;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  paymentCapabilities?: PaymentCapability[] | undefined; // For payment providers
  webhookSupport: boolean;
  realtimeSupport: boolean;
  rateLimits?: RateLimitConfig | undefined;
  requiredScopes?: string[] | undefined;
  optionalScopes?: string[] | undefined;

  // MENA-specific metadata
  isMenaProvider?: boolean | undefined;
  supportedCountries?: string[] | undefined; // ISO 3166-1 alpha-2 codes
  supportedCurrencies?: string[] | undefined; // ISO 4217 currency codes
  dataResidencyRegions?: string[] | undefined; // Cloud region identifiers
  primaryLocale?: string | undefined; // Primary language/locale

  documentationUrl?: string | undefined;
  iconUrl?: string | undefined;
  isActive: boolean;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  requestsPerSecond?: number | undefined;
  requestsPerMinute?: number | undefined;
  requestsPerHour?: number | undefined;
  burstLimit?: number | undefined;
  concurrentRequests?: number | undefined;
}

/**
 * Integration connection record
 */
export interface IntegrationConnection {
  id: string;
  projectId: string;
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  authMethod: IntegrationAuthMethod;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  credentials?: EncryptedCredentials | undefined;
  externalAccountId?: string | undefined;
  externalAccountName?: string | undefined;
  metadata: Record<string, any>;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown' | undefined;
  healthMessage?: string | undefined;
  lastHealthCheck?: Date | undefined;
  connectedAt?: Date | undefined;
  disconnectedAt?: Date | undefined;
  lastSyncAt?: Date | undefined;
  expiresAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Encrypted credentials storage
 */
export interface EncryptedCredentials {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
  webhookSecret?: string | undefined;
  customFields?: Record<string, string> | undefined;
}

/**
 * Integration event record
 */
export interface IntegrationEvent {
  id: string;
  connectionId: string;
  provider: IntegrationProvider;
  eventType: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  eventId?: string | undefined; // External event ID for deduplication
  payload: any;
  headers?: Record<string, string> | undefined;
  status: IntegrationEventStatus;
  processedAt?: Date | undefined;
  processingDurationMs?: number | undefined;
  errorMessage?: string | undefined;
  errorDetails?: any | undefined;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date | undefined;
  sourceIp?: string | undefined;
  userAgent?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Provider-Specific Interfaces
// ============================================

/**
 * Base provider adapter interface
 */
export interface ProviderAdapter {
  // Lifecycle
  initialize(config: ProviderConfig): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
  
  // Authentication
  authenticate(credentials: any): Promise<AuthResult>;
  refreshAuth?(tokens: TokenSet): Promise<TokenSet>;
  validateCredentials(): Promise<boolean>;
  
  // OAuth specific
  getOAuthUrl?(state: string, redirectUri: string): string;
  exchangeCode?(code: string, verifier?: string): Promise<TokenSet>;
  
  // Operations
  execute(operation: string, params: any): Promise<any>;
  
  // Webhooks
  registerWebhook?(config: WebhookConfig): Promise<WebhookRegistration>;
  unregisterWebhook?(webhookId: string): Promise<void>;
  validateWebhook(payload: any, headers: any): boolean;
  processWebhook(event: WebhookEvent): Promise<void>;
  
  // Metadata
  getCapabilities(): ProviderCapabilities;
  getRequiredScopes(): string[];
  getSupportedEvents?(): string[];
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  provider: IntegrationProvider;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  environment?: 'sandbox' | 'production' | undefined;
  [key: string]: any;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  latency: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  message?: string | undefined;
  details?: any | undefined;
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  tokens?: TokenSet | undefined;
  externalAccountId?: string | undefined;
  externalAccountName?: string | undefined;
  metadata?: any | undefined;
}

/**
 * OAuth token set
 */
export interface TokenSet {
  accessToken: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  refreshToken?: string | undefined;
  expiresIn?: number | undefined;
  expiresAt?: Date | undefined;
  tokenType?: string | undefined;
  scope?: string | undefined;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  url: string;
  events: string[];
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  secret?: string | undefined;
  metadata?: any | undefined;
}

/**
 * Webhook registration result
 */
export interface WebhookRegistration {
  webhookId: string;
  url: string;
  events: string[];
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  secret?: string | undefined;
  createdAt: Date;
}

/**
 * Webhook event
 */
export interface WebhookEvent {
  provider: IntegrationProvider;
  type: string;
  data: any;
  timestamp: Date;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  signature?: string | undefined;
  headers?: Record<string, string> | undefined;
}

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  oauth: boolean;
  apiKey: boolean;
  webhooks: boolean;
  realtime: boolean;
  batchOperations: boolean;
  pagination: boolean;
  filtering: boolean;
  [key: string]: boolean | any;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Connect integration request
 */
export interface ConnectIntegrationRequest {
  projectId: string;
  provider: IntegrationProvider;
  authMethod: IntegrationAuthMethod;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  credentials?: any | undefined;
  config?: any | undefined;
  metadata?: any | undefined;
}

/**
 * Connect integration response
 */
export interface ConnectIntegrationResponse {
  success: boolean;
  connectionId: string;
  status: IntegrationConnectionStatus;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  requiresAuth?: boolean | undefined;
  authUrl?: string | undefined;
  message?: string | undefined;
}

/**
 * OAuth callback request
 */
export interface OAuthCallbackRequest {
  code: string;
  state: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  error?: string | undefined;
  errorDescription?: string | undefined;
}

/**
 * Integration status response
 */
export interface IntegrationStatusResponse {
  connected: boolean;
  status: IntegrationConnectionStatus;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  connectionId?: string | undefined;
  provider: IntegrationProvider;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown' | undefined;
  lastSyncAt?: Date | undefined;
  expiresAt?: Date | undefined;
  metadata?: any | undefined;
}

/**
 * Execute operation request
 */
export interface ExecuteOperationRequest {
  connectionId: string;
  operation: string;
  params: any;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  options?: {
    timeout?: number | undefined;
    retries?: number | undefined;
    async?: boolean | undefined;
  } | undefined;
}

/**
 * Execute operation response
 */
export interface ExecuteOperationResponse {
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  data?: any | undefined;
  error?: string | undefined;
  operationId?: string | undefined;
  duration?: number | undefined;
}

// ============================================
// Event System Types
// ============================================

/**
 * Integration event handler
 */
export type IntegrationEventHandler = (event: IntegrationEvent) => Promise<void>;

/**
 * Event subscription
 */
export interface EventSubscription {
  id: string;
  pattern: string;
  handler: IntegrationEventHandler;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  provider?: IntegrationProvider | undefined;
  projectId?: string | undefined;
  createdAt: Date;
}

/**
 * Event router interface
 */
export interface EventRouter {
  // Incoming webhook handling
  handleWebhook(provider: IntegrationProvider, payload: any, headers: any): Promise<void>;
  
  // Outgoing event dispatch
  dispatchEvent(event: IntegrationEvent): Promise<void>;
  
  // Subscription management
  subscribe(pattern: string, handler: IntegrationEventHandler): string;
  unsubscribe(subscriptionId: string): void;
  
  // Batch operations
  dispatchBatch(events: IntegrationEvent[]): Promise<void>;
}

// ============================================
// Monitoring & Analytics Types
// ============================================

/**
 * Integration metrics
 */
export interface IntegrationMetrics {
  provider: IntegrationProvider;
  period: 'hour' | 'day' | 'week' | 'month';
  timestamp: Date;
  
  // Connection metrics
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  
  // API metrics
  apiCallsTotal: number;
  apiCallsSuccess: number;
  apiCallsFailed: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  
  // Webhook metrics
  webhooksReceived: number;
  webhooksProcessed: number;
  webhooksFailed: number;
  avgProcessingTimeMs: number;
  
  // Error metrics
  errorRate: number;
  errorTypes: Record<string, number>;
  
  // Rate limiting
  rateLimitHits: number;
  throttledRequests: number;
}

/**
 * API call log entry
 */
export interface APICallLog {
  id: string;
  connectionId: string;
  provider: IntegrationProvider;
  method: string;
  endpoint: string;
  requestHeaders?: any;
  requestBody?: any;
  responseStatus: number;
  responseHeaders?: any;
  responseBody?: any;
  responseTimeMs: number;
  errorMessage?: string;
  isError: boolean;
  rateLimitRemaining?: number;
  rateLimitResetAt?: Date;
  createdAt: Date;
}

// ============================================
// Error Types
// ============================================

/**
 * Integration error
 */
export class IntegrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: IntegrationProvider,
    public details?: any,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

/**
 * Common error codes
 */
export enum IntegrationErrorCode {
  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Connection errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  
  // Operation errors
  OPERATION_FAILED = 'OPERATION_FAILED',
  INVALID_OPERATION = 'INVALID_OPERATION',
  INVALID_PARAMS = 'INVALID_PARAMS',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // Webhook errors
  WEBHOOK_VALIDATION_FAILED = 'WEBHOOK_VALIDATION_FAILED',
  WEBHOOK_PROCESSING_FAILED = 'WEBHOOK_PROCESSING_FAILED',
  
  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED'
}

// ============================================
// Utility Types
// ============================================

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  cursor?: string;
  offset?: number;
}

/**
 * Pagination result
 */
export interface PaginatedResult<T> {
  data: T[];
  total?: number;
  page?: number;
  limit?: number;
  hasMore: boolean;
  nextCursor?: string;
  prevCursor?: string;
}

/**
 * Filter options
 */
export interface FilterOptions {
  provider?: IntegrationProvider;
  status?: IntegrationConnectionStatus;
  category?: IntegrationCategory;
  startDate?: Date;
  endDate?: Date;
  [key: string]: any;
}

/**
 * Sort options
 */
export interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}

// ============================================
// Service Interfaces
// ============================================

/**
 * Integration service interface
 */
export interface IntegrationService {
  // Connection management
  connect(request: ConnectIntegrationRequest): Promise<ConnectIntegrationResponse>;
  disconnect(connectionId: string): Promise<void>;
  getConnection(connectionId: string): Promise<IntegrationConnection | null>;
  getConnections(projectId: string, filter?: FilterOptions): Promise<IntegrationConnection[]>;
  
  // OAuth flow
  initiateOAuth(provider: IntegrationProvider, projectId: string): Promise<string>;
  handleOAuthCallback(request: OAuthCallbackRequest): Promise<ConnectIntegrationResponse>;
  
  // Operations
  execute(request: ExecuteOperationRequest): Promise<ExecuteOperationResponse>;
  
  // Health & status
  getStatus(connectionId: string): Promise<IntegrationStatusResponse>;
  checkHealth(connectionId: string): Promise<HealthCheckResult>;
  
  // Webhooks
  handleWebhook(provider: IntegrationProvider, payload: any, headers: any): Promise<void>;
  
  // Providers
  getProviders(category?: IntegrationCategory): Promise<IntegrationProviderConfig[]>;
  getProvider(provider: IntegrationProvider): Promise<IntegrationProviderConfig | null>;
}

/**
 * Authentication manager interface
 */
export interface AuthenticationManager {
  // OAuth 2.0
  initiateOAuth(provider: IntegrationProvider, state: string, redirectUri: string): string;
  exchangeCode(provider: IntegrationProvider, code: string, verifier?: string): Promise<TokenSet>;
  refreshToken(connectionId: string): Promise<TokenSet>;
  
  // API Key management
  storeApiKey(connectionId: string, apiKey: string, apiSecret?: string): Promise<void>;
  validateApiKey(connectionId: string): Promise<boolean>;
  
  // Webhook signatures
  generateWebhookSecret(): string;
  validateWebhookSignature(provider: IntegrationProvider, payload: any, signature: string, secret: string): boolean;
  
  // Token storage
  storeTokens(connectionId: string, tokens: TokenSet): Promise<void>;
  getTokens(connectionId: string): Promise<TokenSet | null>;
  deleteTokens(connectionId: string): Promise<void>;
}

// ============================================
// Export Provider-Specific Types
// ============================================

// MENA Providers (Priority)
export * from './providers/mena-payments';
export * from './providers/mena-communication';

// Existing Providers
// Note: These providers are exported from their implementation files if they exist
export * from './providers/google-analytics';