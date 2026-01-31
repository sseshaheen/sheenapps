import { createClient } from '@/lib/supabase-client';
import { createHmac } from 'crypto';
import * as Sentry from '@sentry/nextjs';

interface ClaudeResponse {
  completion: string;
  usage?: {
    tokens: number;
  };
}

interface ClaudeError {
  code: string;
  message: string;
}

// Track 429 errors for Sentry alerting
const recentErrors = new Map<string, number[]>();
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function trackError(errorType: string) {
  const now = Date.now();
  const errors = recentErrors.get(errorType) || [];
  
  // Clean old errors
  const recentErrorsList = errors.filter(time => now - time < ERROR_WINDOW_MS);
  recentErrorsList.push(now);
  recentErrors.set(errorType, recentErrorsList);
  
  // Alert if >3 errors in 5 minutes
  if (recentErrorsList.length > 3) {
    Sentry.captureMessage(`High ${errorType} error rate: ${recentErrorsList.length} errors in 5 minutes`, 'error');
  }
}

// Track usage for analytics (no quota enforcement)
async function trackUsage(userId: string): Promise<void> {
  // Always use client for Claude runner (runs client-side)
  const supabase = createClient();
  
  try {
    await supabase.rpc('track_claude_usage', {
      p_user_id: userId
    });
  } catch (error) {
    // Don't fail the request if tracking fails
    console.error('Failed to track Claude usage:', error);
  }
}

export async function runClaude(
  prompt: string, 
  userId: string,
  options?: {
    maxRetries?: number;
    fallbackToGPT?: boolean;
  }
): Promise<string> {
  const { maxRetries = 3, fallbackToGPT = true } = options || {};
  
  try {
    // Track usage for analytics only (no quota enforcement)
    await trackUsage(userId);
    
    // Generate HMAC signature
    const secret = process.env.NEXT_PUBLIC_CLAUDE_SHARED_SECRET;
    if (!secret) {
      throw new Error('CLAUDE_SHARED_SECRET not configured');
    }
    
    const signature = createHmac('sha256', secret)
      .update(prompt)
      .digest('hex');
    
    const workerUrl = process.env.NEXT_PUBLIC_CLAUDE_WORKER_URL;
    if (!workerUrl) {
      throw new Error('CLAUDE_WORKER_URL not configured');
    }
    
    let lastError: Error | null = null;
    
    // Generate correlation ID for request tracking (worker team requested)
    const correlationId = `nextjs_claude_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    
    console.log(`[NextJS] Claude Runner API call (correlation: ${correlationId}):`, {
      correlationId,
      endpoint: workerUrl,
      userId: userId?.slice(0, 8),
      promptLength: prompt.length,
      timestamp: new Date().toISOString()
    });
    
    // Retry logic
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(workerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-sheen-signature': signature,
            'x-correlation-id': correlationId  // ADD CORRELATION ID HEADER
          },
          body: JSON.stringify({ prompt }),
          signal: AbortSignal.timeout(120000) // 2 minute timeout
        });
        
        if (response.status === 429) {
          trackError('429');
          
          if (fallbackToGPT) {
            console.log('Claude rate limited, falling back to GPT-4');
            // Import and use existing GPT runner
            const { gpt4Runner } = await import('./gpt4Runner');
            return await gpt4Runner(prompt);
          }
          
          throw new Error('RATE_LIMITED');
        }
        
        if (!response.ok) {
          trackError(`HTTP_${response.status}`);
          throw new Error(`Worker returned ${response.status}`);
        }
        
        const data: ClaudeResponse = await response.json();
        
        console.log(`[NextJS] Claude Runner response (correlation: ${correlationId}):`, {
          correlationId,
          success: true,
          hasCompletion: !!data.completion,
          completionLength: data.completion?.length || 0
        });
        
        return data.completion;
        
      } catch (error) {
        lastError = error as Error;
        
        console.log(`[NextJS] Claude Runner error (correlation: ${correlationId}):`, {
          correlationId,
          attempt,
          maxRetries,
          error: error instanceof Error ? error.message : String(error)
        });
        
        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
      }
    }
    
    // All retries failed
    Sentry.captureException(lastError, {
      tags: {
        service: 'claude-worker',
        userId
      },
      extra: {
        prompt: prompt.slice(0, 100), // Don't log full prompts
        attempts: maxRetries
      }
    });
    
    throw lastError;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log specific error types
    if (errorMessage === 'RATE_LIMITED') {
      console.log('Claude worker rate limited');
    } else {
      console.error('Claude runner error:', error);
    }
    
    // Re-throw for caller to handle
    throw error;
  }
}

// Export usage stats for UI display (no quota info)
export async function getClaudeUsageStats(userId: string) {
  // Always use client for Claude runner (runs client-side)
  const supabase = createClient();
  
  // Get current usage
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours(), 0, 0, 0);
  
  const { data: usage, error } = await supabase
    .from('claude_user_usage')
    .select('calls')
    .eq('user_id', userId)
    .gte('window_start', windowStart.toISOString())
    .single();
  
  if (error && error.code !== 'PGRST116') { // Not found is ok
    console.error('Error fetching usage stats:', error);
    return null;
  }
  
  return {
    callsThisHour: usage?.calls || 0,
    windowStart: windowStart.toISOString(),
    windowEnd: new Date(windowStart.getTime() + 60 * 60 * 1000).toISOString()
  };
}