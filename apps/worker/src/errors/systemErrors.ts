// =====================================================
// SYSTEM CONFIGURATION ERROR
// =====================================================

export class SystemConfigurationError extends Error {
  public readonly status = 503; // Service Unavailable - system misconfiguration
  
  constructor(
    message: string,
    public configurationType: string,
    public resolution: string
  ) {
    super(message);
    this.name = 'SystemConfigurationError';
  }
  
  /**
   * Convert to API response format
   */
  toAPIResponse() {
    return {
      error: 'system_configuration_error',
      message: this.message,
      status: this.status,
      configurationType: this.configurationType,
      resolution: this.resolution,
      retryAfter: null // No automatic retry - requires manual fix
    };
  }
  
  /**
   * Convert to event format for webhooks/logging
   */
  toEventData() {
    return {
      errorType: 'system_configuration_error',
      message: this.message,
      configurationType: this.configurationType,
      resolution: this.resolution,
      timestamp: Date.now()
    };
  }
}

// =====================================================
// USAGE LIMIT ERROR
// =====================================================

export class UsageLimitError extends Error {
  public readonly status = 429; // Too Many Requests - rate limit exceeded
  
  constructor(
    message: string,
    public resetTime: number,
    public timeUntilReset: number
  ) {
    super(message);
    this.name = 'UsageLimitError';
  }
  
  /**
   * Convert to API response format
   */
  toAPIResponse() {
    return {
      error: 'usage_limit_exceeded',
      message: this.message,
      status: this.status,
      resetTime: new Date(this.resetTime).toISOString(),
      retryAfter: Math.ceil(this.timeUntilReset / 1000), // seconds for HTTP Retry-After header
      timeUntilReset: this.timeUntilReset,
      timeUntilResetHuman: this.formatTimeUntilReset()
    };
  }
  
  /**
   * Convert to event format for webhooks/logging
   */
  toEventData() {
    return {
      errorType: 'usage_limit_exceeded',
      message: this.message,
      resetTime: this.resetTime,
      resetTimeISO: new Date(this.resetTime).toISOString(),
      timeUntilReset: this.timeUntilReset,
      timeUntilResetHuman: this.formatTimeUntilReset(),
      timestamp: Date.now()
    };
  }
  
  /**
   * Format time until reset in human-readable format
   */
  private formatTimeUntilReset(): string {
    if (this.timeUntilReset <= 0) return 'now';
    
    const seconds = Math.floor(this.timeUntilReset / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  /**
   * Create UsageLimitError from usage limit service data
   */
  static fromUsageLimitState(resetTime: number, errorMessage?: string): UsageLimitError {
    const timeUntilReset = Math.max(0, resetTime - Date.now());
    const message = errorMessage || `Claude CLI usage limit active. Resets at ${new Date(resetTime).toISOString()}`;
    
    return new UsageLimitError(message, resetTime, timeUntilReset);
  }
}

// =====================================================
// ERROR TYPE GUARDS
// =====================================================

export function isSystemConfigurationError(error: any): error is SystemConfigurationError {
  return error instanceof SystemConfigurationError;
}

export function isUsageLimitError(error: any): error is UsageLimitError {
  return error instanceof UsageLimitError;
}

// =====================================================
// ERROR FACTORY FUNCTIONS
// =====================================================

export function createClaudeCliMissingError(workingDirectory?: string): SystemConfigurationError {
  return new SystemConfigurationError(
    `Claude CLI not found in PATH${workingDirectory ? ` when spawning from ${workingDirectory}` : ''}`,
    'claude_cli_missing',
    'Ensure Claude CLI is installed and available in PATH, or update spawn configuration to use absolute path'
  );
}

export function createClaudeCliPermissionError(stderr: string): SystemConfigurationError {
  return new SystemConfigurationError(
    `Claude CLI permission error: ${stderr}`,
    'claude_cli_permissions',
    'Check Claude CLI installation and permissions'
  );
}

export function createUsageLimitError(resetTime: number, originalError?: string): UsageLimitError {
  const timeUntilReset = Math.max(0, resetTime - Date.now());
  const message = originalError || `Claude CLI usage limit reached. Resets at ${new Date(resetTime).toISOString()}`;
  
  return new UsageLimitError(message, resetTime, timeUntilReset);
}

// =====================================================
// ERROR RESPONSE HELPERS
// =====================================================

/**
 * Convert any system error to standardized API response
 */
export function systemErrorToAPIResponse(error: Error): {
  error: string;
  message: string;
  status: number;
  [key: string]: any;
} {
  if (isSystemConfigurationError(error)) {
    return error.toAPIResponse();
  } else if (isUsageLimitError(error)) {
    return error.toAPIResponse();
  } else {
    // Generic system error
    return {
      error: 'system_error',
      message: error.message,
      status: 500
    };
  }
}

/**
 * Get HTTP status code from system error
 */
export function getSystemErrorStatus(error: Error): number {
  if (isSystemConfigurationError(error)) {
    return error.status; // 503
  } else if (isUsageLimitError(error)) {
    return error.status; // 429
  } else {
    return 500; // Generic server error
  }
}

/**
 * Get Retry-After header value from system error (in seconds)
 */
export function getRetryAfterHeader(error: Error): number | null {
  if (isUsageLimitError(error)) {
    return Math.ceil(error.timeUntilReset / 1000);
  }
  // System configuration errors should not be retried automatically
  return null;
}