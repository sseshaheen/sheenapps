import * as path from 'path';
import { PROCESS_TIMEOUTS } from '../config/timeouts.env';
import { CleanEventEmitter, emitBuildEvent } from '../services/eventService';
import { calculateOverallProgress } from '../types/cleanEvents';
import { CodexStreamProcess, CodexSpawnOptions } from './codexProcess';
import { CodexMessageParser, CodexEvent, AgentEvent } from './codexMessageParser';
import { getGlobalRateLimiter } from './rateLimiter';

/**
 * Session result compatible with Claude's SessionResult
 */
export interface CodexSessionResult {
  success: boolean;
  result: string;
  error?: string | undefined;
  messages: CodexEvent[];
  sessionId?: string | undefined;  // thread_id from Codex
  totalCost?: number | undefined;
  tokenUsage?: {
    input: number;
    output: number;
  } | undefined;
  // Activity metrics
  filesCreated?: number | undefined;
  filesModified?: number | undefined;
  errorsEncountered?: number | undefined;
  errorsFixed?: number | undefined;
  toolCallsTotal?: number | undefined;
  // Resume fallback - indicates session wasn't found and caller should use new session
  needsFallback?: boolean | undefined;
}

/**
 * CodexSession - High-level session management for Codex CLI
 *
 * Mirrors ClaudeSession's interface for compatibility with existing infrastructure.
 * Handles:
 * - Process spawning via CodexStreamProcess
 * - JSONL event parsing via CodexMessageParser
 * - Progress event emission
 * - Activity tracking (files, errors, tool calls)
 * - Timeout management
 */
export class CodexSession {
  private process = new CodexStreamProcess();
  private parser = new CodexMessageParser();
  private messages: CodexEvent[] = [];
  private timeout: NodeJS.Timeout | null = null;
  private threadId: string | null = null;
  private outputBuffer: string[] = [];
  private buildErrors: Array<{type: string; message: string; file?: string | undefined}> = [];
  private fixedErrors = 0;
  private filesCreated = 0;
  private filesModified = 0;
  private toolCallsTotal = 0;
  private activeToolCalls = new Set<string>();
  private activeCreateItems = new Set<string>();
  private activeModifyItems = new Set<string>();
  private cleanEmitter: CleanEventEmitter | null = null;

  /**
   * Run a new Codex session
   */
  async run(
    prompt: string,
    workDir: string,
    buildId: string,
    timeoutMs: number = PROCESS_TIMEOUTS.claudeComplex,
    userId?: string,
    projectId?: string,
    options?: Partial<CodexSpawnOptions>
  ): Promise<CodexSessionResult> {
    console.log(`[CodexSession] Starting session for build ${buildId} with timeout: ${timeoutMs}ms (${timeoutMs/60000} minutes)`);

    // Initialize clean event emitter if userId is provided
    if (userId) {
      this.cleanEmitter = new CleanEventEmitter(buildId, userId);
    }

    const rateLimiter = getGlobalRateLimiter();
    await rateLimiter.acquire();

    let continueCheckInterval: NodeJS.Timeout | undefined;
    let timeoutFired = false;

    try {
      // Spawn Codex process
      const spawnOptions: CodexSpawnOptions = {
        prompt,
        workDir,
        ...(buildId && { buildId }),
        ...(userId && { userId }),
        ...(projectId && { projectId }),
        ...options
      };

      const rl = await this.process.spawn(spawnOptions);

      // Set timeout
      this.timeout = setTimeout(() => {
        timeoutFired = true;
        console.error(`[CodexSession] Session timeout after ${timeoutMs}ms (${timeoutMs/60000} minutes) for build ${buildId}`);
        console.error(`[CodexSession] Killing Codex process due to timeout`);
        this.process.kill();
      }, timeoutMs);
      // Unref so it doesn't prevent process exit in tests
      this.timeout.unref();

      // Send initial progress
      if (this.cleanEmitter) {
        await this.cleanEmitter.phaseProgressWithCode(
          'development',
          'BUILD_DEVELOPMENT_STARTING',
          calculateOverallProgress('development', 0.1)
        );
      } else {
        await emitBuildEvent(buildId, 'ai_started', {
          message: 'Starting Codex AI session...',
          timestamp: Date.now(),
          userId
        });
      }

      // Process JSONL lines
      let lineCount = 0;
      let lastProgressTime = Date.now();
      let hasReceivedData = false;
      let lastOutputTime = Date.now();
      let resultReceived = false;

      // Setup continue prompt mechanism (similar to Claude)
      const checkAndPromptContinue = () => {
        if (resultReceived) {
          console.log(`[CodexSession] Continue check skipped - result already received`);
          return;
        }

        const timeSinceLastOutput = Date.now() - lastOutputTime;
        const CONTINUE_TIMEOUT = 60000; // 60 seconds for Codex

        if (timeSinceLastOutput > CONTINUE_TIMEOUT) {
          const stdin = this.process.getProcess()?.stdin;
          if (stdin && stdin.writable && !stdin.destroyed) {
            console.log(`[CodexSession] No output for ${timeSinceLastOutput/1000}s, sending continue prompt...`);
            stdin.write('\n');
            lastOutputTime = Date.now();
          }
        }
      };

      continueCheckInterval = setInterval(checkAndPromptContinue, 10000);
      // Unref so it doesn't prevent process exit in tests
      continueCheckInterval.unref();

      rl.on('line', (line) => {
        hasReceivedData = true;
        lastOutputTime = Date.now();
        console.log(`[CodexSession] Raw line: ${line}`);

        this.outputBuffer.push(line);
        if (this.outputBuffer.length > 10) {
          this.outputBuffer.shift();
        }
      });

      for await (const line of rl) {
        lineCount++;
        hasReceivedData = true;

        const now = Date.now();
        if (lineCount % 10 === 0 || now - lastProgressTime > 5000) {
          console.log(`[CodexSession] Processing line ${lineCount}...`);
          lastProgressTime = now;
        }

        // Parse JSONL event
        const event = this.parser.parse(line);
        if (!event) {
          if (line.trim()) {
            console.log(`[CodexSession] Failed to parse line ${lineCount}: ${line.substring(0, 100)}...`);
          }
          continue;
        }

        this.messages.push(event);

        // Capture thread ID from thread.started
        if (event.type === 'thread.started' && event.thread_id) {
          this.threadId = event.thread_id;
          console.log(`[CodexSession] Thread ID: ${this.threadId}`);
        }

        // Extract and emit progress updates
        const agentEvent = this.parser.toAgentEvent(event);
        if (agentEvent) {
          await this.handleAgentEvent(agentEvent, buildId, userId);
        } else if (event.type === 'error' || event.type === 'turn.failed') {
          this.buildErrors.push({
            type: 'codex_error',
            message: event.error?.message || 'Unknown error'
          });
        }

        // Check for turn completion
        if (event.type === 'turn.completed') {
          resultReceived = true;

          const stdin = this.process.getProcess()?.stdin;
          if (stdin && !stdin.destroyed) {
            console.log(`[CodexSession] Closing stdin after turn.completed`);
            stdin.end();
          }

          clearTimeout(this.timeout);
          if (continueCheckInterval) clearInterval(continueCheckInterval);

          console.log(`[CodexSession] Session completed (turn.completed)`);
          return this.buildResult();
        }

        // Check for errors that end the session
        if (event.type === 'turn.failed') {
          resultReceived = true;

          clearTimeout(this.timeout);
          if (continueCheckInterval) clearInterval(continueCheckInterval);

          console.log(`[CodexSession] Session failed (turn.failed)`);
          return {
            success: false,
            result: '',
            error: event.error?.message || 'Turn failed',
            messages: this.messages,
            sessionId: this.threadId || undefined,
            errorsEncountered: this.buildErrors.length
          };
        }
      }

      // Stream ended without turn.completed
      resultReceived = true;
      clearTimeout(this.timeout);
      if (continueCheckInterval) clearInterval(continueCheckInterval);

      console.log(`[CodexSession] Stream ended without turn.completed. Received data: ${hasReceivedData}, Line count: ${lineCount}`);

      // Return partial result if we have data
      if (hasReceivedData && this.messages.length > 0) {
        return this.buildResult();
      }

      throw new Error(`Stream ended without result (received ${lineCount} lines)`);

    } catch (error) {
      console.error(`[CodexSession] Error:`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = timeoutFired || errorMessage.toLowerCase().includes('timeout');

      return {
        success: false,
        result: '',
        error: isTimeout ? 'Session timeout - task took too long' : errorMessage,
        messages: this.messages,
        sessionId: this.threadId || undefined
      };
    } finally {
      if (this.timeout) clearTimeout(this.timeout);
      if (continueCheckInterval) clearInterval(continueCheckInterval);
      this.process.kill();
      rateLimiter.release();
    }
  }

  /**
   * Handle normalized agent event for progress tracking
   */
  private async handleAgentEvent(event: AgentEvent, buildId: string, userId?: string): Promise<void> {
    switch (event.type) {
      case 'message':
        // Final message text - could emit as progress
        break;

      case 'tool_call':
      case 'tool_result': {
        if (event.type === 'tool_call') {
          this.toolCallsTotal++;
          if (event.itemId) {
            this.activeToolCalls.add(event.itemId);
          }
        } else if (event.itemId && this.activeToolCalls.has(event.itemId)) {
          this.activeToolCalls.delete(event.itemId);
        } else if (event.itemId) {
          this.toolCallsTotal++;
        }

        // Track file operations without double-counting start/completion
        if (event.tool === 'Write') {
          if (event.type === 'tool_call') {
            this.filesCreated++;
            if (event.itemId) {
              this.activeCreateItems.add(event.itemId);
            }
          } else if (event.itemId && this.activeCreateItems.has(event.itemId)) {
            this.activeCreateItems.delete(event.itemId);
          } else if (event.itemId) {
            this.filesCreated++;
          }
        } else if (event.tool === 'Edit') {
          if (event.type === 'tool_call') {
            this.filesModified++;
            if (event.itemId) {
              this.activeModifyItems.add(event.itemId);
            }
          } else if (event.itemId && this.activeModifyItems.has(event.itemId)) {
            this.activeModifyItems.delete(event.itemId);
          } else if (event.itemId) {
            this.filesModified++;
          }
        }

        if (event.type === 'tool_call') {
          await this.emitToolProgress(event, buildId, userId);
        }
        break;
      }

      case 'progress':
        // Reasoning or other progress
        if (this.cleanEmitter && event.text) {
          await this.cleanEmitter.phaseProgress(
            'development',
            'AI Thinking',
            event.text.substring(0, 100),
            calculateOverallProgress('development', 0.5)
          );
        }
        break;

      case 'error':
        this.buildErrors.push({
          type: 'codex_error',
          message: event.text || 'Unknown error'
        });
        break;
    }
  }

  /**
   * Emit progress for tool calls
   */
  private async emitToolProgress(event: AgentEvent, buildId: string, userId?: string): Promise<void> {
    let title = '';
    let code: string | undefined;
    let params: Record<string, any> | undefined;

    switch (event.tool) {
      case 'Write': {
        const fileName = path.basename(event.toolInput?.file_path || 'file');
        title = `Creating ${fileName}...`;
        code = 'BUILD_FILE_CREATING';
        params = { filename: fileName };
        break;
      }

      case 'Edit': {
        const editFile = path.basename(event.toolInput?.file_path || 'file');
        title = `Updating ${editFile}...`;
        code = 'BUILD_FILE_UPDATING';
        params = { filename: editFile };
        break;
      }

      case 'Bash': {
        const command = event.toolInput?.command || '';
        if (command.includes('npm install') || command.includes('pnpm install')) {
          title = 'Installing dependencies...';
          code = 'BUILD_DEPENDENCIES_INSTALLING';
        } else if (command.includes('npm run build') || command.includes('pnpm build')) {
          title = 'Building application...';
          code = 'BUILD_COMPILING';
        } else {
          title = 'Running command...';
        }
        break;
      }

      case 'Read': {
        const readFile = path.basename(event.toolInput?.file_path || 'file');
        title = `Reading ${readFile}...`;
        code = 'BUILD_FILE_READING';
        params = { filename: readFile };
        break;
      }

      case 'TodoWrite': {
        const todos = event.toolInput?.todos || [];
        const inProgress = todos.find((t: any) => t.status === 'in_progress');
        if (inProgress) {
          const completed = todos.filter((t: any) => t.status === 'completed').length;
          title = `Working on: ${inProgress.content} (${completed}/${todos.length} completed)`;
          code = 'BUILD_TASK_WORKING';
          params = { task: inProgress.content, completed, total: todos.length };
        }
        break;
      }

      default:
        title = `Using ${event.tool}...`;
    }

    if (title && this.cleanEmitter) {
      if (code) {
        await this.cleanEmitter.phaseProgressWithCode(
          'development',
          code,
          calculateOverallProgress('development', 0.5),
          params
        );
      } else {
        await this.cleanEmitter.phaseProgress(
          'development',
          title,
          'AI is working on your project',
          calculateOverallProgress('development', 0.5)
        );
      }
    } else if (title) {
      await emitBuildEvent(buildId, 'ai_progress', {
        message: title,
        timestamp: Date.now(),
        userId
      });
    }
  }

  /**
   * Build result from accumulated state
   */
  private buildResult(): CodexSessionResult {
    const usage = this.parser.getUsage();
    const finalMessage = this.parser.getFinalMessage();
    const error = this.parser.getError();
    const completedTurn = this.parser.getHasCompletedTurn?.() ?? false;

    // Log session activity summary
    if (this.filesCreated > 0 || this.filesModified > 0) {
      console.log('\n📋 Codex Session Activity Summary:');
      console.log('================================');
      if (this.filesCreated > 0) {
        console.log(`  ✨ Files created: ${this.filesCreated}`);
      }
      if (this.filesModified > 0) {
        console.log(`  ✏️  Files modified: ${this.filesModified}`);
      }
      if (this.buildErrors.length > 0) {
        console.log(`  🔧 Errors encountered: ${this.buildErrors.length}`);
      }
      console.log('================================\n');
    }

    return {
      success: completedTurn || !error,
      result: finalMessage,
      error: error?.message,
      messages: this.messages,
      sessionId: this.threadId || undefined,
      tokenUsage: usage ? {
        input: usage.input_tokens,
        output: usage.output_tokens
      } : undefined,
      filesCreated: this.filesCreated,
      filesModified: this.filesModified,
      errorsEncountered: this.buildErrors.length,
      errorsFixed: this.fixedErrors,
      toolCallsTotal: this.toolCallsTotal
    };
  }

  /**
   * Resume an existing Codex session (thread)
   */
  async resume(
    threadId: string,
    prompt: string,
    workDir: string,
    buildId: string,
    timeoutMs: number = PROCESS_TIMEOUTS.claudeDocumentation,
    userId?: string,
    projectId?: string,
    options?: Partial<CodexSpawnOptions>
  ): Promise<CodexSessionResult> {
    console.log(`[CodexSession] Resuming thread ${threadId} for build ${buildId} with timeout: ${timeoutMs}ms`);

    if (userId) {
      this.cleanEmitter = new CleanEventEmitter(buildId, userId);
    }

    const rateLimiter = getGlobalRateLimiter();
    await rateLimiter.acquire();

    try {
      const resumeProcess = new CodexStreamProcess();
      const spawnOptions: CodexSpawnOptions = {
        prompt,
        workDir,
        ...(buildId && { buildId }),
        ...(userId && { userId }),
        ...(projectId && { projectId }),
        ...options
      };

      const rl = await resumeProcess.spawnResume(threadId, spawnOptions);
      this.threadId = threadId;

      let noThreadFound = false;
      let errorBuffer = '';

      return new Promise((resolve) => {
        let resolved = false;
        const finalize = (result: CodexSessionResult) => {
          if (resolved) {
            return;
          }
          resolved = true;
          if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
          }
          resolve(result);
        };

        this.timeout = setTimeout(() => {
          console.log(`[CodexSession] Resume timeout reached after ${timeoutMs}ms`);
          resumeProcess.kill();
          finalize({
            success: false,
            result: '',
            error: `Session timeout after ${timeoutMs}ms`,
            messages: this.messages,
            sessionId: this.threadId || undefined
          });
        }, timeoutMs);
        // Unref so it doesn't prevent process exit in tests
        this.timeout.unref();

        rl.on('line', (line: string) => {
          void (async () => {
            // Check for thread not found error
            if (line.includes('Thread not found') || line.includes('No thread found')) {
              noThreadFound = true;
              errorBuffer = line;
              console.log(`[CodexSession] Thread not found: ${line}`);
              resumeProcess.kill();
              finalize({
                success: false,
                result: '',
                error: errorBuffer || 'Thread not found',
                messages: [],
                sessionId: undefined,
                needsFallback: true
              });
              return;
            }

            const event = this.parser.parse(line);
            if (event) {
              this.messages.push(event);

              // Track activity
              const agentEvent = this.parser.toAgentEvent(event);
              if (agentEvent) {
                await this.handleAgentEvent(agentEvent, buildId, userId);
              }
            }
          })().catch(err => {
            console.error('[CodexSession] resume line handler failed:', err);
          });
        });

        rl.on('close', () => {
          if (noThreadFound) {
            console.log(`[CodexSession] Thread ${threadId} not found, falling back to new session`);
            return;
          }

          const usage = this.parser.getUsage();
          console.log(`[CodexSession] Resume session completed`);

          finalize({
            success: !this.parser.getError(),
            result: this.parser.getFinalMessage(),
            error: this.parser.getError()?.message,
            messages: this.messages,
            sessionId: this.threadId || undefined,
            tokenUsage: usage ? {
              input: usage.input_tokens,
              output: usage.output_tokens
            } : undefined,
            filesCreated: this.filesCreated,
            filesModified: this.filesModified,
            errorsEncountered: this.buildErrors.length,
            errorsFixed: this.fixedErrors,
            toolCallsTotal: this.toolCallsTotal
          });
        });

        rl.on('error', (error) => {
          console.error('[CodexSession] Resume readline error:', error);
          resumeProcess.kill();
          finalize({
            success: false,
            result: '',
            error: error.message,
            messages: this.messages,
            sessionId: this.threadId || undefined
          });
        });
      });
    } finally {
      rateLimiter.release();
    }
  }

  /**
   * Get the thread ID (session ID) for this session
   */
  getSessionId(): string | null {
    return this.threadId;
  }
}
