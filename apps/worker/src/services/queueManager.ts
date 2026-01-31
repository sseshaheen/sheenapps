import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { streamQueue } from '../queue/streamQueue';
import { UsageLimitService } from './usageLimitService';

// =====================================================
// QUEUE MANAGER SERVICE
// =====================================================

export class QueueManager {
  private static instance: QueueManager;
  private redis: Redis;
  private readonly PAUSE_STATE_KEY = 'queue:pause_state';
  private readonly PAUSE_REASON_KEY = 'queue:pause_reason';
  private resumeJob: any = null; // Store delayed resume job
  
  constructor() {
    // Use same Redis instance as BullMQ
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  
  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }
  
  /**
   * Pause Claude-specific queues due to usage limit
   */
  async pauseForUsageLimit(resetTime: number, errorMessage: string): Promise<void> {
    const now = Date.now();
    const timeUntilReset = Math.max(0, resetTime - now);
    
    if (timeUntilReset <= 0) {
      console.log(`[QueueManager] Reset time ${resetTime} is in the past, not pausing queue`);
      return;
    }
    
    console.log(`[QueueManager] Pausing Claude queues due to usage limit until ${new Date(resetTime).toISOString()}`);
    
    try {
      // Pause the stream queue (selective pausing)
      await streamQueue.pause();
      
      // Store pause state in Redis
      const pauseData = {
        reason: 'usage_limit',
        resetTime,
        errorMessage,
        pausedAt: now
      };
      
      await this.redis.setex(this.PAUSE_STATE_KEY, Math.ceil(timeUntilReset / 1000), JSON.stringify(pauseData));
      await this.redis.setex(this.PAUSE_REASON_KEY, Math.ceil(timeUntilReset / 1000), 'usage_limit');
      
      // Schedule automatic resume using BullMQ delayed job
      await this.scheduleQueueResume(resetTime);
      
      console.log(`[QueueManager] Queue paused successfully, scheduled resume at ${new Date(resetTime).toISOString()}`);
      
    } catch (error) {
      console.error(`[QueueManager] Failed to pause queue:`, error);
      throw error;
    }
  }
  
  /**
   * Pause queues due to system configuration error (indefinite pause)
   */
  async pauseForSystemError(configurationType: string, resolution: string): Promise<void> {
    console.log(`[QueueManager] Pausing Claude queues due to system configuration error: ${configurationType}`);
    
    try {
      // Pause the stream queue
      await streamQueue.pause();
      
      // Store pause state in Redis (no TTL - manual intervention required)
      const pauseData = {
        reason: 'system_config_error',
        configurationType,
        resolution,
        pausedAt: Date.now()
      };
      
      await this.redis.set(this.PAUSE_STATE_KEY, JSON.stringify(pauseData));
      await this.redis.set(this.PAUSE_REASON_KEY, 'system_config_error');
      
      console.log(`[QueueManager] Queue paused indefinitely due to system error. Manual intervention required.`);
      
    } catch (error) {
      console.error(`[QueueManager] Failed to pause queue for system error:`, error);
      throw error;
    }
  }
  
  /**
   * Resume Claude queues (manual or automatic)
   */
  async resumeQueues(reason: 'automatic' | 'manual' = 'automatic'): Promise<void> {
    console.log(`[QueueManager] Resuming Claude queues (${reason})`);
    
    try {
      // Check if queues are actually paused
      const isPaused = await streamQueue.isPaused();
      if (!isPaused) {
        console.log(`[QueueManager] Queue is not paused, nothing to resume`);
        return;
      }
      
      // Resume the stream queue
      await streamQueue.resume();
      
      // Clear pause state from Redis
      await this.redis.del(this.PAUSE_STATE_KEY);
      await this.redis.del(this.PAUSE_REASON_KEY);
      
      // Cancel scheduled resume job if it exists
      if (this.resumeJob) {
        try {
          await this.resumeJob.remove();
          this.resumeJob = null;
        } catch (error) {
          console.warn(`[QueueManager] Failed to cancel resume job:`, error);
        }
      }
      
      console.log(`[QueueManager] Queue resumed successfully`);
      
    } catch (error) {
      console.error(`[QueueManager] Failed to resume queue:`, error);
      throw error;
    }
  }
  
  /**
   * Schedule automatic queue resume at specific time
   */
  private async scheduleQueueResume(resetTime: number): Promise<void> {
    const delay = Math.max(0, resetTime - Date.now());
    
    if (delay <= 0) {
      console.log(`[QueueManager] Reset time is in the past, not scheduling resume`);
      return;
    }
    
    try {
      // Use the same queue to schedule the resume job
      this.resumeJob = await streamQueue.add(
        'queue-resume', 
        { 
          action: 'resume',
          scheduledFor: resetTime,
          reason: 'usage_limit_reset'
        },
        {
          delay,
          attempts: 1, // Don't retry resume jobs
          removeOnComplete: 1,
          removeOnFail: 1
        }
      );
      
      console.log(`[QueueManager] Scheduled queue resume in ${Math.ceil(delay / 1000)}s (${Math.ceil(delay / 60000)}m)`);
      
    } catch (error) {
      console.error(`[QueueManager] Failed to schedule queue resume:`, error);
    }
  }
  
  /**
   * Get current pause state
   */
  async getPauseState(): Promise<{
    isPaused: boolean;
    reason?: string;
    data?: any;
    queueStats?: any;
  }> {
    try {
      const isPaused = await streamQueue.isPaused();
      
      if (!isPaused) {
        return { isPaused: false };
      }
      
      const pauseReason = await this.redis.get(this.PAUSE_REASON_KEY);
      const pauseDataStr = await this.redis.get(this.PAUSE_STATE_KEY);
      const pauseData = pauseDataStr ? JSON.parse(pauseDataStr) : null;
      
      // Get queue statistics
      const waiting = await streamQueue.getWaiting();
      const active = await streamQueue.getActive();
      const completed = await streamQueue.getCompleted();
      const failed = await streamQueue.getFailed();
      
      return {
        isPaused: true,
        reason: pauseReason || 'unknown',
        data: pauseData,
        queueStats: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length
        }
      };
      
    } catch (error) {
      console.error(`[QueueManager] Error getting pause state:`, error);
      return { isPaused: false };
    }
  }
  
  /**
   * Check if should pause queue due to usage limit (called from error handlers)
   */
  async checkAndPauseForUsageLimit(): Promise<void> {
    const usageLimitService = UsageLimitService.getInstance();
    const isLimitActive = await usageLimitService.isLimitActive();
    
    if (isLimitActive) {
      const resetTime = await usageLimitService.getResetTime();
      const errorMessage = await usageLimitService.getErrorMessage();
      
      if (resetTime) {
        await this.pauseForUsageLimit(resetTime, errorMessage || 'Usage limit active');
      }
    }
  }
  
  /**
   * Force resume queues (admin override)
   */
  async forceResumeQueues(): Promise<void> {
    console.log(`[QueueManager] Force resuming queues (admin override)`);
    
    try {
      // Clear usage limit state if it exists
      const usageLimitService = UsageLimitService.getInstance();
      await usageLimitService.forceClearLimit();
      
      // Resume queues
      await this.resumeQueues('manual');
      
      console.log(`[QueueManager] Force resume completed`);
      
    } catch (error) {
      console.error(`[QueueManager] Force resume failed:`, error);
      throw error;
    }
  }
  
  /**
   * Get queue management statistics
   */
  async getQueueStats(): Promise<{
    streamQueue: {
      isPaused: boolean;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    pauseState: any;
    usageLimitState: any;
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        streamQueue.getWaiting(),
        streamQueue.getActive(), 
        streamQueue.getCompleted(),
        streamQueue.getFailed(),
        streamQueue.getDelayed()
      ]);
      
      const pauseState = await this.getPauseState();
      const usageLimitService = UsageLimitService.getInstance();
      const usageLimitStats = await usageLimitService.getUsageLimitStats();
      
      return {
        streamQueue: {
          isPaused: await streamQueue.isPaused(),
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length
        },
        pauseState,
        usageLimitState: usageLimitStats
      };
      
    } catch (error) {
      console.error(`[QueueManager] Error getting queue stats:`, error);
      throw error;
    }
  }
}