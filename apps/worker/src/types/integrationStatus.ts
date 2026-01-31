/**
 * Integration Status System TypeScript Interfaces
 *
 * Core types for the unified integration status API providing GitHub, Vercel,
 * Sanity, and Supabase integration status with real-time updates.
 */

export type IntegrationKey = 'github' | 'vercel' | 'sanity' | 'supabase';

export type IntegrationStatusType = 'connected' | 'warning' | 'error' | 'disconnected';

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer';

/**
 * Individual integration status object
 */
export interface IntegrationStatus {
  /** Integration identifier */
  key: IntegrationKey;

  /** Whether this integration is configured for the project */
  configured: boolean;

  /** Whether this integration should be visible to the current user (role-based) */
  visible: boolean;

  /** Current status of the integration */
  status: IntegrationStatusType;

  /** Human-readable status message */
  message: string;

  /** Additional metadata (version info, last activity, etc.) */
  metadata?: Record<string, any>;

  /** Available quick actions for this integration */
  actions?: IntegrationAction[];

  /** Timestamp of last status update */
  lastUpdated: string; // ISO-8601

  /** Timestamp of next scheduled check */
  nextCheck?: string; // ISO-8601
}

/**
 * Main API response envelope for integration status
 */
export interface IntegrationStatusResponse {
  /** Always returns all 4 integration keys for stable UI layout */
  integrations: {
    github: IntegrationStatus;
    vercel: IntegrationStatus;
    sanity: IntegrationStatus;
    supabase: IntegrationStatus;
  };

  /** Overall project status (worst-case across all integrations) */
  overallStatus: IntegrationStatusType;

  /** Total response time in milliseconds */
  responseTime: number;

  /** Cache information */
  cache: {
    /** Hash for ETag caching */
    hash: string;

    /** When this data expires and should be refreshed */
    expiresAt: string; // ISO-8601

    /** Whether this response came from cache */
    fromCache: boolean;
  };

  /** Timestamp when this status was generated */
  timestamp: string; // ISO-8601

  /** Optional: Performance metrics (when includeMetrics=true) */
  metrics?: IntegrationMetrics;
}

/**
 * Available action for an integration
 */
export interface IntegrationAction {
  /** Action identifier */
  id: string;

  /** Display name for the action */
  name: string;

  /** Description of what this action does */
  description: string;

  /** Whether this action is available to the current user */
  available: boolean;

  /** Required parameters for this action */
  parameters?: ActionParameter[];

  /** Estimated time to complete this action */
  estimatedDuration?: string;
}

/**
 * Parameter definition for an action
 */
export interface ActionParameter {
  /** Parameter name */
  key: string;

  /** Parameter type */
  type: 'string' | 'boolean' | 'number' | 'select';

  /** Whether this parameter is required */
  required: boolean;

  /** Default value */
  default?: any;

  /** Available options (for select type) */
  options?: Array<{ value: any; label: string }>;

  /** Parameter description */
  description?: string;
}

/**
 * Request body for executing an integration action
 */
export interface IntegrationActionRequest {
  /** User ID (explicit authentication) */
  userId: string;

  /** Which integration to act on */
  integrationKey: IntegrationKey;

  /** Action to execute */
  actionId: string;

  /** Action parameters */
  parameters?: Record<string, any>;
}

/**
 * Response from action execution
 */
export interface IntegrationActionResponse {
  /** Whether the action was accepted */
  success: boolean;

  /** Action execution ID for tracking */
  actionId: string;

  /** Human-readable result message */
  message: string;

  /** Additional result data */
  data?: Record<string, any>;

  /** Error information if action failed */
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };

  /** Timestamp when action was executed */
  timestamp: string; // ISO-8601
}

/**
 * Server-Sent Events data structure
 */
export interface IntegrationStatusEvent {
  /** Event ID for Last-Event-ID resumption */
  id: string;

  /** Event type */
  type: 'status.updated' | 'action.completed' | 'connection.changed' | 'heartbeat';

  /** Project this event relates to */
  projectId: string;

  /** Which integration triggered this event (null for project-wide events) */
  integrationKey?: IntegrationKey;

  /** Event payload */
  data: {
    /** New status information */
    status?: Partial<IntegrationStatus>;

    /** Action result (for action.completed events) */
    actionResult?: IntegrationActionResponse;

    /** Connection change details (for connection.changed events) */
    connectionChange?: {
      from: IntegrationStatusType;
      to: IntegrationStatusType;
      reason: string;
    };

    /** Additional event data */
    [key: string]: any;
  };

  /** Event timestamp */
  timestamp: string; // ISO-8601
}

/**
 * Performance metrics (optional response data)
 */
export interface IntegrationMetrics {
  /** Per-adapter performance */
  adapters: {
    [key in IntegrationKey]: {
      /** Response time in milliseconds */
      responseTime: number;

      /** Whether response came from cache */
      fromCache: boolean;

      /** Circuit breaker state */
      circuitBreaker: {
        state: 'closed' | 'open' | 'half-open';
        failureCount: number;
        successCount: number;
        lastFailure?: string; // ISO-8601
      };

      /** Error information if adapter failed */
      error?: string;
    };
  };

  /** Total aggregation time */
  totalTime: number;

  /** Number of adapters that failed */
  failedAdapters: number;

  /** Cache hit rate for this request */
  cacheHitRate: number;
}

/**
 * Error response structure
 */
export interface IntegrationErrorResponse {
  /** Error type */
  error: string;

  /** Human-readable error message */
  message: string;

  /** Structured error code for programmatic handling */
  code?: string;

  /** Additional error context */
  params?: Record<string, any>;

  /** HTTP status code */
  statusCode?: number;

  /** Timestamp when error occurred */
  timestamp?: string; // ISO-8601
}

/**
 * Query parameters for status endpoint
 */
export interface IntegrationStatusQuery {
  /** Project UUID */
  projectId: string;

  /** User UUID (explicit authentication) */
  userId: string;

  /** Include performance metrics in response */
  includeMetrics?: boolean;

  /** Force refresh bypassing cache */
  forceRefresh?: boolean;
}

/**
 * Query parameters for SSE endpoint
 */
export interface IntegrationEventsQuery {
  /** Project UUID */
  projectId: string;

  /** User UUID (explicit authentication) */
  userId: string;

  /** Last received event ID for resumption */
  lastEventId?: string;
}

/**
 * Available actions query parameters
 */
export interface IntegrationActionsQuery {
  /** User UUID (explicit authentication) */
  userId: string;
}