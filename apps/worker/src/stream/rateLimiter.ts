import { unifiedLogger } from '../services/unifiedLogger';

export class SimpleRateLimiter {
  private running = 0;
  private readonly maxConcurrent: number;
  private readonly waitQueue: Array<() => void> = [];

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
    console.log(`[RateLimiter] Initialized with max concurrent: ${maxConcurrent}`);
  }

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      console.log(`[RateLimiter] Acquired slot (${this.running}/${this.maxConcurrent})`);
      return;
    }

    // Wait for a slot to become available
    console.log(`[RateLimiter] Waiting for slot (${this.running}/${this.maxConcurrent})`);
    
    // Log rate limit hit
    unifiedLogger.system('rate_limit_hit', 'warn', 'Rate limit reached, request queued', {
      running: this.running,
      maxConcurrent: this.maxConcurrent,
      queueLength: this.waitQueue.length
    });
    
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    console.log(`[RateLimiter] Released slot (${this.running}/${this.maxConcurrent})`);

    // If there are waiting requests, let one through
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        this.running++;
        console.log(`[RateLimiter] Granted slot to waiting request (${this.running}/${this.maxConcurrent})`);
        
        // Log queue processing
        unifiedLogger.system('rate_limit_queue_processed', 'info', 'Queued request granted slot', {
          running: this.running,
          maxConcurrent: this.maxConcurrent,
          remainingQueue: this.waitQueue.length
        });
        
        next();
      }
    }
  }

  getStatus(): { running: number; waiting: number; maxConcurrent: number } {
    return {
      running: this.running,
      waiting: this.waitQueue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}

// Singleton instance for global rate limiting
let globalRateLimiter: SimpleRateLimiter | null = null;

export function getGlobalRateLimiter(): SimpleRateLimiter {
  if (!globalRateLimiter) {
    const maxConcurrent = parseInt(process.env.CLAUDE_MAX_CONCURRENT || '5');
    globalRateLimiter = new SimpleRateLimiter(maxConcurrent);
    
    // Log rate limiter initialization
    unifiedLogger.system('rate_limiter_initialized', 'info', 'Global rate limiter initialized', {
      maxConcurrent,
      source: process.env.CLAUDE_MAX_CONCURRENT ? 'environment' : 'default'
    });
  }
  return globalRateLimiter;
}