import { execFile, spawn } from 'child_process';
import * as fs from 'fs/promises';
import Redis from 'ioredis';
import * as os from 'os';
import * as path from 'path';
import { ulid } from 'ulid';
import { promisify } from 'util';
import type { ClaudeExecutorMetrics } from '../providers/IClaudeExecutor';
import { PathGuard } from './pathGuard';

const execFileAsync = promisify(execFile);

// Debug flag to control verbose logging (enabled by default, set to 'false' to disable)
const DEBUG_CLAUDE_MAIN_PROCESS = process.env.DEBUG_CLAUDE_MAIN_PROCESS !== 'false';

interface ClaudeRequest {
  id: string;
  prompt: string;
  args: string[];
  cwd?: string;
  streaming?: boolean;  // Flag to indicate streaming mode
}

interface ClaudeResponse {
  id: string;
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  result?: string | undefined;
  error?: string | undefined;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  } | undefined;
  duration?: number | undefined;
  sessionId?: string | undefined;
}

export class ClaudeCLIMainProcessService {
  private subRedis!: Redis;  // For subscriptions
  private pubRedis!: Redis;  // For publishing
  private isRunning = false;
  private isInitialized = false;

  // Metrics
  private metrics: ClaudeExecutorMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageExecutionTime: 0,
    activeRequests: 0
  };

  // Rate limiting
  private readonly maxConcurrent = parseInt(process.env.CLAUDE_MAX_CONCURRENT || '5');
  private activeRequests = 0;
  private queue: Array<() => void> = [];

  // Circuit breaker
  private consecutiveFailures = 0;
  private readonly maxFailures = parseInt(process.env.CLAUDE_MAX_FAILURES || '3');
  private circuitOpen = false;

  async initialize(): Promise<void> {
    console.log('[Claude Main Process] Initializing...');

    const redisConfig = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      }
    };

    // Setup Redis connections
    this.subRedis = new Redis(redisConfig);
    this.pubRedis = new Redis(redisConfig);

    // Wait for connections
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        this.subRedis.once('ready', () => {
          console.log('[Claude Main Process] Subscriber Redis connected');
          resolve();
        });
        this.subRedis.once('error', (err) => {
          reject(new Error(`Subscriber Redis connection failed: ${err.message}`));
        });
      }),
      new Promise<void>((resolve, reject) => {
        this.pubRedis.once('ready', () => {
          console.log('[Claude Main Process] Publisher Redis connected');
          resolve();
        });
        this.pubRedis.once('error', (err) => {
          reject(new Error(`Publisher Redis connection failed: ${err.message}`));
        });
      })
    ]);

    // Mark as initialized before health check so healthCheck() can run properly
    this.isInitialized = true;

    // Health check
    const healthy = await this.healthCheck();
    if (!healthy) {
      console.warn('[Claude Main Process] Initial health check failed - service may have issues');
    }

    // Subscribe to requests
    await this.subRedis.subscribe('claude:cli:requests');

    this.subRedis.on('message', async (channel, message) => {
      if (channel === 'claude:cli:requests') {
        try {
          const request = JSON.parse(message);
          await this.handleRequest(request);
        } catch (error) {
          console.error('[Claude Main Process] Failed to parse request:', error);
        }
      }
    });

    this.isRunning = true;
    console.log('✅ Claude CLI main process service initialized');
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check if service is initialized
      if (!this.isInitialized) {
        console.error('[Claude Main Process] Service not initialized yet');
        return false;
      }

      // Test Redis connection
      if (!this.pubRedis) {
        console.error('[Claude Main Process] Redis client not initialized');
        return false;
      }
      await this.pubRedis.ping();

      // Test Claude wrapper exists
      const wrapperPath = path.join(process.cwd(), 'scripts', 'claude-wrapper.js');
      await fs.access(wrapperPath);

      // Test Claude CLI is accessible with a simple command
      // Use a safe test directory for health check
      const testDir = path.join(os.homedir(), 'projects', 'health-check', 'test');
      await fs.mkdir(testDir, { recursive: true });

      // For health check, we can use a simple command
      const testResult = await this.executeClaudeCLI('Say "healthy"', [], testDir);
      const success = testResult.includes('healthy');

      if (!success) {
        console.error('[Claude Main Process] Health check failed - Claude CLI not responding correctly');
      }

      return success;
    } catch (error) {
      console.error('[Claude Main Process] Health check failed:', error);
      return false;
    }
  }

  private async handleRequest(request: ClaudeRequest): Promise<void> {
    const startTime = Date.now();
    const responseChannel = `claude:cli:response:${request.id}`;
    const streamChannel = request.streaming ? `claude:stream:${request.id}` : null;

    console.log('[Claude Main Process] Handling request:', {
      requestId: request.id,
      responseChannel,
      streamChannel,
      streaming: request.streaming,
      promptLength: request.prompt?.length,
      args: request.args,
      cwd: request.cwd
    });

    this.metrics.totalRequests++;

    try {
      if (request.streaming && streamChannel) {
        // Execute with streaming
        console.log('[Claude Main Process] Executing Claude CLI with streaming...');
        const result = await this.executeWithBackpressure(() =>
          this.executeClaudeCLIStream(
            request.prompt, 
            request.args, 
            request.cwd,
            async (chunk: string) => {
              // Publish each chunk to the stream channel
              await this.pubRedis.publish(streamChannel, JSON.stringify({
                type: 'chunk',
                data: chunk
              }));
            }
          )
        );

        // Send end of stream marker
        await this.pubRedis.publish(streamChannel, JSON.stringify({
          type: 'end'
        }));

        const duration = Date.now() - startTime;
        this.metrics.successfulRequests++;
        this.updateAverageExecutionTime(duration);

        // Parse the accumulated result
        const parsedResult = this.parseStreamJSON(result);

        // Send final response
        await this.pubRedis.publish(responseChannel, JSON.stringify({
          id: request.id,
          success: parsedResult.success,
          result: parsedResult.output,
          usage: parsedResult.usage,
          duration: parsedResult.duration,
          sessionId: parsedResult.sessionId
        } as ClaudeResponse));

      } else {
        // Non-streaming execution (existing code)
        console.log('[Claude Main Process] Executing Claude CLI...');
        const result = await this.executeWithBackpressure(() =>
          this.executeClaudeCLI(request.prompt, request.args, request.cwd)
        );

        const duration = Date.now() - startTime;
        this.metrics.successfulRequests++;
        this.updateAverageExecutionTime(duration);

        // Parse the stream JSON output
        const parsedResult = this.parseStreamJSON(result);

        await this.pubRedis.publish(responseChannel, JSON.stringify({
          id: request.id,
          success: parsedResult.success,
          result: parsedResult.output,
          usage: parsedResult.usage,
          duration: parsedResult.duration,
          sessionId: parsedResult.sessionId
        } as ClaudeResponse));
      }

    } catch (error: any) {
      this.metrics.failedRequests++;
      this.metrics.lastError = error.message;
      this.metrics.lastErrorTime = new Date();

      console.error('[Claude Main Process] Execution failed', {
        requestId: request.id,
        error: error.message,
        duration: Date.now() - startTime
      });

      // If streaming, send error to stream channel
      if (request.streaming && streamChannel) {
        await this.pubRedis.publish(streamChannel, JSON.stringify({
          type: 'error',
          error: error.message
        }));
      }

      await this.pubRedis.publish(responseChannel, JSON.stringify({
        id: request.id,
        success: false,
        error: error.message
      } as ClaudeResponse));
    }
  }

  private async executeWithBackpressure(fn: () => Promise<any>): Promise<any> {
    if (this.circuitOpen) {
      throw new Error('Claude CLI circuit breaker is open');
    }

    // Wait if at capacity
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }

    this.activeRequests++;
    this.metrics.activeRequests = this.activeRequests;

    try {
      const result = await fn();
      this.consecutiveFailures = 0; // Reset on success
      return result;
    } catch (error) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxFailures) {
        this.circuitOpen = true;
        console.error('[Claude Main Process] Circuit breaker opened after', this.consecutiveFailures, 'failures');
        setTimeout(() => {
          this.circuitOpen = false;
          this.consecutiveFailures = 0;
          console.log('[Claude Main Process] Circuit breaker reset');
        }, 30000); // Reset after 30s
      }
      throw error;
    } finally {
      this.activeRequests--;
      this.metrics.activeRequests = this.activeRequests;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  private executeClaudeCLI(prompt: string, args: string[], cwd?: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      console.log('[Claude Main Process] executeClaudeCLI called:', {
        promptLength: prompt?.length,
        args,
        cwd
      });

      const wrapperPath = path.join(process.cwd(), 'scripts', 'claude-wrapper.js');

      // CRITICAL: Validate and ensure safe working directory
      let safeWorkingDir: string;

      if (cwd) {
        try {
          // Validate the requested path
          PathGuard.validateProjectPath(cwd);

          // Ensure directory exists
          if (!require('fs').existsSync(cwd)) {
            await PathGuard.createSafeProjectDirectory(cwd);
            console.log(`[Claude Main Process] Created safe project directory: ${cwd}`);
          }

          safeWorkingDir = cwd;
        } catch (error: any) {
          console.error(`[Claude Main Process] PATH GUARD VIOLATION: ${error.message}`);
          console.error(`[Claude Main Process] Attempted to use unsafe path: ${cwd}`);
          reject(new Error(`Path security violation: ${error.message}`));
          return;
        }
      } else {
        // No cwd provided - use a default safe directory for chat-plan operations
        try {
          // Extract project ID from the prompt or generate a unique ID as fallback
          const projectId = this.extractProjectIdFromContext(prompt, args) || ulid();
          
          // Use a project-specific chat-plan directory (no session subfolder needed)
          const defaultChatDir = path.join(
            os.homedir(), 
            'projects', 
            'chat-plan', 
            `project-${projectId}`
          );
          await fs.mkdir(defaultChatDir, { recursive: true });
          safeWorkingDir = defaultChatDir;
          console.log(`[Claude Main Process] Using project-specific chat-plan directory: ${safeWorkingDir}`);
        } catch (error: any) {
          console.error(`[Claude Main Process] Failed to create default directory: ${error.message}`);
          reject(new Error('Failed to create default working directory'));
          return;
        }
      }

      console.log(`[Claude Main Process] Executing Claude CLI:
        - Safe working dir: ${safeWorkingDir}
        - Path validated: ✓
        - Directory exists: ✓`);

      console.log('[Claude Main Process] Prompt length:', prompt?.length || 0);
      // Only log prompt preview in debug mode to prevent sensitive data leakage
      if (DEBUG_CLAUDE_MAIN_PROCESS) {
        console.log('[Claude Main Process] Prompt preview (first 500 chars):', prompt?.substring(0, 500) || 'NO PROMPT');
      }

      // Use --print flag to send prompt via stdin
      const fullArgs = ['--print', ...args];

      console.log('[Claude Main Process] Full args (using --print with stdin):', {
        argsLength: fullArgs.length,
        firstArg: fullArgs[0],
        additionalArgs: args
      });

      // RESILIENT APPROACH: Use spawn with proper stream handling
      // Going directly to spawn to avoid execFile stdin issues
      try {
        console.log('[Claude Main Process] Using spawn with enhanced stream handling...');

        const proc = spawn('node', [wrapperPath, ...fullArgs], {
          cwd: safeWorkingDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PATH: process.env.PATH || '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin',
            DEBUG_CLAUDE_WRAPPER: 'true',
            // Increase Node.js buffer limits
            NODE_OPTIONS: '--max-old-space-size=4096'
          },
          // Set a higher internal buffer size for streams
          highWaterMark: 1024 * 1024 // 1MB buffer
        } as any);

        // For streaming JSON processing
        const resultLines: string[] = [];
        const stderrChunks: Buffer[] = [];
        let hasExited = false;
        let lineCount = 0;

        const timeout = setTimeout(() => {
          if (!hasExited) {
            console.error('[Claude Main Process] Claude CLI timed out');
            proc.kill('SIGTERM');
            reject(new Error('Claude CLI execution timed out'));
          }
        }, 360000);

        // Process stdout - use rolling string buffer instead of O(n²) Buffer.concat
        const chunks: Buffer[] = [];
        let rollingBuffer = ''; // Rolling buffer for incomplete lines
        let totalBytes = 0;

        proc.stdout.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          totalBytes += chunk.length;
          console.log(`[Claude Main Process] Received chunk ${chunks.length}: ${chunk.length} bytes (total: ${totalBytes})`);

          // Append only the new chunk to rolling buffer (O(1) per chunk, not O(n))
          rollingBuffer += chunk.toString('utf-8');

          // Check if we have complete lines
          const lines = rollingBuffer.split('\n');
          rollingBuffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim() && !resultLines.includes(line)) {
              lineCount++;
              console.log(`[Claude Main Process] Complete line ${lineCount} (${line.length} chars)`);
              resultLines.push(line);

              // Try to parse for real-time updates
              try {
                const json = JSON.parse(line);
                if (json.type === 'system' && json.session_id) {
                  console.log('[Claude Main Process] Session started:', json.session_id);
                } else if (json.type === 'assistant') {
                  console.log('[Claude Main Process] Assistant message detected');
                } else if (json.type === 'result') {
                  console.log('[Claude Main Process] Result received');
                }
              } catch (e) {
                // Might be array format, not line-by-line
              }
            }
          }
        });

        proc.stderr.on('data', (chunk: Buffer) => {
          stderrChunks.push(chunk);
          const stderrStr = chunk.toString('utf-8');
          if (stderrStr.trim()) {
            console.log('[Claude Main Process] Stderr:', stderrStr);
          }
        });

        proc.on('error', (err) => {
          hasExited = true;
          clearTimeout(timeout);
          console.error('[Claude Main Process] Process spawn error:', err.message);
          reject(new Error(`Failed to spawn Claude: ${err.message}`));
        });

        proc.on('close', (code) => {
          hasExited = true;
          clearTimeout(timeout);

          // Get the complete buffer
          const fullBuffer = Buffer.concat(chunks);
          console.log('[Claude Main Process] Total buffer size:', fullBuffer.length, 'bytes');

          // Convert using a method that doesn't truncate
          let stdout: string;

          // Try different conversion methods to avoid truncation
          const directString = fullBuffer.toString('utf-8');
          console.log('[Claude Main Process] Direct toString length:', directString.length);

          // If we already have complete lines, use them
          if (resultLines.length > 0) {
            stdout = resultLines.join('\n');
            console.log('[Claude Main Process] Using parsed lines, length:', stdout.length);
          } else {
            // Process the full buffer
            stdout = directString;

            // If the direct conversion seems truncated, try chunked conversion
            if (directString.length < fullBuffer.length * 0.9) {
              console.log('[Claude Main Process] String seems truncated, trying chunked conversion');
              let chunkedString = '';
              const chunkSize = 4096;
              for (let i = 0; i < fullBuffer.length; i += chunkSize) {
                const end = Math.min(i + chunkSize, fullBuffer.length);
                chunkedString += fullBuffer.slice(i, end).toString('utf-8');
              }
              if (chunkedString.length > directString.length) {
                stdout = chunkedString;
                console.log('[Claude Main Process] Chunked conversion gave more data:', chunkedString.length);
              }
            }

            // Split into lines for processing
            const lines = stdout.split('\n');
            for (const line of lines) {
              if (line.trim()) {
                resultLines.push(line);
              }
            }
          }

          const stderr = Buffer.concat(stderrChunks).toString('utf-8');

          console.log('[Claude Main Process] Process closed:', {
            code,
            bufferBytes: fullBuffer.length,
            stringLength: stdout.length,
            totalLines: resultLines.length,
            stderrLength: stderr.length
          });

          if (stderr && stderr.trim()) {
            console.log('[Claude Main Process] Final stderr:', stderr);
          }

          if (code !== 0) {
            reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
            return;
          }

          // Check if we got any output
          if (stdout.length === 0) {
            console.error('[Claude Main Process] No output received from Claude CLI');
            reject(new Error('No output received from Claude CLI'));
            return;
          }

          console.log('[Claude Main Process] Final output length:', stdout.length);
          // Only log output preview in debug mode to prevent sensitive data leakage
          if (DEBUG_CLAUDE_MAIN_PROCESS) {
            console.log('[Claude Main Process] First 200 chars:', stdout.substring(0, 200));
            console.log('[Claude Main Process] Last 200 chars:', stdout.substring(stdout.length - 200));
          }

          resolve(stdout);
        });

        // Send prompt via stdin
        if (prompt) {
          console.log('[Claude Main Process] Writing prompt to stdin...');
          proc.stdin.write(prompt, 'utf-8', (err) => {
            if (err) {
              console.error('[Claude Main Process] Error writing to stdin:', err);
              proc.kill();
              reject(new Error(`Failed to write prompt to stdin: ${err.message}`));
            } else {
              console.log('[Claude Main Process] Successfully wrote prompt to stdin');
              proc.stdin.end();
            }
          });
        } else {
          console.error('[Claude Main Process] No prompt provided');
          proc.stdin.end();
        }
      } catch (error: any) {
        console.error('[Claude Main Process] Unexpected error:', error.message);
        reject(error);
      }
    });
  }

  /**
   * Execute Claude CLI with real-time streaming
   * Streams each line as it arrives from Claude
   */
  private executeClaudeCLIStream(
    prompt: string, 
    args: string[], 
    cwd: string | undefined,
    onChunk: (chunk: string) => Promise<void>
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      console.log('[Claude Main Process] executeClaudeCLIStream called');
      
      const wrapperPath = path.join(process.cwd(), 'scripts', 'claude-wrapper.js');
      let safeWorkingDir: string;

      // Validate working directory (same as executeClaudeCLI)
      if (cwd) {
        try {
          PathGuard.validateProjectPath(cwd);
          if (!require('fs').existsSync(cwd)) {
            await PathGuard.createSafeProjectDirectory(cwd);
          }
          safeWorkingDir = cwd;
        } catch (error: any) {
          reject(new Error(`Path security violation: ${error.message}`));
          return;
        }
      } else {
        try {
          const projectId = this.extractProjectIdFromContext(prompt, args) || ulid();
          const defaultChatDir = path.join(
            os.homedir(), 
            'projects', 
            'chat-plan', 
            `project-${projectId}`
          );
          await fs.mkdir(defaultChatDir, { recursive: true });
          safeWorkingDir = defaultChatDir;
        } catch (error: any) {
          reject(new Error('Failed to create default working directory'));
          return;
        }
      }

      const fullArgs = ['--print', ...args];
      console.log('[Claude Main Process] Starting streaming execution with args:', fullArgs);

      try {
        const proc = spawn('node', [wrapperPath, ...fullArgs], {
          cwd: safeWorkingDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PATH: process.env.PATH || '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin',
            DEBUG_CLAUDE_WRAPPER: 'true',
            NODE_OPTIONS: '--max-old-space-size=4096'
          },
          highWaterMark: 1024 * 1024
        } as any);

        const allLines: string[] = [];
        let buffer = '';
        let hasExited = false;
        let lineCount = 0;

        const timeout = setTimeout(() => {
          if (!hasExited) {
            console.error('[Claude Main Process] Stream timeout');
            proc.kill('SIGTERM');
            reject(new Error('Claude CLI stream timeout'));
          }
        }, 360000);

        // Process stdout stream in real-time
        // IMPORTANT: Don't await onChunk - fire-and-forget to prevent stdout backpressure
        proc.stdout.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8');
          buffer += text;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              lineCount++;
              console.log(`[Claude Main Process] Streaming line ${lineCount} (${line.length} chars)`);

              // Store line for final result
              allLines.push(line);

              // Stream the line to the callback - fire-and-forget to prevent backpressure
              void onChunk(line).catch(e => {
                console.error('[Claude Main Process] Error in stream callback:', e);
              });
            }
          }
        });

        const stderrChunks: Buffer[] = [];
        proc.stderr.on('data', (chunk: Buffer) => {
          stderrChunks.push(chunk);
          const stderrStr = chunk.toString('utf-8');
          if (stderrStr.trim()) {
            console.log('[Claude Main Process] Stream stderr:', stderrStr);
          }
        });

        proc.on('error', (err) => {
          hasExited = true;
          clearTimeout(timeout);
          console.error('[Claude Main Process] Stream process error:', err.message);
          reject(new Error(`Failed to spawn Claude: ${err.message}`));
        });

        proc.on('close', (code) => {
          hasExited = true;
          clearTimeout(timeout);

          // Process any remaining buffer
          if (buffer.trim()) {
            allLines.push(buffer);
            // Fire-and-forget for consistency with streaming handler
            void onChunk(buffer).catch(e => {
              console.error('[Claude Main Process] Error in final stream callback:', e);
            });
          }

          const stderr = Buffer.concat(stderrChunks).toString('utf-8');
          
          console.log('[Claude Main Process] Stream closed:', {
            code,
            totalLines: allLines.length,
            stderrLength: stderr.length
          });

          if (code !== 0) {
            reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
            return;
          }

          if (allLines.length === 0) {
            reject(new Error('No output received from Claude CLI stream'));
            return;
          }

          // Return all lines joined for final parsing
          const fullOutput = allLines.join('\n');
          console.log('[Claude Main Process] Stream complete, total output:', fullOutput.length);
          resolve(fullOutput);
        });

        // Send prompt via stdin
        if (prompt) {
          console.log('[Claude Main Process] Writing prompt to stdin for streaming...');
          proc.stdin.write(prompt, 'utf-8', (err) => {
            if (err) {
              console.error('[Claude Main Process] Error writing to stdin:', err);
              proc.kill();
              reject(new Error(`Failed to write prompt to stdin: ${err.message}`));
            } else {
              console.log('[Claude Main Process] Prompt sent, closing stdin');
              proc.stdin.end();
            }
          });
        } else {
          proc.stdin.end();
        }
      } catch (error: any) {
        console.error('[Claude Main Process] Stream execution error:', error.message);
        reject(error);
      }
    });
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private parseStreamJSON(output: string): {
    success: boolean;
    output: string;
    usage?: { inputTokens: number; outputTokens: number; totalCost: number } | undefined;
    duration?: number | undefined;
    sessionId?: string | undefined;
  } {
    // Debug log the raw output
    console.log('[Claude Main Process] Parsing stream JSON:', {
      totalLines: output.split('\n').length,
      outputLength: output.length,
      firstChars: output.substring(0, 200),
      lastChars: output.substring(output.length - 200)
    });

    let result = null;
    let assistantMessages: string[] = [];
    let jsonArray: any[] = [];

    // Try line-by-line parsing for streaming JSON
    const lines = output.trim().split('\n');
    console.log('[Claude Main Process] Processing', lines.length, 'lines');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);
        jsonArray.push(json);

        // Log each JSON object type
        console.log(`[Claude Main Process] Parsed line - type: ${json.type}, subtype: ${json.subtype || 'none'}`);
      } catch (e) {
        // Some outputs might be a single JSON array instead of line-by-line
        if (lines.length === 1 && line.startsWith('[')) {
          try {
            jsonArray = JSON.parse(line);
            console.log('[Claude Main Process] Parsed as single JSON array with', jsonArray.length, 'items');
            break;
          } catch (e2) {
            console.log('[Claude Main Process] Failed to parse line as JSON:', line.substring(0, 100));
          }
        } else {
          console.log('[Claude Main Process] Failed to parse line as JSON:', line.substring(0, 100));
        }
      }
    }

    // Process the JSON objects
    let sessionId: string | undefined;
    let lastSystemMessage: any = null;
    let usage: any = undefined;
    let duration: number | undefined;

    for (const json of jsonArray) {
      console.log('[Claude Main Process] Processing item:', {
        type: json.type,
        subtype: json.subtype,
        hasResult: 'result' in json,
        hasMessage: 'message' in json,
        hasText: 'text' in json,
        hasContent: 'content' in json
      });

      // Capture session ID from system messages
      if (json.type === 'system' && json.session_id) {
        sessionId = json.session_id;
        lastSystemMessage = json;
      }

      // Capture assistant messages (multiple formats)
      if (json.type === 'assistant') {
        // Format 1: message.content array
        if (json.message && json.message.content && Array.isArray(json.message.content)) {
          for (const content of json.message.content) {
            if (content.type === 'text' && content.text) {
              assistantMessages.push(content.text);
            }
          }
        }
        // Format 2: direct text field
        else if (json.text) {
          assistantMessages.push(json.text);
        }
        // Format 3: direct content field
        else if (json.content) {
          assistantMessages.push(typeof json.content === 'string' ? json.content : JSON.stringify(json.content));
        }
      }

      // Also check for text type messages (Claude sometimes uses this)
      if (json.type === 'text' && json.text) {
        assistantMessages.push(json.text);
      }

      // Capture usage data from any message that has it
      if (json.usage) {
        usage = json.usage;
      }

      // Capture duration from any message that has it
      if (json.duration_ms) {
        duration = json.duration_ms;
      }

      // Capture the final result
      if (json.type === 'result') {
        console.log('[Claude Main Process] Found result object:', {
          hasResult: 'result' in json,
          resultLength: json.result?.length,
          resultPreview: json.result?.substring(0, 200),
          isError: json.is_error,
          sessionId: json.session_id,
          usage: json.usage
        });

        // The result field contains Claude's actual response
        let resultOutput = json.result || '';

        // Check if the result looks like JSON
        const trimmedResult = resultOutput.trim();
        if (trimmedResult.startsWith('{') || trimmedResult.startsWith('[')) {
          // Result is already JSON, use as-is
          console.log('[Claude Main Process] Result contains JSON');
        } else {
          // Result is plain text - Claude didn't follow JSON format
          console.log('[Claude Main Process] Result is plain text, not JSON');
          // Only log full result in debug mode to prevent sensitive data leakage
          if (DEBUG_CLAUDE_MAIN_PROCESS) {
            console.log('[Claude Main Process] === START PLAIN TEXT RESULT ===');
            console.log(resultOutput);
            console.log('[Claude Main Process] === END PLAIN TEXT RESULT ===');
          }
          
          // Try to extract JSON from the text if it contains a code block
          const jsonMatch = resultOutput.match(/```json\s*\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            resultOutput = jsonMatch[1];
            console.log('[Claude Main Process] Extracted JSON from markdown code block in result');
          } else {
            console.log('[Claude Main Process] No JSON code block found in plain text result');
          }
        }

        result = {
          success: !json.is_error,
          output: resultOutput,
          usage: json.usage ? {
            inputTokens: json.usage.input_tokens || 0,
            outputTokens: json.usage.output_tokens || 0,
            totalCost: json.total_cost_usd || 0
          } : usage ? {
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            totalCost: 0
          } : undefined,
          duration: json.duration_ms || duration,
          sessionId: json.session_id || sessionId
        };
      }
    }

    if (!result) {
      // If no result found but we have assistant messages, create a result
      if (assistantMessages.length > 0) {
        console.log('[Claude Main Process] No result object, using assistant messages');
        const combinedMessages = assistantMessages.join('\n');

        // Check if assistant messages contain JSON
        let outputText = combinedMessages;
        const trimmedMessages = combinedMessages.trim();
        if (!trimmedMessages.startsWith('{') && !trimmedMessages.startsWith('[')) {
          // Try to extract JSON from the messages
          const jsonMatch = combinedMessages.match(/```json\s*\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            outputText = jsonMatch[1];
            console.log('[Claude Main Process] Extracted JSON from markdown code block in messages');
          }
        }

        result = {
          success: true,
          output: outputText,
          usage: usage ? {
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            totalCost: 0
          } : undefined,
          duration: duration,
          sessionId: sessionId // Use the session ID we captured from system messages
        };
      } else {
        // Check if we have any meaningful output at all
        console.log('[Claude Main Process] Debug - No assistant messages found:', {
          jsonArrayLength: jsonArray.length,
          sessionId: sessionId,
          lastSystemMessage: lastSystemMessage ? {
            type: lastSystemMessage.type,
            subtype: lastSystemMessage.subtype,
            hasContent: 'content' in lastSystemMessage
          } : null
        });

        // If we have a system message with content, try to use that
        if (lastSystemMessage && lastSystemMessage.content) {
          result = {
            success: true,
            output: JSON.stringify(lastSystemMessage.content),
            usage: usage ? {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              totalCost: 0
            } : undefined,
            duration: duration,
            sessionId: sessionId
          };
        } else {
          throw new Error('No result found in Claude output - no assistant messages or result object');
        }
      }
    }

    return result;
  }

  private updateAverageExecutionTime(duration: number): void {
    const total = this.metrics.successfulRequests + this.metrics.failedRequests;
    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (total - 1) + duration) / total;
  }

  /**
   * Sanitize a project ID to prevent path traversal attacks.
   * Only allows alphanumeric characters, hyphens, and underscores.
   * Returns null if the projectId is invalid or potentially malicious.
   */
  private sanitizeProjectId(projectId: string | null | undefined): string | null {
    if (!projectId) return null;

    // Strict allowlist: only alphanumeric, hyphens, underscores, max 64 chars
    const sanitized = projectId.replace(/[^a-zA-Z0-9_-]/g, '');

    // Must be non-empty and reasonable length
    if (sanitized.length === 0 || sanitized.length > 64) {
      return null;
    }

    // Reject if original contained path traversal attempts
    if (projectId.includes('..') || projectId.includes('/') || projectId.includes('\\')) {
      console.warn('[Claude Main Process] PATH TRAVERSAL ATTEMPT blocked in projectId:', projectId.substring(0, 50));
      return null;
    }

    return sanitized;
  }

  /**
   * Extract project ID from prompt or args for directory creation
   * This helps maintain project isolation even for chat-plan operations
   */
  private extractProjectIdFromContext(prompt: string, args: string[]): string | null {
    // Try to extract from prompt (might contain projectId in JSON)
    try {
      const projectIdMatch = prompt.match(/"projectId"\s*:\s*"([^"]+)"/);
      if (projectIdMatch && projectIdMatch[1]) {
        return this.sanitizeProjectId(projectIdMatch[1]);
      }
    } catch (e) {
      // Ignore parse errors
    }

    // Try to extract from session ID if resuming
    const resumeIndex = args.indexOf('--resume');
    const resumeArg = args[resumeIndex + 1];
    if (resumeIndex !== -1 && resumeArg) {
      // Use part of session ID to maintain consistency
      const sessionPart = resumeArg.split('-')[0];
      return this.sanitizeProjectId(sessionPart ?? null);
    }

    return null;
  }

  async request(prompt: string, args: string[], cwd?: string): Promise<ClaudeResponse> {
    // Check if service is initialized
    if (!this.isInitialized) {
      throw new Error('[Claude Main Process] Service not initialized. Call initialize() first.');
    }

    const requestId = ulid();
    const responseChannel = `claude:cli:response:${requestId}`;
    const timeout = parseInt(process.env.CLAUDE_TIMEOUT || '600000');

    console.log('[Claude Main Process] Creating request:', {
      requestId,
      responseChannel,
      promptLength: prompt?.length,
      args,
      timeout
    });

    return new Promise((resolve, reject) => {
      const redis = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      });

      // Subscribe to specific response channel
      redis.subscribe(responseChannel, async (err) => {
        if (err) {
          redis.disconnect();
          reject(err);
          return;
        }

        // Set timeout
        const timer = setTimeout(() => {
          redis.unsubscribe(responseChannel);
          redis.disconnect();
          reject(new Error('Claude CLI request timeout'));
        }, timeout);

        redis.on('message', (channel, message) => {
          if (channel === responseChannel) {
            clearTimeout(timer);
            redis.unsubscribe(responseChannel);
            redis.disconnect();

            console.log('[Claude Main Process] Received response on channel:', channel);
            console.log('[Claude Main Process] Response message:', message?.substring(0, 200));

            try {
              const response: ClaudeResponse = JSON.parse(message);
              console.log('[Claude Main Process] Parsed response:', {
                success: response.success,
                hasResult: !!response.result,
                resultLength: response.result?.length,
                error: response.error
              });

              if (response.success) {
                resolve(response);
              } else {
                reject(new Error(response.error || 'Unknown error'));
              }
            } catch (e) {
              console.error('[Claude Main Process] Failed to parse response:', e);
              reject(new Error('Failed to parse response'));
            }
          }
        });

        // Publish request
        const pubRedis = new Redis({
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        });

        const requestPayload = {
          id: requestId,
          prompt,
          args,
          cwd
        } as ClaudeRequest;

        console.log('[Claude Main Process] Publishing request to Redis:', {
          channel: 'claude:cli:requests',
          requestId: requestPayload.id,
          promptLength: requestPayload.prompt?.length,
          args: requestPayload.args
        });

        const publishResult = await pubRedis.publish('claude:cli:requests', JSON.stringify(requestPayload));

        console.log('[Claude Main Process] Publish result:', publishResult, '(number of subscribers)');

        pubRedis.disconnect();
      });
    });
  }

  getMetrics(): ClaudeExecutorMetrics {
    return { ...this.metrics };
  }

  async shutdown(): Promise<void> {
    console.log('[Claude Main Process] Shutting down...');
    this.isRunning = false;
    this.isInitialized = false;

    if (this.subRedis) {
      await this.subRedis.unsubscribe();
      this.subRedis.disconnect();
    }

    if (this.pubRedis) {
      this.pubRedis.disconnect();
    }
  }
}

// Singleton instance
export const claudeCLIMainProcess = new ClaudeCLIMainProcessService();
