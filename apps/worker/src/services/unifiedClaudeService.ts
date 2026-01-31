/**
 * Unified Claude Service
 *
 * Provides a consistent interface for all Claude AI calls using CLI-based execution.
 * This replaces direct Anthropic SDK usage throughout the codebase for consistency.
 *
 * Architecture:
 * - Uses ClaudeExecutorFactory internally (Redis → CLI spawning)
 * - Provides system/user prompt separation
 * - Handles JSON output parsing
 * - Returns structured results with usage metrics
 */

import { ClaudeExecutorFactory } from '../providers/executors/claudeExecutorFactory';
import type { IClaudeExecutor, ClaudeExecutorResult } from '../providers/IClaudeExecutor';
import { unifiedLogger } from './unifiedLogger';

// =============================================================================
// TYPES
// =============================================================================

export interface UnifiedClaudeOptions {
  /** System prompt defining the AI's role and output format */
  systemPrompt: string;
  /** User prompt with the specific request */
  userPrompt: string;
  /** Maximum tokens for the response (default: 4000) */
  maxTokens?: number;
  /** Temperature for response variability (0.0 = deterministic, 1.0 = creative) */
  temperature?: number;
  /** Expected output format - 'json' will attempt to parse the response */
  outputFormat?: 'json' | 'text';
  /** Working directory for CLI execution */
  cwd?: string;
  /** Session ID for conversation continuity */
  sessionId?: string;
}

export interface UnifiedClaudeResult<T = string> {
  /** Whether the operation completed successfully */
  success: boolean;
  /** Parsed data (for JSON format) or raw text */
  data?: T | undefined;
  /** Raw output from CLI */
  rawOutput?: string | undefined;
  /** Error message if operation failed */
  error?: string | undefined;
  /** Token usage and cost metrics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  } | undefined;
  /** Execution duration in milliseconds */
  duration?: number | undefined;
  /** Session ID for continuing conversations */
  sessionId?: string | undefined;
}

// =============================================================================
// UNIFIED CLAUDE SERVICE
// =============================================================================

export class UnifiedClaudeService {
  private executor: IClaudeExecutor;

  constructor() {
    this.executor = ClaudeExecutorFactory.create();
    unifiedLogger.system('startup', 'info', 'UnifiedClaudeService initialized with CLI executor');
  }

  /**
   * Execute a Claude request using CLI-based execution
   *
   * @param options - Configuration for the request
   * @returns Structured result with data, usage metrics, and session info
   *
   * @example
   * ```typescript
   * const result = await service.execute<MigrationPlan>({
   *   systemPrompt: 'You are a migration expert...',
   *   userPrompt: 'Analyze this website...',
   *   maxTokens: 8000,
   *   outputFormat: 'json'
   * });
   *
   * if (result.success) {
   *   console.log(result.data.pages);
   * }
   * ```
   */
  async execute<T = string>(options: UnifiedClaudeOptions): Promise<UnifiedClaudeResult<T>> {
    const {
      systemPrompt,
      userPrompt,
      maxTokens = 4000,
      outputFormat = 'text',
      cwd,
      sessionId,
    } = options;

    const startTime = Date.now();

    // Build CLI args
    const args = ['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];

    if (maxTokens) {
      args.push('--max-tokens', String(maxTokens));
    }

    if (sessionId) {
      args.push('-r', sessionId);
    }

    // Combine prompts (CLI doesn't have separate system/user)
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    try {
      unifiedLogger.system('startup', 'info', 'Executing Claude CLI request', {
        promptLength: fullPrompt.length,
        maxTokens,
        outputFormat,
        hasSessionId: !!sessionId,
      });

      const result = await this.executor.execute(fullPrompt, args, cwd);
      const duration = Date.now() - startTime;

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'CLI execution failed',
          rawOutput: result.output,
          duration,
        };
      }

      // Parse JSON if requested
      if (outputFormat === 'json') {
        try {
          const parsed = this.parseJsonResponse(result.output);
          return {
            success: true,
            data: parsed as T,
            rawOutput: result.output,
            usage: result.usage,
            duration,
            sessionId: result.sessionId,
          };
        } catch (parseError) {
          unifiedLogger.system('error', 'error', 'JSON parse error in UnifiedClaudeService', {
            error: (parseError as Error).message,
            outputSample: result.output.slice(0, 500),
          });
          return {
            success: false,
            error: `JSON parse error: ${(parseError as Error).message}`,
            rawOutput: result.output,
            duration,
          };
        }
      }

      return {
        success: true,
        data: result.output as unknown as T,
        rawOutput: result.output,
        usage: result.usage,
        duration,
        sessionId: result.sessionId,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      unifiedLogger.system('error', 'error', 'UnifiedClaudeService execution error', {
        error: (error as Error).message,
        duration,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      };
    }
  }

  /**
   * Execute with streaming support
   *
   * @param options - Configuration for the request
   * @param onChunk - Callback for each streamed chunk
   * @returns Structured result with final data
   */
  async executeStream<T = string>(
    options: UnifiedClaudeOptions,
    onChunk: (chunk: string) => void
  ): Promise<UnifiedClaudeResult<T>> {
    const {
      systemPrompt,
      userPrompt,
      maxTokens = 4000,
      cwd,
      sessionId,
    } = options;

    const startTime = Date.now();

    // Build CLI args for streaming
    const args = ['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];

    if (maxTokens) {
      args.push('--max-tokens', String(maxTokens));
    }

    if (sessionId) {
      args.push('-r', sessionId);
    }

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    try {
      if (!this.executor.executeStream) {
        // Fall back to non-streaming if not supported
        return this.execute<T>(options);
      }

      const result = await this.executor.executeStream(fullPrompt, args, cwd, onChunk);
      const duration = Date.now() - startTime;

      return {
        success: result.success,
        data: result.output as unknown as T,
        rawOutput: result.output,
        usage: result.usage,
        duration,
        sessionId: result.sessionId,
        error: result.error,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      };
    }
  }

  /**
   * Check if the service is healthy
   */
  async healthCheck(): Promise<boolean> {
    return this.executor.healthCheck();
  }

  /**
   * Parse JSON response, handling markdown-wrapped JSON
   */
  private parseJsonResponse(text: string): unknown {
    let cleaned = text.trim();

    // Remove markdown code blocks if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Try direct parse first
    try {
      return JSON.parse(cleaned);
    } catch {
      // Try to extract JSON array or object
      const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No valid JSON found in response');
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: UnifiedClaudeService | null = null;

/**
 * Get the singleton instance of UnifiedClaudeService
 *
 * @returns The shared service instance
 *
 * @example
 * ```typescript
 * const claudeService = getUnifiedClaudeService();
 * const result = await claudeService.execute({ ... });
 * ```
 */
export function getUnifiedClaudeService(): UnifiedClaudeService {
  if (!instance) {
    instance = new UnifiedClaudeService();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetUnifiedClaudeService(): void {
  instance = null;
}
