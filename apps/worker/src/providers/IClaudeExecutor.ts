/**
 * Interface for Claude CLI execution strategies
 * Allows swapping between Redis pub/sub, HTTP service, or direct execution
 */
export interface IClaudeExecutor {
  /**
   * Execute Claude CLI with given arguments
   * @param prompt The prompt to send to Claude
   * @param args CLI arguments (e.g., ["--output-format", "stream-json"])
   * @param cwd Optional working directory
   * @returns Promise resolving to the parsed result
   */
  execute(prompt: string, args: string[], cwd?: string): Promise<ClaudeExecutorResult>;
  
  /**
   * Execute Claude CLI with streaming support
   * @param prompt The prompt to send to Claude
   * @param args CLI arguments (must include stream-json format)
   * @param cwd Optional working directory
   * @param onChunk Callback for each stream chunk
   * @returns Promise resolving when stream completes
   */
  executeStream?(
    prompt: string, 
    args: string[], 
    cwd: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<ClaudeExecutorResult>;
  
  /**
   * Check if the executor is healthy and can execute commands
   * @returns Promise resolving to true if healthy
   */
  healthCheck(): Promise<boolean>;
  
  /**
   * Get metrics about the executor (optional)
   * @returns Promise resolving to metrics object
   */
  getMetrics?(): Promise<ClaudeExecutorMetrics>;
  
  /**
   * Initialize the executor (optional)
   * Called once when the provider starts
   */
  initialize?(): Promise<void>;
  
  /**
   * Shutdown the executor cleanly (optional)
   * Called when the provider is shutting down
   */
  shutdown?(): Promise<void>;
}

export interface ClaudeExecutorResult {
  success: boolean;
  output: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  error?: string | undefined;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  } | undefined;
  duration?: number | undefined;
  sessionId?: string | undefined;
}

export interface ClaudeExecutorMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageExecutionTime: number;
  activeRequests: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  lastError?: string | undefined;
  lastErrorTime?: Date | undefined;
}