/**
 * Centralized timeout configuration
 * All timeouts are in milliseconds and can be overridden via environment variables
 */

// Codex Session Timeouts
export const CODEX_TIMEOUTS = {
  // Initial build timeout
  initial: parseInt(process.env.CODEX_INITIAL_TIMEOUT || '1200000'), // 20 minutes default

  // Resume timeout (continuing with existing thread)
  resume: parseInt(process.env.CODEX_RESUME_TIMEOUT || '1200000'), // 20 minutes default

  // Complex build timeout
  complex: parseInt(process.env.CODEX_COMPLEX_TIMEOUT || '900000'), // 15 minutes default

  // Metadata generation timeout
  documentation: parseInt(process.env.CODEX_DOCUMENTATION_TIMEOUT || '300000'), // 5 minutes

  // Error fix timeout
  errorFix: parseInt(process.env.CODEX_ERROR_FIX_TIMEOUT || '600000'), // 10 minutes
};

// Claude Session Timeouts
export const CLAUDE_TIMEOUTS = {
  // Initial build timeout (first attempt)
  initial: parseInt(process.env.CLAUDE_INITIAL_TIMEOUT || '1200000'), // 20 minutes default

  // Resume timeout (when continuing with existing files)
  resume: parseInt(process.env.CLAUDE_RESUME_TIMEOUT || '1200000'), // 20 minutes default

  // Retry timeout (intermediate attempts)
  retry: parseInt(process.env.CLAUDE_RETRY_TIMEOUT || '300000'), // 5 minutes default

  // Final attempt timeout
  final: parseInt(process.env.CLAUDE_FINAL_TIMEOUT || '180000'), // 3 minutes default

  // Complex build timeout
  complex: parseInt(process.env.CLAUDE_COMPLEX_TIMEOUT || '900000'), // 15 minutes default

  // Metadata generation timeouts
  recommendations: parseInt(process.env.CLAUDE_RECOMMENDATIONS_TIMEOUT || '180000'), // 3 minutes
  documentation: parseInt(process.env.CLAUDE_DOCUMENTATION_TIMEOUT || '300000'), // 5 minutes
  versionClassification: parseInt(process.env.CLAUDE_VERSION_CLASSIFICATION_TIMEOUT || '60000'), // 1 minute

  // Error fix timeout
  errorFix: parseInt(process.env.CLAUDE_ERROR_FIX_TIMEOUT || '600000'), // 10 minutes
};

// Process and Command Timeouts
export const PROCESS_TIMEOUTS = {
  // Claude process warning timeout (just logs a warning, doesn't kill)
  claudeWarning: parseInt(process.env.CLAUDE_WARNING_TIMEOUT || '120000'), // 2 minutes

  // Claude process hard kill timeout (SIGKILL if still running)
  claudeHardKill: parseInt(process.env.CLAUDE_HARD_KILL_TIMEOUT || '1800000'), // 30 minutes

  // Codex process warning timeout (just logs a warning, doesn't kill)
  codexWarning: parseInt(process.env.CODEX_WARNING_TIMEOUT || '120000'), // 2 minutes

  // Claude complex (used by CodexSession as fallback)
  claudeComplex: parseInt(process.env.CLAUDE_COMPLEX_TIMEOUT || '900000'), // 15 minutes

  // Claude documentation (used by CodexSession as fallback)
  claudeDocumentation: parseInt(process.env.CLAUDE_DOCUMENTATION_TIMEOUT || '300000'), // 5 minutes

  // NPM install timeout
  npmInstall: parseInt(process.env.NPM_INSTALL_TIMEOUT || '300000'), // 5 minutes

  // Build command timeout
  buildCommand: parseInt(process.env.BUILD_COMMAND_TIMEOUT || '600000'), // 10 minutes

  // Deploy timeout
  deploy: parseInt(process.env.DEPLOY_TIMEOUT || '300000'), // 5 minutes

  // Validation timeout
  validation: parseInt(process.env.VALIDATION_TIMEOUT || '120000'), // 2 minutes

  // Fix validation timeout
  fixValidation: parseInt(process.env.FIX_VALIDATION_TIMEOUT || '300000'), // 5 minutes
};

// Cache and Cleanup Intervals
export const INTERVALS = {
  // Error classifier cache cleanup
  cacheCleanup: parseInt(process.env.CACHE_CLEANUP_INTERVAL || '300000'), // 5 minutes

  // Build start time cleanup
  buildCleanup: parseInt(process.env.BUILD_CLEANUP_INTERVAL || '300000'), // 5 minutes

  // Metrics flush interval
  metricsFlush: parseInt(process.env.METRICS_FLUSH_INTERVAL || '5000'), // 5 seconds
};

// Cache Expiration Times
export const CACHE_EXPIRY = {
  // Error classification cache
  errorClassification: parseInt(process.env.ERROR_CACHE_EXPIRY || '3600000'), // 1 hour

  // Build start times
  buildStartTime: parseInt(process.env.BUILD_START_EXPIRY || '3600000'), // 1 hour
};

// Helper function to get timeout for attempt
export function getTimeoutForAttempt(attemptNumber: number, hasExistingFiles: boolean): number {
  if (attemptNumber === 1) {
    return CLAUDE_TIMEOUTS.initial;
  }
  if (hasExistingFiles) {
    return CLAUDE_TIMEOUTS.resume;
  }
  if (attemptNumber >= 3) {
    return CLAUDE_TIMEOUTS.final;
  }
  return CLAUDE_TIMEOUTS.retry;
}

// Helper to format timeout for logging
export function formatTimeout(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} minutes`;
  }
  return `${seconds} seconds`;
}
