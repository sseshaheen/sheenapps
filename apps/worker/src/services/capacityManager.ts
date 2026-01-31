import { GlobalLimitService } from './globalLimitService';
import { UsageLimitService } from './usageLimitService';
import { ErrorMessageRenderer } from './errorMessageRenderer';

/**
 * AI Capacity Manager
 * Handles capacity-based request routing and 429 responses
 * Implements hybrid strategy: 429 for interactive, queuing for background
 */
export class CapacityManager {
  private static instance: CapacityManager;
  private globalLimitService: GlobalLimitService;
  private usageLimitService: UsageLimitService;
  
  constructor() {
    this.globalLimitService = GlobalLimitService.getInstance();
    this.usageLimitService = UsageLimitService.getInstance();
  }
  
  static getInstance(): CapacityManager {
    if (!CapacityManager.instance) {
      CapacityManager.instance = new CapacityManager();
    }
    return CapacityManager.instance;
  }

  /**
   * Check if AI services are available for new requests
   * @param provider - AI provider to check (defaults to 'anthropic')
   * @param region - Provider region (defaults to 'us-east')
   * @returns Capacity information and recommendations
   */
  async checkAICapacity(
    provider: string = 'anthropic',
    region: string = 'us-east'
  ): Promise<{
    available: boolean;
    limitType: 'none' | 'local' | 'global' | 'both';
    resetTime: number | null;
    retryAfterSeconds: number;
    recommendation: 'proceed' | 'retry_later' | 'queue';
  }> {
    try {
      const isLocalLimited = await this.usageLimitService.isLimitActive();
      const isGlobalLimited = await this.globalLimitService.isProviderLimited(provider, region);
      
      let limitType: 'none' | 'local' | 'global' | 'both' = 'none';
      let resetTime: number | null = null;
      
      if (isLocalLimited && isGlobalLimited) {
        limitType = 'both';
        // Use the earliest reset time
        const localReset = await this.usageLimitService.getResetTime();
        const globalInfo = await this.globalLimitService.getProviderLimitInfo(provider, region);
        resetTime = Math.min(localReset || Infinity, globalInfo?.resetAt || Infinity);
      } else if (isLocalLimited) {
        limitType = 'local';
        resetTime = await this.usageLimitService.getResetTime();
      } else if (isGlobalLimited) {
        limitType = 'global';
        const globalInfo = await this.globalLimitService.getProviderLimitInfo(provider, region);
        resetTime = globalInfo?.resetAt || null;
      }
      
      const available = limitType === 'none';
      const retryAfterSeconds = resetTime ? Math.max(5, Math.ceil((resetTime - Date.now()) / 1000)) : 300;
      
      // Recommendation logic
      let recommendation: 'proceed' | 'retry_later' | 'queue' = 'proceed';
      if (!available) {
        // Short delays suggest retry, long delays suggest queuing
        recommendation = retryAfterSeconds <= 300 ? 'retry_later' : 'queue';
      }
      
      return {
        available,
        limitType,
        resetTime,
        retryAfterSeconds,
        recommendation
      };
    } catch (error) {
      console.error('[CapacityManager] Failed to check AI capacity:', error);
      
      // Fail safe: assume capacity is available but log the issue
      return {
        available: true,
        limitType: 'none',
        resetTime: null,
        retryAfterSeconds: 0,
        recommendation: 'proceed'
      };
    }
  }

  /**
   * Handle capacity limits for different request types
   * @param reply - Fastify reply object
   * @param requestType - Type of request for different handling strategies
   * @param provider - AI provider name
   * @param region - Provider region
   * @returns true if request can proceed, false if handled with error response
   */
  async handleCapacityLimits(
    reply: any,
    requestType: 'interactive' | 'background' = 'interactive',
    provider: string = 'anthropic',
    region: string = 'us-east'
  ): Promise<boolean> {
    const capacity = await this.checkAICapacity(provider, region);
    
    if (capacity.available) {
      return true; // Request can proceed
    }
    
    // Capacity is limited - handle based on request type
    const errorCode = 'AI_LIMIT_REACHED';
    const errorParams = {
      resetTime: capacity.resetTime,
      provider,
      region,
      limitType: capacity.limitType
    };
    
    const userMessage = ErrorMessageRenderer.renderErrorForUser(errorCode, errorParams);
    
    // Set appropriate HTTP headers
    reply.code(429).headers({
      'Retry-After': capacity.retryAfterSeconds.toString(),
      'X-Rate-Limit-Type': 'ai-capacity',
      'X-Rate-Limit-Reset': capacity.resetTime?.toString() || '',
      'X-Rate-Limit-Provider': provider,
      'X-Rate-Limit-Region': region
    });
    
    if (requestType === 'interactive') {
      // Interactive requests: Fast 429 with clear user guidance
      return reply.send({
        error: {
          code: errorCode,
          params: errorParams,
          message: userMessage
        },
        retryAfter: capacity.retryAfterSeconds,
        limitType: capacity.limitType,
        suggestedActions: this.getSuggestedActions(capacity),
        capacity: {
          available: false,
          resetTime: capacity.resetTime,
          recommendation: capacity.recommendation
        }
      });
    } else {
      // Background requests: Different messaging, future queuing support
      return reply.send({
        error: {
          code: errorCode,
          params: errorParams,
          message: `Background processing paused due to ${capacity.limitType} capacity limits`
        },
        retryAfter: capacity.retryAfterSeconds,
        limitType: capacity.limitType,
        queueAvailable: false, // Future: enable queuing for background jobs
        backgroundProcessing: {
          paused: true,
          reason: `${provider} capacity limits`,
          estimatedResume: capacity.resetTime
        }
      });
    }
    
    return false; // Request handled with error response
  }
  
  /**
   * Get user-friendly suggested actions based on capacity status
   */
  private getSuggestedActions(capacity: {
    available: boolean;
    limitType: string;
    retryAfterSeconds: number;
    recommendation: string;
  }): string[] {
    const actions: string[] = [];
    
    if (capacity.retryAfterSeconds <= 60) {
      actions.push('Try again in 1 minute');
    } else if (capacity.retryAfterSeconds <= 300) {
      const minutes = Math.ceil(capacity.retryAfterSeconds / 60);
      actions.push(`Try again in ${minutes} minutes`);
    } else {
      actions.push('Try again later');
    }
    
    if (capacity.recommendation === 'queue') {
      actions.push('Consider queuing this build for later processing');
    }
    
    if (capacity.limitType === 'global') {
      actions.push('This affects all servers - please be patient');
    } else if (capacity.limitType === 'local') {
      actions.push('Consider trying a different server if available');
    }
    
    return actions;
  }
  
  /**
   * Get comprehensive capacity status for monitoring dashboards
   */
  async getCapacityStatus(): Promise<{
    anthropic: {
      'us-east': any;
      'eu-west': any;
    };
    openai?: {
      'us-east': any;
    };
    local: any;
    summary: {
      anyAvailable: boolean;
      totalLimited: number;
      nextResetTime: number | null;
    };
  }> {
    try {
      // Check multiple providers and regions
      const [
        anthropicUS,
        anthropicEU,
        // openaiUS, // Future: add OpenAI support
        localStatus
      ] = await Promise.all([
        this.checkAICapacity('anthropic', 'us-east'),
        this.checkAICapacity('anthropic', 'eu-west'),
        // this.checkAICapacity('openai', 'us-east'),
        this.usageLimitService.getUsageLimitStats()
      ]);
      
      const providers = { anthropicUS, anthropicEU };
      const anyAvailable = Object.values(providers).some(p => p.available);
      const totalLimited = Object.values(providers).filter(p => !p.available).length;
      
      // Find the earliest reset time across all providers
      const resetTimes = Object.values(providers)
        .map(p => p.resetTime)
        .filter(Boolean) as number[];
      const nextResetTime = resetTimes.length > 0 ? Math.min(...resetTimes) : null;
      
      return {
        anthropic: {
          'us-east': anthropicUS,
          'eu-west': anthropicEU
        },
        local: localStatus,
        summary: {
          anyAvailable,
          totalLimited,
          nextResetTime
        }
      };
    } catch (error) {
      console.error('[CapacityManager] Failed to get capacity status:', error);
      
      return {
        anthropic: {
          'us-east': { available: true, limitType: 'none', resetTime: null, retryAfterSeconds: 0, recommendation: 'proceed' },
          'eu-west': { available: true, limitType: 'none', resetTime: null, retryAfterSeconds: 0, recommendation: 'proceed' }
        },
        local: { isActive: false, resetTime: null, timeUntilReset: 0 },
        summary: {
          anyAvailable: true,
          totalLimited: 0,
          nextResetTime: null
        }
      };
    }
  }
}