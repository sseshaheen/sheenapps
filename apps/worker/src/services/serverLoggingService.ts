import Redis from 'ioredis';

/**
 * Server-wide structured logging with optional Redis buffer
 * Provides immediate dashboard access while maintaining structured stdout for aggregators
 */
export interface ServerLogEntry {
  timestamp: number;
  serverId: string;
  logType: 'ai_limit' | 'performance' | 'error' | 'capacity' | 'routing' | 'health' | 'websocket' | 'trust_safety' | 'advisor_matching';
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  message: string;
  metadata: Record<string, any>;
}

export class ServerLoggingService {
  private static instance: ServerLoggingService;
  private redis?: Redis;
  private readonly LOG_KEY = 'server:logs';
  private readonly useRedisBuffer: boolean;
  private readonly maxRedisEntries: number;
  private readonly serverId: string;
  
  constructor(
    useRedisBuffer = process.env.ENABLE_REDIS_LOGGING === 'true',
    maxRedisEntries = parseInt(process.env.MAX_REDIS_LOG_ENTRIES || '1000')
  ) {
    this.useRedisBuffer = useRedisBuffer;
    // Lazy-init Redis connection only when needed
    if (this.useRedisBuffer) {
      try {
        this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      } catch (error) {
        console.error('Failed to initialize Redis connection for logging buffer:', error);
        // Continue without Redis buffer - non-fatal for logging functionality
      }
    }
    this.maxRedisEntries = maxRedisEntries;
    this.serverId = process.env.SERVER_ID || 'default';
  }
  
  static getInstance(): ServerLoggingService {
    if (!ServerLoggingService.instance) {
      ServerLoggingService.instance = new ServerLoggingService();
    }
    return ServerLoggingService.instance;
  }

  /**
   * Log a structured server event with both stdout and optional Redis buffer
   * @param logType - Category of log entry
   * @param level - Log level for filtering and alerting
   * @param message - Human-readable message
   * @param metadata - Structured data for analysis
   */
  async logServerEvent(
    logType: ServerLogEntry['logType'],
    level: ServerLogEntry['level'],
    message: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const logEntry: ServerLogEntry = {
      timestamp: Date.now(),
      serverId: this.serverId,
      logType,
      level,
      message,
      metadata
    };

    // Always log to structured stdout for aggregators (Datadog, ELK, etc.)
    const structuredLog = {
      level,
      timestamp: new Date().toISOString(),
      service: 'sheenapps-claude-worker',
      server_id: logEntry.serverId,
      log_type: logType,
      message,
      ...metadata
    };
    
    console.log(JSON.stringify(structuredLog));

    // Optionally store in Redis buffer for immediate dashboard access
    if (this.useRedisBuffer && this.redis) {
      try {
        await this.redis.lpush(this.LOG_KEY, JSON.stringify(logEntry));
        await this.redis.ltrim(this.LOG_KEY, 0, this.maxRedisEntries - 1);
      } catch (error) {
        console.error('Failed to store log in Redis buffer:', error);
        // Don't fail the original operation if Redis buffer fails
      }
    }
  }

  /**
   * Get recent logs from Redis buffer (if enabled)
   * @param count - Number of recent logs to retrieve
   * @param logType - Filter by log type
   * @param level - Filter by log level
   * @returns Array of log entries
   */
  async getRecentLogs(
    count: number = 100,
    logType?: ServerLogEntry['logType'],
    level?: ServerLogEntry['level']
  ): Promise<ServerLogEntry[]> {
    if (!this.useRedisBuffer || !this.redis) {
      console.warn('Redis logging buffer is disabled or unavailable');
      return [];
    }

    try {
      const logs = await this.redis.lrange(this.LOG_KEY, 0, count - 1);

      return logs
        .map(log => {
          try {
            return JSON.parse(log);
          } catch (e) {
            console.error('Failed to parse log entry:', log);
            return null;
          }
        })
        .filter(Boolean)
        .filter(entry => {
          if (logType && entry.logType !== logType) return false;
          if (level && entry.level !== level) return false;
          return true;
        });
    } catch (error) {
      console.error('Failed to retrieve logs from Redis buffer:', error);
      return [];
    }
  }

  /**
   * Get logs by server ID (useful for multi-server debugging)
   */
  async getLogsByServer(
    serverId: string,
    count: number = 50
  ): Promise<ServerLogEntry[]> {
    const logs = await this.getRecentLogs(count * 2); // Get more to filter
    return logs.filter(log => log.serverId === serverId).slice(0, count);
  }

  /**
   * Get error summary for monitoring dashboards
   */
  async getErrorSummary(
    hours: number = 24
  ): Promise<{
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsByLevel: Record<string, number>;
    recentCritical: ServerLogEntry[];
  }> {
    try {
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      const recentLogs = await this.getRecentLogs(1000); // Get substantial sample
      
      const errorLogs = recentLogs.filter(log => 
        (log.level === 'error' || log.level === 'critical') && 
        log.timestamp >= cutoffTime
      );

      const errorsByType: Record<string, number> = {};
      const errorsByLevel: Record<string, number> = {};

      errorLogs.forEach(log => {
        errorsByType[log.logType] = (errorsByType[log.logType] || 0) + 1;
        errorsByLevel[log.level] = (errorsByLevel[log.level] || 0) + 1;
      });

      const recentCritical = errorLogs
        .filter(log => log.level === 'critical')
        .slice(0, 10); // Last 10 critical errors

      return {
        totalErrors: errorLogs.length,
        errorsByType,
        errorsByLevel,
        recentCritical
      };
    } catch (error) {
      console.error('Failed to get error summary:', error);
      return {
        totalErrors: 0,
        errorsByType: {},
        errorsByLevel: {},
        recentCritical: []
      };
    }
  }

  // ============================================================================
  // CONVENIENCE METHODS - Standard log levels
  // ============================================================================

  /**
   * Log an info message (sync wrapper for consistency)
   */
  info(message: string, metadata: Record<string, any> = {}): void {
    void this.logServerEvent('health', 'info', message, metadata);
  }

  /**
   * Log a warning message (sync wrapper for consistency)
   */
  warn(message: string, metadata: Record<string, any> = {}): void {
    void this.logServerEvent('health', 'warn', message, metadata);
  }

  /**
   * Log an error message (sync wrapper for consistency)
   */
  error(message: string, metadata: Record<string, any> = {}): void {
    void this.logServerEvent('error', 'error', message, metadata);
  }

  /**
   * Log a debug message (sync wrapper for consistency)
   */
  debug(message: string, metadata: Record<string, any> = {}): void {
    void this.logServerEvent('health', 'debug', message, metadata);
  }

  // ============================================================================
  // HIGH-VALUE EVENT LOGGERS - Key scenarios to track
  // ============================================================================

  /**
   * Log AI usage limit events with detailed context
   */
  async logAIUsageLimit(
    resetTime: number,
    errorMessage: string,
    provider: string = 'anthropic',
    limitType: 'local' | 'global' = 'local'
  ): Promise<void> {
    await this.logServerEvent('ai_limit', 'warn', 
      `AI usage limit reached for ${provider} (${limitType})`, {
      provider,
      limitType,
      resetTime,
      resetTimeISO: new Date(resetTime).toISOString(),
      timeUntilReset: resetTime - Date.now(),
      hasErrorDetails: !!errorMessage,
      // Don't log full error message to avoid sensitive data exposure
      errorLength: errorMessage?.length || 0
    });
  }

  /**
   * Log capacity-related events (routing, queuing, etc.)
   */
  async logCapacityEvent(
    eventType: string,
    details: Record<string, any>,
    level: 'info' | 'warn' | 'error' = 'info'
  ): Promise<void> {
    await this.logServerEvent('capacity', level, 
      `Capacity event: ${eventType}`, {
      capacityEventType: eventType,
      ...details
    });
  }

  /**
   * Log request routing events for multi-server coordination
   */
  async logRoutingEvent(
    routingType: 'local' | 'external' | 'failed',
    details: {
      buildId?: string;
      userId?: string;
      fromServer?: string;
      toServer?: string;
      reason?: string;
      success?: boolean;
    }
  ): Promise<void> {
    const level = routingType === 'failed' ? 'error' : 'info';
    await this.logServerEvent('routing', level, 
      `Request routing: ${routingType}`, details);
  }

  /**
   * Log performance-related issues
   */
  async logPerformanceIssue(
    issueType: string,
    metrics: {
      duration?: number;
      memoryUsage?: number;
      queueDepth?: number;
      activeBuilds?: number;
    },
    level: 'warn' | 'error' = 'warn'
  ): Promise<void> {
    await this.logServerEvent('performance', level,
      `Performance issue: ${issueType}`, {
      performanceIssueType: issueType,
      ...metrics
    });
  }

  /**
   * Log health check events and status changes
   */
  async logHealthEvent(
    healthStatus: 'healthy' | 'degraded' | 'unhealthy',
    details: Record<string, any>
  ): Promise<void> {
    const level = healthStatus === 'unhealthy' ? 'error' : 
                  healthStatus === 'degraded' ? 'warn' : 'info';
    
    await this.logServerEvent('health', level,
      `Server health status: ${healthStatus}`, {
      healthStatus,
      ...details
    });
  }

  /**
   * Log critical system errors that require immediate attention
   */
  async logCriticalError(
    errorType: string,
    error: Error | string,
    context: Record<string, any> = {}
  ): Promise<void> {
    const errorDetails = typeof error === 'string' ? error : error.message;
    
    await this.logServerEvent('error', 'critical',
      `Critical system error: ${errorType}`, {
      errorType,
      errorMessage: errorDetails,
      errorStack: typeof error === 'object' ? error.stack : undefined,
      ...context
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clear Redis log buffer (admin operation)
   */
  async clearLogBuffer(): Promise<void> {
    if (!this.useRedisBuffer || !this.redis) {
      console.warn('Redis logging buffer is disabled or unavailable');
      return;
    }

    try {
      await this.redis.del(this.LOG_KEY);
      console.log('[ServerLogging] Log buffer cleared');
    } catch (error) {
      console.error('Failed to clear log buffer:', error);
      throw error;
    }
  }

  /**
   * Get Redis buffer status
   */
  async getBufferStatus(): Promise<{
    enabled: boolean;
    currentSize: number;
    maxSize: number;
    oldestEntry: string | null;
    newestEntry: string | null;
  }> {
    if (!this.useRedisBuffer || !this.redis) {
      return {
        enabled: false,
        currentSize: 0,
        maxSize: this.maxRedisEntries,
        oldestEntry: null,
        newestEntry: null
      };
    }

    try {
      const currentSize = await this.redis.llen(this.LOG_KEY);
      const oldestEntry = await this.redis.lindex(this.LOG_KEY, -1);
      const newestEntry = await this.redis.lindex(this.LOG_KEY, 0);

      return {
        enabled: true,
        currentSize,
        maxSize: this.maxRedisEntries,
        oldestEntry,
        newestEntry
      };
    } catch (error) {
      console.error('Failed to get buffer status:', error);
      return {
        enabled: true,
        currentSize: 0,
        maxSize: this.maxRedisEntries,
        oldestEntry: null,
        newestEntry: null
      };
    }
  }
}