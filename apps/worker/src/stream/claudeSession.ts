import * as fs from 'fs/promises';
import * as path from 'path';
import { getTimeoutForOperation } from '../config/timeouts';
import { CLAUDE_TIMEOUTS } from '../config/timeouts.env';
import { SystemConfigurationError, UsageLimitError, createClaudeCliMissingError, createUsageLimitError } from '../errors/systemErrors';
import { CleanEventEmitter, emitBuildEvent } from '../services/eventService';
import { UsageLimitService } from '../services/usageLimitService';
import { calculateOverallProgress } from '../types/cleanEvents';
import { ClaudeStreamProcess } from './claudeProcess';
import { MessageParser, StreamMessage } from './messageParser';
import { getGlobalRateLimiter } from './rateLimiter';

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface SessionResult {
  success: boolean;
  result: string;
  error?: string | undefined;
  messages: StreamMessage[];
  sessionId?: string | undefined;
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

export class ClaudeSession {
  private process = new ClaudeStreamProcess();
  private messages: StreamMessage[] = [];
  private timeout: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private outputBuffer: string[] = [];
  private toolErrors: Array<{name: string; error: string; timestamp: number}> = [];
  private buildErrors: Array<{type: string; message: string; file?: string | undefined}> = [];
  private fixedErrors = 0;
  private filesCreated = 0;
  private filesModified = 0;
  private toolCallsTotal = 0;
  private processExitCode: number | null = null;
  private processStderr: string = '';
  private cleanEmitter: CleanEventEmitter | null = null;

  async run(
    prompt: string,
    workDir: string,
    buildId: string,
    timeoutMs: number = CLAUDE_TIMEOUTS.complex,
    userId?: string,
    projectId?: string
  ): Promise<SessionResult> {
    console.log(`[ClaudeSession] Starting session for build ${buildId} with timeout: ${timeoutMs}ms (${timeoutMs/60000} minutes)`);

    // Detect e2e test scenario and use mock response in non-production
    const isE2ETest = this.isE2ETestScenario(prompt);
    const isNonProd = process.env.NODE_ENV !== 'production';

    if (isE2ETest && isNonProd) {
      console.log(`[ClaudeSession] E2E test detected in non-prod environment - using mock response`);
      return await this.generateMockE2EResponse(prompt, workDir, buildId, userId);
    }

    // Initialize clean event emitter if userId is provided
    if (userId) {
      this.cleanEmitter = new CleanEventEmitter(buildId, userId);
    }

    const rateLimiter = getGlobalRateLimiter();
    await rateLimiter.acquire();

    // Declare interval outside try block so it's accessible in finally for cleanup
    // Note: streamTimeout was removed as redundant - this.timeout already handles session timeout
    let continueCheckInterval: NodeJS.Timeout | undefined;

    try {
      const rl = await this.process.spawn(prompt, workDir, buildId, userId, projectId);

      // Monitor process exit and stderr for early error detection
      const processHandle = this.process.getProcess();
      if (processHandle) {
        processHandle.on('exit', (code, signal) => {
          this.processExitCode = code;
          console.log(`[ClaudeSession] Process exited with code ${code}, signal ${signal}`);

          // Check for system configuration errors (exit code 127 = command not found)
          if (code === 127) {
            console.error(`[ClaudeSession] Detected command not found error (exit code 127)`);
          }
        });

        // Capture stderr for usage limit and system error detection
        if (processHandle.stderr) {
          processHandle.stderr.on('data', (data) => {
            this.processStderr += data.toString();
          });
        }
      }

      // Set timeout
      this.timeout = setTimeout(() => {
        console.error(`[ClaudeSession] Session timeout after ${timeoutMs}ms (${timeoutMs/60000} minutes) for build ${buildId}`);
        console.error(`[ClaudeSession] Killing Claude process due to timeout`);
        this.process.kill();
      }, timeoutMs);

      // Send initial progress (clean event if available, fallback to legacy)
      if (this.cleanEmitter) {
        // i18n: Use WithCode method for translatable event
        await this.cleanEmitter.phaseProgressWithCode(
          'development',
          'BUILD_DEVELOPMENT_STARTING',
          calculateOverallProgress('development', 0.1)
        );
      } else {
        await emitBuildEvent(buildId, 'ai_started', {
          message: 'Starting AI session...',
          timestamp: Date.now(),
          userId
        });
      }

      // Process messages
      let lineCount = 0;
      let lastProgressTime = Date.now();
      let hasReceivedData = false;
      let lastOutputTime = Date.now();
      let resultReceived = false; // Flag to prevent race condition with continue prompt

      // Setup continue prompt mechanism with dynamic timeout
      const checkAndPromptContinue = () => {
        // CRITICAL: Check if result already received to prevent race condition
        // This fixes the "only prompt commands are supported in streaming mode" error
        // that occurs when a newline is sent to stdin after Claude has finished
        if (resultReceived) {
          console.log(`[ClaudeSession] Continue check skipped - result already received`);
          return;
        }

        const timeSinceLastOutput = Date.now() - lastOutputTime;
        const { timeout: currentTimeout, operationType } = getTimeoutForOperation(this.outputBuffer);

        if (timeSinceLastOutput > currentTimeout) {
          const stdin = this.process.getProcess()?.stdin;

          // Double-check stdin is writable before attempting write
          if (stdin && stdin.writable && !stdin.destroyed) {
            console.log(`[ClaudeSession] No output for ${timeSinceLastOutput/1000}s (${operationType} operation), sending continue prompt...`);
            console.log(`[ClaudeSession] Continue prompt state: resultReceived=${resultReceived}, stdin.writable=${stdin.writable}, stdin.destroyed=${stdin.destroyed}`);
            //TODO: ensure the continue prompt is sent using the session ID so that we resume the session not start a new one
            // Send a newline to potentially unstick Claude
            stdin.write('\n');
            lastOutputTime = Date.now(); // Reset to avoid spamming
          } else {
            console.log(`[ClaudeSession] Continue prompt skipped - stdin not writable (stdin=${!!stdin}, writable=${stdin?.writable}, destroyed=${stdin?.destroyed})`);
          }
        }
      };

      // Check every 10 seconds for stuck state
      continueCheckInterval = setInterval(checkAndPromptContinue, 10000);

      rl.on('line', (line) => {
        hasReceivedData = true;
        lastOutputTime = Date.now(); // Reset on any output
        console.log(`[ClaudeSession] Raw line: ${line}`);

        // Update output buffer for timeout analysis
        this.outputBuffer.push(line);
        if (this.outputBuffer.length > 10) {
          this.outputBuffer.shift(); // Keep only last 10 lines
        }
      });

      for await (const line of rl) {
        lineCount++;

        // Log every 10th line or every 5 seconds
        const now = Date.now();
        if (lineCount % 10 === 0 || now - lastProgressTime > 5000) {
          console.log(`[ClaudeSession] Processing line ${lineCount}...`);
          lastProgressTime = now;
        }

        const message = MessageParser.parse(line);
        if (!message) {
          if (line.trim()) {
            console.log(`[ClaudeSession] Failed to parse line ${lineCount}: ${line.substring(0, 100)}...`);
          }
          continue;
        }

        this.messages.push(message);

        // Check for tool errors
        if (message.type === 'user' && message.message?.content) {
          for (const content of message.message.content) {
            if (content.type === 'tool_result' && content.content) {
              // Check if this is an error result
              const contentStr = typeof content.content === 'string' ? content.content : '';
              if (contentStr.includes('error') || contentStr.includes('Error') ||
                  contentStr.includes('failed') || contentStr.includes('Failed')) {
                // Extract error type
                let errorType = 'unknown';
                let errorMessage = contentStr;
                let file = undefined;

                if (contentStr.includes('TypeScript')) {
                  errorType = 'typescript';
                } else if (contentStr.includes('npm') || contentStr.includes('package')) {
                  errorType = 'dependency';
                } else if (contentStr.includes('build')) {
                  errorType = 'build';
                } else if (contentStr.includes('ENOENT') || contentStr.includes('not found')) {
                  errorType = 'file_not_found';
                }

                // Try to extract file name
                const fileMatch = contentStr.match(/([\w-]+\.(ts|tsx|js|jsx))/);
                if (fileMatch) {
                  file = fileMatch[1];
                }

                this.buildErrors.push({ type: errorType, message: errorMessage, file });
                this.toolErrors.push({
                  name: content.tool_use_id || 'unknown',
                  error: contentStr,
                  timestamp: Date.now()
                });

                console.log(`[ClaudeSession] Build error detected: ${errorType} in ${file || 'unknown file'}`);
              }
            }
          }
        }

        // Capture session ID from first message
        if (!this.sessionId && message.session_id) {
          this.sessionId = message.session_id;
          console.log(`[ClaudeSession] Session ID: ${this.sessionId}`);
        }

        // Extract and emit user-friendly updates
        const updateInfo = await this.extractUserUpdateWithCode(message, buildId);
        if (updateInfo && this.cleanEmitter) {
          // Emit clean progress event with i18n code when available
          if (updateInfo.code) {
            await this.cleanEmitter.phaseProgressWithCode(
              'development',
              updateInfo.code,
              calculateOverallProgress('development', 0.5),
              updateInfo.params
            );
          } else {
            // Fallback for updates without code (legacy)
            await this.cleanEmitter.phaseProgress(
              'development',
              updateInfo.title,
              'AI is working on your project',
              calculateOverallProgress('development', 0.5)
            );
          }

          // Track if Claude is fixing errors
          if (updateInfo.title.includes('fix') || updateInfo.title.includes('Fix') || updateInfo.title.includes('error')) {
            this.fixedErrors++;
          }
        } else if (updateInfo) {
          // Fallback to legacy event if no clean emitter (for backward compatibility)
          await emitBuildEvent(buildId, 'ai_progress', {
            message: updateInfo.title,
            timestamp: Date.now(),
            userId
          });
        }

        // Check for completion
        if (message.type === 'result') {
          // CRITICAL: Set flag FIRST to prevent race condition with continue prompt interval
          // This must happen before any async operations to ensure the interval callback sees it
          resultReceived = true;

          // Close stdin immediately to prevent any writes (belt-and-suspenders with the flag)
          const stdin = this.process.getProcess()?.stdin;
          if (stdin && !stdin.destroyed) {
            console.log(`[ClaudeSession] Closing stdin to prevent post-result writes`);
            stdin.end();
          }

          // Now safe to clear timeout and interval
          clearTimeout(this.timeout);
          if (continueCheckInterval) clearInterval(continueCheckInterval);

          console.log(`[ClaudeSession] Session completed with result (resultReceived=${resultReceived}, is_error=${message.is_error})`);
          return this.buildResult(message);
        }
      }

      // If we get here, the stream ended without a result
      // Set flag to prevent any late continue prompts
      resultReceived = true;

      // Close stdin if still open
      const stdin = this.process.getProcess()?.stdin;
      if (stdin && !stdin.destroyed) {
        stdin.end();
      }

      clearTimeout(this.timeout);
      if (continueCheckInterval) clearInterval(continueCheckInterval);
      console.log(`[ClaudeSession] Stream ended without result. Received data: ${hasReceivedData}, Line count: ${lineCount}`);

      // Check for system configuration errors before throwing generic error
      if (this.processExitCode === 127) {
        console.log(`[ClaudeSession] Stream ended with exit code 127 - system configuration error`);
        throw createClaudeCliMissingError();
      }

      if (this.processStderr && this.processStderr.includes('claude: command not found')) {
        console.log(`[ClaudeSession] Stream ended with stderr indicating command not found`);
        throw createClaudeCliMissingError();
      }

      throw new Error(`Stream ended without result message (received ${lineCount} lines)`);

    } catch (error) {
      console.error(`[ClaudeSession] Error:`, error);

      // Re-throw system errors and usage limit errors to be handled by caller
      if (error instanceof SystemConfigurationError || error instanceof UsageLimitError) {
        throw error;
      }

      // Check if process was killed by timeout
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timeout') || !this.process.getProcess();

      return {
        success: false,
        result: '',
        error: isTimeout ? 'Session timeout - task took too long' : errorMessage,
        messages: this.messages,
        sessionId: this.sessionId || undefined
      };
    } finally {
      // CRITICAL: Clean up timers to prevent leaks
      if (this.timeout) clearTimeout(this.timeout);
      if (continueCheckInterval) clearInterval(continueCheckInterval);

      // Ensure process is cleaned up
      this.process.kill();
      // Release rate limiter
      rateLimiter.release();
    }
  }

  /**
   * i18n-aware update extraction - returns event code and params when available
   */
  private async extractUserUpdateWithCode(message: StreamMessage, buildId: string): Promise<{
    title: string;
    code?: string;
    params?: Record<string, any>;
  } | null> {
    if (message.type !== 'assistant' || !message.message?.content) {
      return null;
    }

    // Look for tool usage
    const toolUses = MessageParser.extractToolUses(message);

    for (const toolUse of toolUses) {
      this.toolCallsTotal++; // Track total tool calls
      switch (toolUse.name) {
        case 'Write': {
          const fileName = path.basename(toolUse.input?.file_path || 'file');
          this.filesCreated++;
          return {
            title: `Creating ${fileName}...`,
            code: 'BUILD_FILE_CREATING',
            params: { filename: fileName }
          };
        }

        case 'Edit': {
          const editFile = path.basename(toolUse.input?.file_path || 'file');
          this.filesModified++;
          return {
            title: `Updating ${editFile}...`,
            code: 'BUILD_FILE_UPDATING',
            params: { filename: editFile }
          };
        }

        case 'MultiEdit': {
          const multiEditFile = path.basename(toolUse.input?.file_path || 'file');
          const edits = toolUse.input?.edits || [];
          const isCreation = edits.length === 1 && edits[0]?.old_string === '';

          if (isCreation) {
            this.filesCreated++;
            return {
              title: `Creating ${multiEditFile}...`,
              code: 'BUILD_FILE_CREATING',
              params: { filename: multiEditFile }
            };
          } else {
            this.filesModified++;
            return {
              title: `Updating ${multiEditFile}...`,
              code: 'BUILD_FILE_UPDATING',
              params: { filename: multiEditFile }
            };
          }
        }

        case 'TodoWrite': {
          const todos = toolUse.input?.todos || [];
          const inProgress = todos.find((t: any) => t.status === 'in_progress');
          const completed = todos.filter((t: any) => t.status === 'completed').length;
          const total = todos.length;

          if (inProgress) {
            return {
              title: `Working on: ${inProgress.content} (${completed}/${total} completed)`,
              code: 'BUILD_TASK_WORKING',
              // Raw primitives for i18n interpolation (not preformatted string)
              params: { task: inProgress.content, completed, total }
            };
          }
          break;
        }

        case 'Bash': {
          const command = toolUse.input?.command || '';
          const description = toolUse.input?.description || '';
          if (description) {
            // Custom description - no code (use title as fallback)
            return { title: description };
          } else if (command.includes('npm install') || command.includes('pnpm install')) {
            return {
              title: 'Installing dependencies...',
              code: 'BUILD_DEPENDENCIES_INSTALLING',
              params: {}
            };
          } else if (command.includes('npm run build') || command.includes('pnpm build')) {
            return {
              title: 'Building application...',
              code: 'BUILD_COMPILING',
              params: {}
            };
          }
          break;
        }

        case 'Read': {
          const readFile = path.basename(toolUse.input?.file_path || 'file');
          return {
            title: `Reading ${readFile}...`,
            code: 'BUILD_FILE_READING',
            params: { filename: readFile }
          };
        }

        case 'ExitPlanMode':
          return {
            title: 'Planning complete, starting implementation...',
            code: 'BUILD_PLANNING_COMPLETE',
            params: {}
          };
      }
    }

    // Check for text content that might indicate progress
    const textContent = message.message.content.find(c => c.type === 'text');
    if (textContent?.text) {
      // Look for common progress indicators
      if (textContent.text.includes('successfully created')) {
        return { title: 'File created successfully' };
      } else if (textContent.text.includes('successfully completed')) {
        return { title: 'Task completed' };
      }
    }

    return null;
  }

  /**
   * @deprecated Use extractUserUpdateWithCode for i18n support
   */
  private async extractUserUpdate(message: StreamMessage, buildId: string): Promise<string | null> {
    const result = await this.extractUserUpdateWithCode(message, buildId);
    return result?.title || null;
  }

  private simplifyTaskName(task: string): string {
    return task
      .replace(/^(Create|Implement|Add|Update|Fix|Set up)\s+/i, '')
      .replace(/_/g, ' ')
      .replace(/\.(ts|tsx|js|jsx)$/i, '')
      .trim();
  }

  private buildResult(resultMessage: StreamMessage): SessionResult {
    // Check for usage limit errors before processing result
    if (resultMessage.is_error && resultMessage.result) {
      const isUsageLimit = UsageLimitService.isUsageLimitError(resultMessage.result);
      if (isUsageLimit) {
        const resetTime = UsageLimitService.extractResetTime(resultMessage.result);
        if (resetTime) {
          console.log(`[ClaudeSession] Usage limit detected, setting global state until ${new Date(resetTime).toISOString()}`);
          // Set global usage limit state asynchronously (don't await to avoid blocking)
          UsageLimitService.getInstance().setUsageLimit(resetTime, resultMessage.result).catch(err => {
            console.error(`[ClaudeSession] Failed to set usage limit state:`, err);
          });

          // Throw usage limit error to be handled by streamWorker
          throw createUsageLimitError(resetTime, resultMessage.result);
        }
      }
    }

    // Check for system configuration errors (exit code 127)
    if (this.processExitCode === 127) {
      console.log(`[ClaudeSession] System configuration error detected (exit code 127)`);
      throw createClaudeCliMissingError();
    }

    // Check stderr for other system configuration issues
    if (this.processStderr && this.processStderr.includes('claude: command not found')) {
      console.log(`[ClaudeSession] System configuration error detected in stderr`);
      throw createClaudeCliMissingError();
    }

    // Extract token usage and cost if available
    let tokenUsage = undefined;
    let totalCost = undefined;

    if (resultMessage.usage) {
      tokenUsage = {
        input: resultMessage.usage.input_tokens || 0,
        output: resultMessage.usage.output_tokens || 0
      };
    }

    if (resultMessage.total_cost_usd !== undefined) {
      totalCost = resultMessage.total_cost_usd;
    }

    // If there were build errors, log them
    if (this.buildErrors.length > 0) {
      console.log('\n🚨 Build Errors Encountered:');
      console.log('================================');
      const errorCounts = this.buildErrors.reduce((acc, err) => {
        acc[err.type] = (acc[err.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [type, count] of Object.entries(errorCounts)) {
        const icon = type === 'typescript' ? '📘' :
                    type === 'dependency' ? '📦' :
                    type === 'build' ? '🔨' :
                    type === 'file_not_found' ? '📁' : '❓';
        console.log(`  ${icon} ${type}: ${count} error${count > 1 ? 's' : ''}`);
      }

      console.log('\n📝 Error Details:');
      // Show first 3 unique errors
      const uniqueErrors = new Set<string>();
      let shown = 0;
      for (const err of this.buildErrors) {
        const key = `${err.type}:${err.file || 'unknown'}`;
        if (!uniqueErrors.has(key) && shown < 3) {
          uniqueErrors.add(key);
          console.log(`  - ${err.type} in ${err.file || 'unknown file'}`);
          if (err.message.length < 100) {
            console.log(`    ${err.message}`);
          } else {
            console.log(`    ${err.message.substring(0, 100)}...`);
          }
          shown++;
        }
      }

      if (this.buildErrors.length > 3) {
        console.log(`  ... and ${this.buildErrors.length - 3} more errors`);
      }

      console.log('\n💡 Claude\'s Response:');
      if (this.fixedErrors > 0) {
        console.log(`  ✅ Fixed ${this.fixedErrors} error${this.fixedErrors > 1 ? 's' : ''} automatically`);
      }
      console.log('  - Identified and resolved TypeScript issues');
      console.log('  - Handled missing dependencies');
      console.log('  - Created missing files as needed');
      console.log('================================\n');
    }

    // Log session activity summary (success or failure)
    if (!resultMessage.is_error && (this.filesCreated > 0 || this.filesModified > 0)) {
      console.log('\n📋 Session Activity Summary:');
      console.log('================================');
      if (this.filesCreated > 0) {
        console.log(`  ✨ Files created: ${this.filesCreated}`);
      }
      if (this.filesModified > 0) {
        console.log(`  ✏️  Files modified: ${this.filesModified}`);
      }
      if (this.buildErrors.length > 0) {
        console.log(`  🔧 Errors encountered and fixed: ${this.buildErrors.length}`);
      }
      console.log('================================\n');
    }

    return {
      success: !resultMessage.is_error,
      result: resultMessage.result || '',
      error: resultMessage.is_error ? (resultMessage.result || 'Unknown error') : undefined,
      messages: this.messages,
      sessionId: this.sessionId || undefined,
      totalCost,
      tokenUsage,
      // Activity metrics
      filesCreated: this.filesCreated,
      filesModified: this.filesModified,
      errorsEncountered: this.buildErrors.length,
      errorsFixed: this.fixedErrors,
      toolCallsTotal: this.toolCallsTotal
    };
  }

  async resume(
    sessionId: string,
    prompt: string,
    workDir: string,
    buildId: string,
    timeoutMs: number = CLAUDE_TIMEOUTS.documentation,
    userId?: string,
    projectId?: string
  ): Promise<SessionResult> {
    console.log(`[ClaudeSession] Resuming session ${sessionId} for build ${buildId} with timeout: ${timeoutMs}ms (${timeoutMs/300000} minutes)`);

    // Initialize clean event emitter if userId is provided
    if (userId) {
      this.cleanEmitter = new CleanEventEmitter(buildId, userId);
    }

    const rateLimiter = getGlobalRateLimiter();
    await rateLimiter.acquire();

    try {
      const resumeProcess = new ClaudeStreamProcess();
      const rl = await resumeProcess.spawnResume(sessionId, prompt, workDir, buildId, userId, projectId);

      // Set session ID from resumed session
      this.sessionId = sessionId;

      // Track if we got a "No conversation found" error
      let noConversationFound = false;
      let errorBuffer = '';

      return new Promise((resolve) => {
        this.timeout = setTimeout(() => {
          console.log(`[ClaudeSession] Session timeout reached after ${timeoutMs}ms`);
          resumeProcess.kill();
          resolve({
            success: false,
            result: '',
            error: `Session timeout after ${timeoutMs}ms`,
            messages: this.messages,
            sessionId: this.sessionId || undefined
          });
        }, timeoutMs);

        let resultMessage: StreamMessage | null = null;

        // Wrap async handler to prevent unhandled promise rejections
        // EventEmitter does not await handlers, so errors would be unhandled
        rl.on('line', (line: string) => {
          void (async () => {
            // Check for "No conversation found" error (non-JSON response)
            if (line.includes('No conversation found with session ID:')) {
              noConversationFound = true;
              errorBuffer = line;
              console.log(`[ClaudeSession] Session not found: ${line}`);
              resumeProcess.kill();
              return;
            }

            const message = MessageParser.parse(line);
            if (message) {
              this.messages.push(message);

              // Track activity
              const toolUses = MessageParser.extractToolUses(message);
              for (const toolUse of toolUses) {
                this.toolCallsTotal++;
                if (toolUse.name === 'Write' || toolUse.name === 'MultiEdit') {
                  const edits = toolUse.input?.edits || [];
                  const isCreation = toolUse.name === 'Write' ||
                    (edits.length === 1 && edits[0]?.old_string === '');
                  if (isCreation) {
                    this.filesCreated++;
                  } else {
                    this.filesModified++;
                  }
                }
              }

              // Extract and emit user-friendly updates
              const updateInfo = await this.extractUserUpdateWithCode(message, buildId);
              if (updateInfo && this.cleanEmitter) {
                // Emit clean progress event with i18n code when available
                if (updateInfo.code) {
                  await this.cleanEmitter.phaseProgressWithCode(
                    'development',
                    updateInfo.code,
                    calculateOverallProgress('development', 0.5),
                    updateInfo.params
                  );
                } else {
                  // Fallback for updates without code (legacy)
                  await this.cleanEmitter.phaseProgress(
                    'development',
                    updateInfo.title,
                    'AI is working on your project',
                    calculateOverallProgress('development', 0.5)
                  );
                }
              } else if (updateInfo) {
                // Fallback to legacy event if no clean emitter
                await emitBuildEvent(buildId, 'ai_progress', {
                  message: updateInfo.title,
                  timestamp: Date.now(),
                  userId
                });
              }

              // Check for completion
              if (message.type === 'result') {
                resultMessage = message;
              }
            }
          })().catch(err => {
            console.error('[ClaudeSession] resume line handler failed:', err);
          });
        });

        rl.on('close', () => {
          if (this.timeout) {
            clearTimeout(this.timeout);
          }

          // Handle "No conversation found" error
          if (noConversationFound) {
            console.log(`[ClaudeSession] Session ${sessionId} not found, falling back to new session`);
            resolve({
              success: false,
              result: '',
              error: errorBuffer || 'No conversation found',
              messages: [],
              sessionId: undefined,
              // Signal to caller that session wasn't found and fallback is needed
              needsFallback: true
            });
            return;
          }

          // Extract cost and usage from result message
          let totalCost: number | undefined;
          let tokenUsage: { input: number; output: number } | undefined;

          if (resultMessage?.usage) {
            tokenUsage = {
              input: resultMessage.usage.input_tokens || 0,
              output: resultMessage.usage.output_tokens || 0
            };
          }

          if (resultMessage?.total_cost_usd !== undefined) {
            totalCost = resultMessage.total_cost_usd;
          }

          console.log(`[ClaudeSession] Resume session completed`);
          if (totalCost) {
            console.log(`[ClaudeSession] Resume session cost: $${totalCost.toFixed(4)}`);
          }

          resolve({
            success: !resultMessage?.is_error,
            result: resultMessage?.result || '',
            error: resultMessage?.is_error ? (resultMessage.result || 'Unknown error') : undefined,
            messages: this.messages,
            sessionId: this.sessionId || undefined,
            totalCost,
            tokenUsage,
            // Activity metrics
            filesCreated: this.filesCreated,
            filesModified: this.filesModified,
            errorsEncountered: this.buildErrors.length,
            errorsFixed: this.fixedErrors,
            toolCallsTotal: this.toolCallsTotal
          });
        });

        rl.on('error', (error) => {
          console.error('[ClaudeSession] Resume readline error:', error);
          resumeProcess.kill();
          resolve({
            success: false,
            result: '',
            error: error.message,
            messages: this.messages,
            sessionId: this.sessionId || undefined
          });
        });
      });
    } finally {
      rateLimiter.release();
    }
  }

  async compact(sessionId: string, buildId: string, workDir: string, userId?: string, projectId?: string): Promise<string | null> {
    console.log(`[ClaudeSession] Compacting session ${sessionId} for build ${buildId}`);

    try {
      const compactProcess = new ClaudeStreamProcess();
      const rl = await compactProcess.spawnResume(sessionId, '/compact', workDir, buildId, userId, projectId);

      let compactSuccess = false;
      let errorMessage = '';
      let newSessionId: string | null = null;

      rl.on('line', (line: string) => {
        // Check for "No conversation found" error
        if (line.includes('No conversation found with session ID:')) {
          errorMessage = 'Session not found';
          compactProcess.kill();
          return;
        }

        const message = MessageParser.parse(line);
        if (message) {
          // Extract new session ID from compact result
          if (message.session_id) {
            newSessionId = message.session_id;
          }
          if (message.type === 'result' && !message.is_error) {
            compactSuccess = true;
            console.log('[ClaudeSession] Session compacted successfully');
            if (newSessionId) {
              console.log(`[ClaudeSession] New session ID after compact: ${newSessionId}`);
            }
          } else if (message.is_error) {
            errorMessage = message.result || 'Compact failed';
          }
        }
      });

      return new Promise((resolve) => {
        rl.on('close', () => {
          if (!compactSuccess && !errorMessage) {
            console.log('[ClaudeSession] Compact completed but success not confirmed');
          } else if (errorMessage) {
            console.error(`[ClaudeSession] Compact failed: ${errorMessage}`);
          }
          // Return new session ID if available
          resolve(newSessionId);
        });

        rl.on('error', (error) => {
          console.error('[ClaudeSession] Compact process error:', error);
          compactProcess.kill();
          resolve(null); // Don't throw - this is non-critical
        });
      });
    } catch (error) {
      console.error('[ClaudeSession] Failed to start compact process:', error);
      // Don't throw - compaction is an optimization, not critical
      return null;
    }
  }

  /**
   * Detect if the prompt indicates an e2e test scenario
   */
  private isE2ETestScenario(prompt: string): boolean {
    const e2eIndicators = [
      'Create a simple business landing page for our e2e testing',
      // 'e2e testing',
      // 'test automation',
      // 'automated testing',
      // 'cypress test',
      // 'playwright test',
      // 'selenium test'
    ];

    return e2eIndicators.some(indicator =>
      prompt.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Generate a mock response for e2e test scenarios
   */
  public async generateMockE2EResponse(
    prompt: string,
    workDir: string,
    buildId: string,
    userId?: string
  ): Promise<SessionResult> {
    console.log(`[ClaudeSession] Generating mock e2e response for prompt: ${prompt.substring(0, 100)}...`);

    // Initialize clean event emitter if userId is provided
    if (userId) {
      this.cleanEmitter = new CleanEventEmitter(buildId, userId);
    }

    try {
      // Send initial progress
      if (this.cleanEmitter) {
        await this.cleanEmitter.phaseProgress(
          'development',
          'Mock AI Session Started',
          'Mock AI is beginning to work on your e2e test project',
          calculateOverallProgress('development', 0.1)
        );
      } else {
        await emitBuildEvent(buildId, 'ai_started', {
          message: 'Starting mock AI session for e2e test...',
          timestamp: Date.now(),
          userId
        });
      }

      // Generate realistic mock files
      await this.createMockProjectFiles(workDir);

      // Simulate realistic timing (2-5 seconds instead of 60-90)
      const baseDelay = 2000;
      const randomDelay = Math.random() * 3000;
      const totalDelay = baseDelay + randomDelay;

      console.log(`[ClaudeSession] Simulating ${Math.round(totalDelay/1000)}s processing time for mock e2e response`);

      // Simulate progress updates
      await new Promise(resolve => setTimeout(resolve, 800));
      if (this.cleanEmitter) {
        await this.cleanEmitter.phaseProgress(
          'development',
          'Mock File Generation',
          'Creating test landing page structure...',
          calculateOverallProgress('development', 0.4)
        );
      }

      await new Promise(resolve => setTimeout(resolve, 700));
      if (this.cleanEmitter) {
        await this.cleanEmitter.phaseProgress(
          'development',
          'Mock Styling',
          'Adding CSS styles and responsive design...',
          calculateOverallProgress('development', 0.7)
        );
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      if (this.cleanEmitter) {
        await this.cleanEmitter.phaseProgress(
          'development',
          'Mock Completion',
          'E2E test project ready',
          calculateOverallProgress('development', 1.0)
        );
      }

      // Generate mock session ID
      const mockSessionId = `mock_session_${buildId}_${Date.now()}`;

      // Create mock messages to simulate Claude's responses
      const mockMessages: StreamMessage[] = [
        {
          type: 'assistant',
          session_id: mockSessionId,
          message: {
            id: `msg_${Date.now()}_1`,
            type: 'message',
            role: 'assistant',
            model: 'claude-3-5-sonnet-20241022',
            content: [{
              type: 'text',
              text: "I'll create a simple business landing page perfect for your e2e testing. This will include the essential elements typically tested in automated scenarios."
            }],
            stop_reason: 'end_turn'
          }
        },
        {
          type: 'assistant',
          session_id: mockSessionId,
          message: {
            id: `msg_${Date.now()}_2`,
            type: 'message',
            role: 'assistant',
            model: 'claude-3-5-sonnet-20241022',
            content: [{
              type: 'text',
              text: "I've created a clean, testable landing page with:"
            }],
            stop_reason: 'end_turn'
          }
        },
        {
          type: 'result',
          session_id: mockSessionId,
          result: 'Mock e2e project created successfully - includes HTML structure, CSS styling, and JavaScript interactions ideal for automated testing.',
          is_error: false,
          usage: {
            input_tokens: 120,
            output_tokens: 250,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          },
          total_cost_usd: 0.001
        }
      ];

      return {
        success: true,
        result: 'Mock e2e project created successfully - includes HTML structure, CSS styling, and JavaScript interactions ideal for automated testing.',
        messages: mockMessages,
        sessionId: mockSessionId,
        totalCost: 0.001, // Minimal cost
        tokenUsage: { input: 120, output: 250 },
        filesCreated: 4, // index.html, styles.css, script.js, package.json
        filesModified: 0,
        errorsEncountered: 0,
        errorsFixed: 0,
        toolCallsTotal: 3 // Simulated tool calls for file creation
      };

    } catch (error) {
      console.error(`[ClaudeSession] Error generating mock e2e response:`, error);
      return {
        success: false,
        result: '',
        error: `Mock e2e generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        messages: [],
        sessionId: undefined
      };
    }
  }

  /**
   * Create mock project files for e2e testing
   */
  private async createMockProjectFiles(workDir: string): Promise<void> {
    console.log(`[ClaudeSession] Creating mock project files in: ${workDir}`);

    try {
      // Ensure directory exists
      await fs.mkdir(workDir, { recursive: true });

      // Create package.json
      const packageJson = {
        name: 'e2e-test-project',
        version: '1.0.0',
        description: 'Mock project for e2e testing',
        main: 'index.html',
        scripts: {
          build: 'echo "Mock build complete"',
          dev: 'echo "Mock dev server running"',
          test: 'echo "Mock tests passed"'
        },
        keywords: ['e2e', 'testing', 'mock'],
        author: 'SheenApps E2E Test'
      };

      await fs.writeFile(
        path.join(workDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Create index.html with testable elements
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E2E Test Business Landing</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <nav data-testid="navigation">
      <div class="logo">TestBiz</div>
      <ul>
        <li><a href="#home" data-testid="nav-home">Home</a></li>
        <li><a href="#about" data-testid="nav-about">About</a></li>
        <li><a href="#contact" data-testid="nav-contact">Contact</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <section id="home" class="hero">
      <h1 data-testid="main-heading">Welcome to TestBiz</h1>
      <p data-testid="main-description">Your trusted partner for e2e testing solutions</p>
      <button id="cta-button" data-testid="cta-button" onclick="handleCTAClick()">Get Started</button>
    </section>

    <section id="about" class="about">
      <h2 data-testid="about-heading">About Our Services</h2>
      <div class="features">
        <div class="feature" data-testid="feature-1">
          <h3>Automated Testing</h3>
          <p>Comprehensive test automation solutions</p>
        </div>
        <div class="feature" data-testid="feature-2">
          <h3>Quality Assurance</h3>
          <p>Ensuring your software meets the highest standards</p>
        </div>
        <div class="feature" data-testid="feature-3">
          <h3>Continuous Integration</h3>
          <p>Seamless CI/CD pipeline integration</p>
        </div>
      </div>
    </section>

    <section id="contact" class="contact">
      <h2 data-testid="contact-heading">Contact Us</h2>
      <form data-testid="contact-form">
        <input
          type="text"
          placeholder="Your Name"
          data-testid="name-input"
          required
        >
        <input
          type="email"
          placeholder="Your Email"
          data-testid="email-input"
          required
        >
        <textarea
          placeholder="Your Message"
          data-testid="message-input"
          required
        ></textarea>
        <button type="submit" data-testid="submit-button">Send Message</button>
      </form>
    </section>
  </main>

  <footer data-testid="footer">
    <p>&copy; 2025 TestBiz. Perfect for E2E Testing.</p>
  </footer>

  <script src="script.js"></script>
</body>
</html>`;

      await fs.writeFile(path.join(workDir, 'index.html'), html);

      // Create styles.css with responsive design
      const css = `/* E2E Test Landing Page Styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Arial', sans-serif;
  line-height: 1.6;
  color: #333;
}

/* Header Styles */
header {
  background: #2c3e50;
  color: white;
  padding: 1rem 0;
  position: fixed;
  width: 100%;
  top: 0;
  z-index: 1000;
}

nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
}

nav ul {
  display: flex;
  list-style: none;
  gap: 2rem;
}

nav a {
  color: white;
  text-decoration: none;
  transition: color 0.3s ease;
}

nav a:hover {
  color: #3498db;
}

/* Main Content */
main {
  margin-top: 80px;
}

.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
  padding: 6rem 2rem;
}

.hero h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
  animation: fadeInUp 1s ease;
}

.hero p {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  animation: fadeInUp 1s ease 0.2s both;
}

#cta-button {
  background: #e74c3c;
  color: white;
  padding: 1rem 2rem;
  border: none;
  border-radius: 5px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.3s ease;
  animation: fadeInUp 1s ease 0.4s both;
}

#cta-button:hover {
  background: #c0392b;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}

/* About Section */
.about {
  padding: 4rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.about h2 {
  text-align: center;
  margin-bottom: 3rem;
  font-size: 2.5rem;
  color: #2c3e50;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

.feature {
  background: #f8f9fa;
  padding: 2rem;
  border-radius: 10px;
  text-align: center;
  transition: transform 0.3s ease;
  border: 2px solid transparent;
}

.feature:hover {
  transform: translateY(-5px);
  border-color: #3498db;
  box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}

.feature h3 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

/* Contact Section */
.contact {
  background: #ecf0f1;
  padding: 4rem 2rem;
}

.contact h2 {
  text-align: center;
  margin-bottom: 3rem;
  font-size: 2.5rem;
  color: #2c3e50;
}

form {
  max-width: 600px;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}

form input,
form textarea {
  padding: 1rem;
  border: 2px solid #bdc3c7;
  border-radius: 5px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

form input:focus,
form textarea:focus {
  outline: none;
  border-color: #3498db;
}

form textarea {
  height: 120px;
  resize: vertical;
}

form button {
  background: #27ae60;
  color: white;
  padding: 1rem;
  border: none;
  border-radius: 5px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

form button:hover {
  background: #219a52;
  transform: translateY(-2px);
}

/* Footer */
footer {
  background: #2c3e50;
  color: white;
  text-align: center;
  padding: 2rem;
}

/* Animations */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive Design */
@media (max-width: 768px) {
  nav {
    flex-direction: column;
    gap: 1rem;
  }

  nav ul {
    gap: 1rem;
  }

  .hero h1 {
    font-size: 2rem;
  }

  .features {
    grid-template-columns: 1fr;
  }
}`;

      await fs.writeFile(path.join(workDir, 'styles.css'), css);

      // Create script.js with testable interactions
      const js = `// E2E Test Landing Page JavaScript

// CTA Button Handler
function handleCTAClick() {
  console.log('CTA button clicked - perfect for e2e testing!');

  // Show success message for testing
  const button = document.getElementById('cta-button');
  const originalText = button.textContent;

  button.textContent = 'Getting Started...';
  button.disabled = true;

  // Simulate API call delay
  setTimeout(() => {
    alert('Welcome! This interaction is perfect for e2e test validation.');
    button.textContent = originalText;
    button.disabled = false;

    // Add success indicator for testing
    button.setAttribute('data-test-status', 'clicked');
  }, 1000);
}

// Form Submission Handler
document.addEventListener('DOMContentLoaded', function() {
  const form = document.querySelector('[data-testid="contact-form"]');

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    const name = document.querySelector('[data-testid="name-input"]').value;
    const email = document.querySelector('[data-testid="email-input"]').value;
    const message = document.querySelector('[data-testid="message-input"]').value;

    if (name && email && message) {
      console.log('Form submitted with:', { name, email, message });

      // Show success message
      const submitButton = document.querySelector('[data-testid="submit-button"]');
      const originalText = submitButton.textContent;

      submitButton.textContent = 'Sending...';
      submitButton.disabled = true;

      setTimeout(() => {
        alert('Thank you! Your message has been sent successfully.');
        form.reset();
        submitButton.textContent = originalText;
        submitButton.disabled = false;

        // Add success indicator for testing
        form.setAttribute('data-test-status', 'submitted');
      }, 1500);
    }
  });

  // Smooth scrolling for navigation links
  document.querySelectorAll('nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);

      if (targetElement) {
        const offsetTop = targetElement.offsetTop - 80; // Account for fixed header
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
      }
    });
  });

  // Add scroll indicator for testing
  let scrollTimeout;
  window.addEventListener('scroll', function() {
    clearTimeout(scrollTimeout);
    document.body.setAttribute('data-test-scrolling', 'true');

    scrollTimeout = setTimeout(() => {
      document.body.setAttribute('data-test-scrolling', 'false');
    }, 150);
  });

  console.log('E2E Test Landing Page loaded successfully!');
});`;

      await fs.writeFile(path.join(workDir, 'script.js'), js);

      console.log(`[ClaudeSession] Successfully created mock project files:`);
      console.log(`  - package.json (project configuration)`);
      console.log(`  - index.html (responsive landing page with test IDs)`);
      console.log(`  - styles.css (modern CSS with animations)`);
      console.log(`  - script.js (interactive JavaScript for testing)`);

    } catch (error) {
      console.error(`[ClaudeSession] Error creating mock project files:`, error);
      throw error;
    }
  }
}
