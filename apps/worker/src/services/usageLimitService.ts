import Redis from 'ioredis';

// =====================================================
// TYPES AND INTERFACES
// =====================================================

export interface UsageLimitState {
  isLimited: boolean;
  resetTime: number; // epoch timestamp
  lastChecked: number;
  errorMessage: string;
}

// =====================================================
// USAGE LIMIT SERVICE
// =====================================================

export class UsageLimitService {
  private static instance: UsageLimitService;
  private redis: Redis;
  private localCache: UsageLimitState | null = null; // Minimal in-memory cache
  private readonly LIMIT_KEY = 'claude:usage_limit';
  
  constructor() {
    // Use same Redis instance as BullMQ
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  
  static getInstance(): UsageLimitService {
    if (!UsageLimitService.instance) {
      UsageLimitService.instance = new UsageLimitService();
    }
    return UsageLimitService.instance;
  }
  
  /**
   * Check if error message indicates Claude CLI usage limit
   */
  static isUsageLimitError(error: string): boolean {
    if (!error || typeof error !== 'string') return false;
    
    // Pattern: "Claude AI usage limit reached|1753675200"
    const usageLimitPattern = /Claude AI usage limit reached\|(\d+)/i;
    return usageLimitPattern.test(error);
  }
  
  /**
   * Extract reset time from usage limit error message
   */
  static extractResetTime(error: string): number | null {
    if (!error || typeof error !== 'string') return null;
    
    const usageLimitPattern = /Claude AI usage limit reached\|(\d+)/i;
    const match = error.match(usageLimitPattern);
    
    if (match && match[1]) {
      const resetTime = parseInt(match[1], 10);
      // Validate timestamp is reasonable (not too far in past/future)
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      
      if (resetTime > now - oneDay && resetTime < now + oneDay) {
        return resetTime;
      }
    }
    
    return null;
  }
  
  /**
   * Set usage limit state with TTL expiration
   */
  async setUsageLimit(resetTime: number, errorMessage: string): Promise<void> {
    const now = Date.now();
    
    // Validate reset time is in the future
    if (resetTime <= now) {
      console.log(`[UsageLimit] Reset time ${resetTime} is in the past, ignoring`);
      return;
    }
    
    // Calculate TTL in seconds (Redis expects seconds)
    const ttlSeconds = Math.max(1, Math.floor((resetTime - now) / 1000));
    
    const limitData = {
      resetTime,
      errorMessage,
      setAt: now
    };
    
    console.log(`[UsageLimit] Setting usage limit until ${new Date(resetTime).toISOString()} (TTL: ${ttlSeconds}s)`);
    
    // Use Redis SETEX to set with TTL atomically
    await this.redis.setex(this.LIMIT_KEY, ttlSeconds, JSON.stringify(limitData));
    
    // Update local cache
    this.localCache = { 
      isLimited: true, 
      resetTime, 
      lastChecked: now, 
      errorMessage 
    };
    
    console.log(`[UsageLimit] Usage limit active until ${new Date(resetTime).toISOString()}`);
  }
  
  /**
   * Check if usage limit is currently active
   */
  async isLimitActive(): Promise<boolean> {
    try {
      const exists = await this.redis.exists(this.LIMIT_KEY);
      const isActive = exists === 1;
      
      // Update local cache
      this.localCache = {
        isLimited: isActive,
        resetTime: isActive ? await this.getResetTime() || 0 : 0,
        lastChecked: Date.now(),
        errorMessage: isActive ? await this.getErrorMessage() || '' : ''
      };
      
      return isActive;
    } catch (error) {
      console.error(`[UsageLimit] Error checking limit status:`, error);
      // Fall back to local cache if Redis is unavailable
      return this.localCache?.isLimited || false;
    }
  }
  
  /**
   * Get reset time from Redis
   */
  async getResetTime(): Promise<number | null> {
    try {
      const data = await this.redis.get(this.LIMIT_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed.resetTime || null;
      }
    } catch (error) {
      console.error(`[UsageLimit] Error getting reset time:`, error);
    }
    return null;
  }
  
  /**
   * Get error message from Redis
   */
  async getErrorMessage(): Promise<string | null> {
    try {
      const data = await this.redis.get(this.LIMIT_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed.errorMessage || null;
      }
    } catch (error) {
      console.error(`[UsageLimit] Error getting error message:`, error);
    }
    return null;
  }
  
  /**
   * Get time until reset in milliseconds
   */
  async getTimeUntilReset(): Promise<number> {
    const resetTime = await this.getResetTime();
    if (!resetTime) return 0;
    
    return Math.max(0, resetTime - Date.now());
  }
  
  /**
   * Get current usage limit state
   */
  async getUsageLimitState(): Promise<UsageLimitState> {
    const isActive = await this.isLimitActive();
    
    if (!isActive) {
      return {
        isLimited: false,
        resetTime: 0,
        lastChecked: Date.now(),
        errorMessage: ''
      };
    }
    
    return {
      isLimited: true,
      resetTime: await this.getResetTime() || 0,
      lastChecked: Date.now(),
      errorMessage: await this.getErrorMessage() || ''
    };
  }
  
  /**
   * Manually clear usage limit (with safeguards)
   */
  async clearLimit(): Promise<void> {
    try {
      const data = await this.redis.get(this.LIMIT_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        const resetTime = parsed.resetTime;
        const now = Date.now();
        
        // Safety check: only allow manual clearing if reset time has passed
        // or if we're within 1 minute of reset time (for admin override)
        if (now >= resetTime || (resetTime - now) <= 60000) {
          await this.redis.del(this.LIMIT_KEY);
          this.localCache = null;
          console.log(`[UsageLimit] Usage limit manually cleared`);
        } else {
          console.log(`[UsageLimit] Manual clear denied - reset time not reached (${Math.floor((resetTime - now) / 1000)}s remaining)`);
        }
      }
    } catch (error) {
      console.error(`[UsageLimit] Error clearing limit:`, error);
    }
  }
  
  /**
   * Force clear usage limit (admin override)
   */
  async forceClearLimit(): Promise<void> {
    try {
      await this.redis.del(this.LIMIT_KEY);
      this.localCache = null;
      console.log(`[UsageLimit] Usage limit force cleared`);
    } catch (error) {
      console.error(`[UsageLimit] Error force clearing limit:`, error);
    }
  }
  
  /**
   * Get usage limit statistics
   */
  async getUsageLimitStats(): Promise<{
    isActive: boolean;
    resetTime: number | null;
    timeUntilReset: number;
    errorMessage: string | null;
    redisKeyExists: boolean;
    redisKeyTTL: number;
  }> {
    const isActive = await this.isLimitActive();
    const resetTime = await this.getResetTime();
    const timeUntilReset = await this.getTimeUntilReset();
    const errorMessage = await this.getErrorMessage();
    
    let redisKeyExists = false;
    let redisKeyTTL = -1;
    
    try {
      redisKeyExists = (await this.redis.exists(this.LIMIT_KEY)) === 1;
      if (redisKeyExists) {
        redisKeyTTL = await this.redis.ttl(this.LIMIT_KEY);
      }
    } catch (error) {
      console.error(`[UsageLimit] Error getting Redis stats:`, error);
    }
    
    return {
      isActive,
      resetTime,
      timeUntilReset,
      errorMessage,
      redisKeyExists,
      redisKeyTTL
    };
  }
}