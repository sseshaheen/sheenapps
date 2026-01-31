import type { IClaudeExecutor, ClaudeExecutorResult, ClaudeExecutorMetrics } from '../IClaudeExecutor';
import { claudeCLIMainProcess } from '../../services/claudeCLIMainProcess';
import Redis from 'ioredis';
import { ulid } from 'ulid';

export class RedisClaudeExecutor implements IClaudeExecutor {
  async execute(prompt: string, args: string[], cwd?: string): Promise<ClaudeExecutorResult> {
    try {
      // Always log for debugging the empty response issue
      console.log('[Redis Executor] Sending request to main process...');
      console.log('[Redis Executor] Args:', args);
      console.log('[Redis Executor] Prompt length:', prompt?.length || 0);
      console.log('[Redis Executor] CWD:', cwd || 'not specified');
      
      const response = await claudeCLIMainProcess.request(prompt, args, cwd);
      
      // Always log the response for debugging
      console.log('[Redis Executor] Received response:', {
        success: response.success,
        hasResult: !!response.result,
        resultLength: response.result?.length || 0,
        hasError: !!response.error,
        error: response.error,
        hasUsage: !!response.usage,
        usage: response.usage
      });
      
      // Log if we're getting an empty result despite success
      if (response.success && !response.result) {
        console.warn('[Redis Executor] WARNING: Success but empty result!');
      }
      
      return {
        success: response.success,
        output: response.result || '',
        error: response.error,
        usage: response.usage,
        duration: response.duration,
        sessionId: response.sessionId
      };
    } catch (error: any) {
      console.error('[Redis Executor] Error:', error.message, error.stack);
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }
  
  async healthCheck(): Promise<boolean> {
    return claudeCLIMainProcess.healthCheck();
  }
  
  async getMetrics(): Promise<ClaudeExecutorMetrics> {
    return claudeCLIMainProcess.getMetrics();
  }
  
  async initialize(): Promise<void> {
    // The main process service is initialized separately in server.ts
    // This is a no-op for the executor
  }
  
  async shutdown(): Promise<void> {
    // The main process service is shut down separately in server.ts
    // This is a no-op for the executor
  }

  /**
   * Execute Claude CLI with real-time streaming support
   * Streams each line of Claude's output as it arrives
   */
  async executeStream(
    prompt: string, 
    args: string[], 
    cwd: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<ClaudeExecutorResult> {
    const requestId = ulid();
    const streamChannel = `claude:stream:${requestId}`;
    const responseChannel = `claude:cli:response:${requestId}`;
    
    console.log('[Redis Executor] Starting streaming execution:', {
      requestId,
      streamChannel,
      promptLength: prompt?.length || 0,
      args
    });

    // Create a Redis client for streaming
    const streamRedis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });

    return new Promise((resolve, reject) => {
      let finalResult: ClaudeExecutorResult | null = null;
      let streamTimeout: NodeJS.Timeout;
      
      // Subscribe to both stream and response channels
      streamRedis.subscribe(streamChannel, responseChannel, async (err) => {
        if (err) {
          streamRedis.disconnect();
          reject(new Error(`Failed to subscribe to stream channels: ${err.message}`));
          return;
        }

        // Set timeout for stream
        streamTimeout = setTimeout(() => {
          streamRedis.unsubscribe();
          streamRedis.disconnect();
          reject(new Error('Stream timeout'));
        }, 600000); // 10 minutes timeout

        // Handle stream messages
        streamRedis.on('message', (channel, message) => {
          if (channel === streamChannel) {
            // Stream chunk received - send to callback
            try {
              const chunk = JSON.parse(message);
              if (chunk.type === 'chunk') {
                onChunk(chunk.data);
              } else if (chunk.type === 'end') {
                console.log('[Redis Executor] Stream ended normally');
              }
            } catch (e) {
              console.error('[Redis Executor] Error parsing stream chunk:', e);
            }
          } else if (channel === responseChannel) {
            // Final response received
            clearTimeout(streamTimeout);
            streamRedis.unsubscribe();
            streamRedis.disconnect();

            try {
              const response = JSON.parse(message);
              console.log('[Redis Executor] Received final response:', {
                success: response.success,
                hasResult: !!response.result,
                resultLength: response.result?.length || 0
              });

              finalResult = {
                success: response.success,
                output: response.result || '',
                error: response.error,
                usage: response.usage,
                duration: response.duration,
                sessionId: response.sessionId
              };

              if (response.success) {
                resolve(finalResult);
              } else {
                reject(new Error(response.error || 'Unknown error'));
              }
            } catch (e) {
              reject(new Error('Failed to parse final response'));
            }
          }
        });

        // Now send the request with streaming flag
        const pubRedis = new Redis({
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        });

        const requestPayload = {
          id: requestId,
          prompt,
          args,
          cwd,
          streaming: true  // Flag to indicate streaming mode
        };

        console.log('[Redis Executor] Publishing streaming request:', {
          channel: 'claude:cli:requests',
          requestId: requestPayload.id,
          streaming: true
        });

        await pubRedis.publish('claude:cli:requests', JSON.stringify(requestPayload));
        pubRedis.disconnect();
      });
    });
  }
}