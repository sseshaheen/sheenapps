// Clean Event Schema - NextJS Team API UX Implementation
// Date: 2025-07-30

/**
 * Build phases for clean event categorization
 */
export type BuildPhase = 
  | 'setup'         // Project setup, validation
  | 'development'   // AI session, code generation
  | 'dependencies'  // Package installation
  | 'build'         // Compilation, bundling
  | 'deploy'        // Deployment to preview
  | 'metadata';     // Post-deployment metadata generation

/**
 * Clean event types (simplified from current arbitrary strings)
 */
export type CleanEventType = 
  | 'started'    // Phase/build started
  | 'progress'   // Progress update within phase
  | 'completed'  // Phase/build completed successfully
  | 'failed';    // Phase/build failed

/**
 * Structured error object for API responses
 * Supports internationalization and provides context
 */
// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface StructuredError {
  code: string;                                // Stable error code (AI_LIMIT_REACHED, NETWORK_TIMEOUT, etc.)
  params?: Record<string, any> | undefined;    // Context parameters (resetTime, etc.)
  message?: string | undefined;                // User-friendly message (for backward compatibility)
}

/**
 * User-facing clean build event (filtered for security)
 * This is what the NextJS team gets via /api/builds/:buildId/events
 */
// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface UserBuildEvent {
  id: string;
  build_id: string;
  event_type: CleanEventType;
  phase: BuildPhase;
  title: string;                    // DEPRECATED: Will be removed Week 3
  description: string;              // DEPRECATED: Will be removed Week 3
  overall_progress: number;         // 0.0-1.0 for progress bar
  finished: boolean;                // Definitive completion flag
  preview_url?: string | undefined;             // Preview URL when available

  // **NEW**: Structured i18n event data (consistent naming with API/DB schema)
  event_code?: string | undefined;              // Event code (BUILD_STARTED, BUILD_FAILED, etc.)
  event_params?: Record<string, any> | undefined; // Raw primitive parameters for i18n interpolation

  // UPDATED: Structured error handling (replaces error_message)
  error?: StructuredError | undefined;          // Structured error object for internationalization
  error_message?: string | undefined;           // DEPRECATED: Legacy field for backward compatibility

  created_at: string;               // ISO timestamp
  duration_seconds?: number | undefined;        // Time this step took

  // Frontend team requested: Version information for completion events
  versionId?: string | undefined;               // Version identifier for API operations
  versionName?: string | undefined;             // Human-readable version name
}

/**
 * Internal build event (full detail for debugging)
 * This is what internal systems get via /api/internal/builds/:buildId/events
 */
export interface InternalBuildEvent extends UserBuildEvent {
  user_id?: string;                 // User who triggered this build
  internal_data?: {
    // Sensitive data that should never reach end users
    file_paths?: string[];
    system_commands?: string[];
    error_stack_traces?: string[];
    project_path?: string;
    build_command?: string;
    package_manager?: string;
    install_strategy?: string;
    memory_usage_mb?: number;
    cpu_usage_percent?: number;
    files_created?: number;
    files_modified?: number;
    cache_hit?: boolean;
    recovery_attempts?: number;
    validation_results?: any;
    // Raw legacy event data for backward compatibility
    legacy_event_data?: any;
  };
}

/**
 * Data for creating a clean build event
 */
export interface CleanEventData {
  phase: BuildPhase;
  eventType: CleanEventType;
  title: string;                    // DEPRECATED: Will be removed Week 3
  description: string;              // DEPRECATED: Will be removed Week 3
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  overallProgress?: number | undefined;         // 0.0-1.0
  finished?: boolean | undefined;
  previewUrl?: string | undefined;
  errorMessage?: string | undefined;            // DEPRECATED: Will be removed Week 3
  durationSeconds?: number | undefined;

  // **NEW**: Structured i18n event data
  code?: string | undefined;                    // Event code (BUILD_STARTED, BUILD_FAILED, etc.)
  params?: Record<string, any> | undefined;     // Raw primitive parameters for i18n interpolation

  // Frontend team requested: Version information for completion events
  versionId?: string | undefined;               // Version identifier for API operations
  versionName?: string | undefined;             // Human-readable version name

  // Internal data (will be filtered from user events)
  internalData?: InternalBuildEvent['internal_data'] | undefined;

  // For backward compatibility with existing events
  legacyData?: any | undefined;
}

/**
 * Progress calculation utility for converting phases to progress
 */
export const PhaseProgressWeights: Record<BuildPhase, { start: number; weight: number }> = {
  setup: { start: 0.0, weight: 0.1 },          // 0% - 10%
  development: { start: 0.1, weight: 0.4 },    // 10% - 50%
  dependencies: { start: 0.5, weight: 0.15 },  // 50% - 65%
  build: { start: 0.65, weight: 0.2 },         // 65% - 85%
  deploy: { start: 0.85, weight: 0.1 },        // 85% - 95%
  metadata: { start: 0.95, weight: 0.05 }      // 95% - 100%
};

/**
 * Helper function to calculate overall progress based on phase and phase progress
 */
export function calculateOverallProgress(
  phase: BuildPhase, 
  phaseProgress: number = 0.5 // 0.0-1.0 within the phase
): number {
  const weights = PhaseProgressWeights[phase];
  const overallProgress = weights.start + (weights.weight * phaseProgress);
  return Math.min(1.0, Math.max(0.0, overallProgress));
}

/**
 * User-friendly phase names for display
 */
export const PhaseDisplayNames: Record<BuildPhase, string> = {
  setup: 'Setting up',
  development: 'Developing',
  dependencies: 'Installing dependencies',
  build: 'Building application',
  deploy: 'Deploying',
  metadata: 'Generating metadata'
};

/**
 * Safe error message sanitizer - removes sensitive information
 * Preserves URLs (http://, https://) while removing file system paths
 */
export function sanitizeErrorMessage(error: string | Error): string {
  const message = typeof error === 'string' ? error : error.message;

  // Remove stack traces first (take only first line)
  let sanitized = message.split('\n')[0] ?? message;

  // Remove absolute file paths (Unix and Windows) but preserve URLs
  // Unix paths: /home/..., /Users/..., /var/..., /tmp/..., /usr/..., /opt/...
  // Windows paths: C:\..., D:\...
  sanitized = sanitized
    .replace(/(?<!https?:)\/(?:home|Users|var|tmp|usr|opt|app|srv|root|private)[^\s]*/gi, '[path]')
    .replace(/[A-Z]:\\[^\s]*/gi, '[path]');

  // Remove sensitive patterns
  sanitized = sanitized
    .replace(/at .+:\d+:\d+/g, '')          // Stack trace locations
    .replace(/Error: /g, '')                // Error prefixes
    .replace(/TypeError: /g, '')            // Error type prefixes
    .replace(/SyntaxError: /g, '')          // Syntax errors
    .replace(/\b[0-9a-f-]{36}\b/g, '[id]'); // UUIDs

  // Fallback to generic message if still too technical
  if (sanitized.includes('node_modules') || sanitized.includes('process.') || sanitized.length < 10) {
    return 'Build failed - please check your code';
  }

  return sanitized.trim() || 'An error occurred';
}