import Redis from 'ioredis';

/**
 * Global AI Limit Service
 * Manages AI provider limits across multiple servers to prevent thrashing
 * Ensures all servers are aware when AI limits are hit for specific providers
 */
export class GlobalLimitService {
  private static instance: GlobalLimitService;
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  
  static getInstance(): GlobalLimitService {
    if (!GlobalLimitService.instance) {
      GlobalLimitService.instance = new GlobalLimitService();
    }
    return GlobalLimitService.instance;
  }

  /**
   * Set global AI provider limit that all servers can see
   * 
   * @param provider - AI provider name (e.g., 'anthropic', 'openai')
   * @param region - Provider region (e.g., 'us-east', 'eu-west')
   * @param resetTime - When the limit resets (epoch timestamp)
   * @param errorMessage - Original error message for debugging
   */
  async setGlobalProviderLimit(
    provider: string, 
    region: string, 
    resetTime: number, 
    errorMessage: string
  ): Promise<void> {
    const limitKey = `ai:limit:${provider}:${region}`;
    
    // Critical bug fix: Ensure TTL is never 0 or negative, add buffer for clock skew
    const rawTtlSeconds = Math.floor((resetTime - Date.now()) / 1000);
    const ttlSeconds = Math.max(5, rawTtlSeconds + 30); // Minimum 5s, add 30s buffer
    
    const limitData = {
      active: true,
      resetAt: resetTime,
      provider,
      region,
      setBy: process.env.SERVER_ID || 'default',
      setAt: Date.now(),
      errorMessage
    };
    
    try {
      await this.redis.setex(limitKey, ttlSeconds, JSON.stringify(limitData));
      
      // Enhanced logging with TTL information for debugging
      console.log(`[GlobalLimit] Provider ${provider}:${region} limited until ${new Date(resetTime).toISOString()} (TTL: ${ttlSeconds}s)`);
      
      // Verify the TTL was set correctly (debugging aid)
      const actualTtl = await this.redis.ttl(limitKey);
      if (actualTtl <= 0) {
        console.warn(`[GlobalLimit] WARNING: TTL verification failed for ${limitKey}, actual TTL: ${actualTtl}`);
      }
    } catch (error) {
      console.error('[GlobalLimit] Failed to set global provider limit:', error);
      // Don't throw - local limits can still work
    }
  }

  /**
   * Check if a specific provider/region is globally limited
   * 
   * @param provider - AI provider name
   * @param region - Provider region
   * @returns true if provider is currently limited
   */
  async isProviderLimited(provider: string, region: string): Promise<boolean> {
    const limitKey = `ai:limit:${provider}:${region}`;
    
    try {
      // Use pipeline for atomic check of existence and TTL
      const pipeline = this.redis.pipeline();
      pipeline.exists(limitKey);
      pipeline.ttl(limitKey);
      
      const results = await pipeline.exec();
      const exists = results?.[0]?.[1] === 1;
      const ttl = results?.[1]?.[1] as number;
      
      // Additional safety: Check if key exists but TTL is expired/invalid
      if (exists && ttl <= 0) {
        console.warn(`[GlobalLimit] Found expired limit key ${limitKey} (TTL: ${ttl}), cleaning up`);
        await this.redis.del(limitKey).catch(err => 
          console.error(`[GlobalLimit] Failed to cleanup expired key ${limitKey}:`, err)
        );
        return false;
      }
      
      return exists;
    } catch (error) {
      console.error('[GlobalLimit] Failed to check provider limit:', error);
      return false; // Assume not limited if Redis fails (fail safe)
    }
  }

  /**
   * Get detailed information about a provider limit
   * 
   * @param provider - AI provider name
   * @param region - Provider region
   * @returns Limit information or null if not limited
   */
  async getProviderLimitInfo(provider: string, region: string): Promise<any | null> {
    const limitKey = `ai:limit:${provider}:${region}`;
    
    try {
      const data = await this.redis.get(limitKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[GlobalLimit] Failed to get provider limit info:', error);
      return null;
    }
  }

  /**
   * Get all currently limited providers across all regions
   * Useful for monitoring dashboards
   * 
   * @returns Array of limited provider information
   */
  async getAllLimitedProviders(): Promise<Array<{
    provider: string;
    region: string;
    resetAt: number;
    setBy: string;
    setAt: number;
    timeRemaining: number;
  }>> {
    try {
      const keys = await this.redis.keys('ai:limit:*:*');
      const limitData = await Promise.all(
        keys.map(async (key) => {
          const data = await this.redis.get(key);
          return data ? JSON.parse(data) : null;
        })
      );

      return limitData
        .filter(Boolean)
        .map((data) => ({
          provider: data.provider,
          region: data.region,
          resetAt: data.resetAt,
          setBy: data.setBy,
          setAt: data.setAt,
          timeRemaining: Math.max(0, data.resetAt - Date.now())
        }));
    } catch (error) {
      console.error('[GlobalLimit] Failed to get all limited providers:', error);
      return [];
    }
  }

  /**
   * Clear a provider limit manually (admin override)
   * Use with caution - should only be done when limit is confirmed to be reset
   * 
   * @param provider - AI provider name
   * @param region - Provider region
   */
  async clearProviderLimit(provider: string, region: string): Promise<void> {
    const limitKey = `ai:limit:${provider}:${region}`;
    
    try {
      await this.redis.del(limitKey);
      console.log(`[GlobalLimit] Manually cleared limit for ${provider}:${region}`);
    } catch (error) {
      console.error('[GlobalLimit] Failed to clear provider limit:', error);
      throw error;
    }
  }

  /**
   * Check if any AI provider is currently limited
   * Useful for quick capacity checks
   * 
   * @returns true if any provider is limited
   */
  async isAnyProviderLimited(): Promise<boolean> {
    try {
      const keys = await this.redis.keys('ai:limit:*:*');
      return keys.length > 0;
    } catch (error) {
      console.error('[GlobalLimit] Failed to check if any provider is limited:', error);
      return false;
    }
  }

  /**
   * Get time until next provider limit reset
   * Useful for determining retry timing
   * 
   * @returns Time in milliseconds until next reset, or 0 if no limits
   */
  async getTimeUntilNextReset(): Promise<number> {
    try {
      const limitedProviders = await this.getAllLimitedProviders();
      
      if (limitedProviders.length === 0) {
        return 0;
      }

      // Find the shortest remaining time
      const minTimeRemaining = Math.min(...limitedProviders.map(p => p.timeRemaining));
      return Math.max(0, minTimeRemaining);
    } catch (error) {
      console.error('[GlobalLimit] Failed to get time until next reset:', error);
      return 0;
    }
  }
}