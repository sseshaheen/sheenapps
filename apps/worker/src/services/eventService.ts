import { EventEmitter } from 'events';
import {
  BuildPhase,
  CleanEventData,
  InternalBuildEvent,
  sanitizeErrorMessage,
  StructuredError,
  UserBuildEvent
} from '../types/cleanEvents';
import { pool } from './database';
import { ErrorMessageRenderer } from './errorMessageRenderer';
import { GlobalLimitService } from './globalLimitService';
import { mapProviderError } from './providerErrorMapper';
import { ServerLoggingService } from './serverLoggingService';
import { UsageLimitService } from './usageLimitService';
import { getWebhookService } from './webhookService';

// Create event bus for instant in-process updates
// Set maxListeners to 0 (unlimited) to prevent warnings with many concurrent SSE clients
export const bus = new EventEmitter();
bus.setMaxListeners(0);

/**
 * Safely convert a value to a number.
 * Supabase can return numeric(3,2) fields as strings, so we need to handle both.
 */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ============================================================================
// GITHUB SSE EVENTS - Frontend Team Requirements
// ============================================================================

// Direct GitHub event types (frontend expects these exact names)
export enum GitHubSyncEvent {
  SYNC_STARTED = 'github_sync_started',
  SYNC_PROGRESS = 'github_sync_progress', 
  SYNC_CONFLICT = 'github_sync_conflict',
  SYNC_COMPLETED = 'github_sync_completed',
  SYNC_FAILED = 'github_sync_failed'
}

// Progress throttling state (expert requirement)
// Stores: operationId -> { lastPercent, lastEmit timestamp }
const progressThrottleState = new Map<string, { lastPercent: number, lastEmit: number }>();

// TTL for progress state entries (5 minutes) - prevents unbounded growth from crashed builds
const PROGRESS_STATE_TTL_MS = 5 * 60 * 1000;
const MAX_PROGRESS_ENTRIES = 500;

/**
 * Clean up stale progress throttle entries to prevent memory leaks.
 * Called before adding new entries.
 */
function cleanupStaleProgressState(): void {
  const now = Date.now();
  const staleThreshold = now - PROGRESS_STATE_TTL_MS;

  // Remove entries older than TTL
  for (const [key, value] of progressThrottleState) {
    if (value.lastEmit < staleThreshold) {
      progressThrottleState.delete(key);
    }
  }

  // If still too large after TTL cleanup, remove oldest entries
  if (progressThrottleState.size > MAX_PROGRESS_ENTRIES) {
    const entries = Array.from(progressThrottleState.entries())
      .sort((a, b) => a[1].lastEmit - b[1].lastEmit);

    // Remove oldest entries until under limit
    const toRemove = entries.slice(0, entries.length - MAX_PROGRESS_ENTRIES);
    for (const [key] of toRemove) {
      progressThrottleState.delete(key);
    }
  }
}

/**
 * Emit GitHub-specific sync event with expert requirements
 * @param buildId - The build ID (used for SSE routing)
 * @param eventType - GitHub event type
 * @param data - Event data with required invariant fields
 */
export async function emitGitHubSyncEvent(
  buildId: string,
  eventType: GitHubSyncEvent,
  data: {
    operationId: string;    // Required invariant
    projectId: string;      // Required invariant  
    percent?: number;       // Monotonic progress
    [key: string]: any;
  }
) {
  // Expert requirement: throttle progress events
  if (eventType === GitHubSyncEvent.SYNC_PROGRESS && data.percent !== undefined) {
    const throttleKey = data.operationId;
    const lastState = progressThrottleState.get(throttleKey);
    const now = Date.now();
    
    // Throttle: +5% deltas or max 1/sec
    if (lastState) {
      const percentDelta = Math.abs(data.percent - lastState.lastPercent);
      const timeDelta = now - lastState.lastEmit;
      
      if (percentDelta < 5 && timeDelta < 1000) {
        return; // Skip this progress event
      }
    }
    
    // Cleanup stale entries before adding new one (prevents unbounded growth)
    cleanupStaleProgressState();

    progressThrottleState.set(throttleKey, {
      lastPercent: data.percent,
      lastEmit: now
    });
  }

  // Expert requirement: invariant fields with ISO timestamp
  const eventData = {
    timestamp: new Date().toISOString(),  // ISO format (required)
    ...data
  };

  // Create event structure matching our existing pattern
  const event = {
    buildId,
    type: eventType,                      // Direct GitHub event name
    data: eventData,
    timestamp: new Date().toISOString()
  };

  // Emit to SSE system
  bus.emit(buildId, event);
  bus.emit('all', event);
  
  // Send webhook if configured
  try {
    const webhookService = getWebhookService();
    await webhookService.send({
      buildId,
      type: eventType as any,
      data: eventData,
      timestamp: Date.now()
    });
  } catch (webhookError) {
    console.warn(`[GitHubEvent] Webhook delivery failed (non-blocking):`, webhookError);
  }
  
  // Clean up throttle state on terminal events
  if (eventType === GitHubSyncEvent.SYNC_COMPLETED || eventType === GitHubSyncEvent.SYNC_FAILED) {
    progressThrottleState.delete(data.operationId);
  }

  // Log for debugging
  console.log(`[GitHubEvent] ${eventType} for operation ${data.operationId}:`, eventData);
}

/**
 * Emit a build event - stores in DB and broadcasts via EventEmitter
 * @param buildId - The build ID
 * @param type - Event type (e.g., 'plan_started', 'task_completed')
 * @param data - Event data payload
 */
export async function emitBuildEvent(buildId: string, type: string, data: any) {
  let eventId: number | undefined;

  // Extract userId from data if available
  const userId = data?.userId || data?.user_id || null;

  // STEP 1: Try to store in DB if pool is available
  if (!pool) {
    console.warn('[Event] Database not available, skipping event storage (bus emit will still occur)');
  } else {
    try {
      // Enhanced error handling with structured approach
      let errorMessage: string | null = null;
      let errorCode: string | null = null;
      let errorParams: Record<string, any> | null = null;
      let userErrorMessage: string | null = null;

      if (data.error) {
        errorMessage = typeof data.error === 'string' ? data.error : data.error.message;

        // Map to structured error format
        const mappedError = mapProviderError(data.error);
        errorCode = mappedError.code;
        errorParams = mappedError.params || null;

        // Generate user-friendly message for backfill/legacy
        userErrorMessage = ErrorMessageRenderer.renderErrorForUser(errorCode as any, errorParams || undefined);

        // Handle AI usage limits specifically - set both local and global state
        if (errorCode === 'AI_LIMIT_REACHED' && errorParams?.resetTime) {
          try {
            await UsageLimitService.getInstance().setUsageLimit(
              errorParams.resetTime,
              errorMessage || 'AI limit reached'
            );

            const provider = errorParams.provider || 'anthropic';
            const region = process.env.SHEENAPPS_REGION || process.env.AWS_REGION || 'us-east';

            await GlobalLimitService.getInstance().setGlobalProviderLimit(
              provider,
              region,
              errorParams.resetTime,
              errorMessage || 'AI limit reached'
            );

            await ServerLoggingService.getInstance().logAIUsageLimit(
              errorParams.resetTime,
              errorMessage || 'AI limit reached',
              provider,
              'local'
            );

            console.log(`[Event] AI usage limit detected for ${provider}:${region}, set until ${new Date(errorParams.resetTime).toISOString()}`);
          } catch (limitError) {
            console.error('[Event] Failed to set usage limits:', limitError);
            await ServerLoggingService.getInstance().logCriticalError(
              'ai_limit_setting_failed',
              limitError as Error,
              { buildId, errorCode, provider: errorParams.provider || 'anthropic' }
            );
          }
        }
      }

      // Store structured error data in database
      const result = await pool.query(
        `INSERT INTO project_build_events
         (build_id, event_type, event_data, user_id, error_message, error_code, error_params, user_error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          buildId,
          type,
          JSON.stringify(data),
          userId,
          errorMessage,
          errorCode,
          errorParams ? JSON.stringify(errorParams) : null,
          userErrorMessage
        ]
      );

      eventId = result.rows[0].id;
    } catch (dbError) {
      console.error('[Event] Database insert failed (bus emit will still occur):', dbError);
    }
  }

  // STEP 2: Always emit to bus for real-time updates (even if DB failed/unavailable)
  try {
    const event = {
      id: eventId ?? `temp-${Date.now()}`,
      buildId,
      type,
      data,
      timestamp: new Date().toISOString()
    };

    bus.emit(buildId, event);
    bus.emit('all', event);

    // Send webhook (non-blocking)
    try {
      const webhookService = getWebhookService();
      await webhookService.send({
        buildId,
        type: type as any,
        data,
        timestamp: Date.now()
      });
    } catch (webhookError) {
      console.warn('[Event] Webhook delivery failed (non-blocking):', webhookError);
    }

    console.log(`[Event] ${type} for build ${buildId}:`, data);
  } catch (busError) {
    console.error('[Event] Bus emit failed:', busError);
  }

  return eventId;
}

/**
 * Get events for a build since a specific event ID
 * @param buildId - The build ID
 * @param lastEventId - Last event ID received by client
 * @param userId - User ID for security filtering (optional)
 */
export async function getEventsSince(buildId: string, lastEventId: number = 0, userId?: string) {
  if (!pool) {
    return [];
  }

  // If userId is provided, filter by it for security (only user's events, no system events)
  const query = userId
    ? `SELECT id, event_type as type, event_data as data, created_at as timestamp
       FROM project_build_events
       WHERE build_id = $1 AND id > $2 AND user_id = $3
       ORDER BY id`
    : `SELECT id, event_type as type, event_data as data, created_at as timestamp
       FROM project_build_events
       WHERE build_id = $1 AND id > $2
       ORDER BY id`;

  const params = userId ? [buildId, lastEventId, userId] : [buildId, lastEventId];
  const result = await pool.query(query, params);

  return result.rows.map((row: any) => ({
    id: row.id,
    type: row.type,
    data: row.data,
    timestamp: row.timestamp
  }));
}

/**
 * Subscribe to events for a specific build
 * @param buildId - The build ID
 * @param callback - Function to call when events occur
 * @returns Unsubscribe function
 */
export function subscribeToEvents(buildId: string, callback: (event: any) => void) {
  bus.on(buildId, callback);

  // Return unsubscribe function
  return () => {
    bus.off(buildId, callback);
  };
}

// ============================================================================
// CLEAN EVENT SYSTEM - NextJS Team API UX Implementation
// ============================================================================

/**
 * Emit a clean, structured build event with security filtering
 * @param buildId - The build ID
 * @param userId - User ID for security filtering
 * @param eventData - Clean event data
 */
export async function emitCleanBuildEvent(
  buildId: string,
  userId: string,
  eventData: CleanEventData
): Promise<number | undefined> {
  // Sanitize error message if present (needed for both DB and bus)
  const sanitizedErrorMessage = eventData.errorMessage
    ? sanitizeErrorMessage(eventData.errorMessage)
    : null;

  // Normalize empty strings to NULL for cleaner DB storage and consistent truthiness
  // This prevents '' vs NULL confusion in queries and analytics
  const normalizedTitle = eventData.title?.trim() || null;
  const normalizedDescription = eventData.description?.trim() || null;

  let eventId: number | undefined;

  // STEP 1: Try to store in DB if available
  // For failed events, populate structured error fields
  let errorCode: string | null = null;
  let errorParams: string | null = null;
  let userErrorMessage: string | null = null;

  if (eventData.eventType === 'failed') {
    // Use event code as error code for structured errors
    errorCode = eventData.code || 'BUILD_FAILED';
    errorParams = eventData.params ? JSON.stringify(eventData.params) : null;
    // Use sanitized error message as user-facing message
    userErrorMessage = sanitizedErrorMessage;
  }

  if (!pool) {
    console.warn('[CleanEvent] Database not available, skipping event storage (bus emit will still occur)');
  } else {
    try {
      const result = await pool.query(`
        INSERT INTO project_build_events (
          build_id,
          event_type,
          event_data,
          user_id,
          user_visible,
          internal_data,
          event_phase,
          event_title,
          event_description,
          overall_progress,
          finished,
          preview_url,
          error_message,
          duration_seconds,
          event_code,
          event_params,
          version_id,
          version_name,
          error_code,
          error_params,
          user_error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING id
      `, [
        buildId,
        eventData.eventType,
        JSON.stringify(eventData.legacyData || {}),
        userId,
        true,
        eventData.internalData ? JSON.stringify(eventData.internalData) : null,
        eventData.phase,
        normalizedTitle,
        normalizedDescription,
        typeof eventData.overallProgress === 'number'
          ? Math.min(Math.max(eventData.overallProgress, 0.0), 1.0)
          : null,
        eventData.finished || false,
        eventData.previewUrl || null,
        sanitizedErrorMessage,
        typeof eventData.durationSeconds === 'number'
          ? Math.min(eventData.durationSeconds, 999999.99)
          : null,
        eventData.code || null,
        eventData.params ? JSON.stringify(eventData.params) : null,
        eventData.versionId || null,
        eventData.versionName || null,
        errorCode,
        errorParams,
        userErrorMessage
      ]);

      eventId = result.rows[0].id;
    } catch (dbError) {
      console.error('[CleanEvent] Database insert failed (bus emit will still occur):', dbError);
      // Continue to emit to bus even if DB fails
    }
  }

  // STEP 2: Always emit to bus for real-time updates (even if DB failed/unavailable)
  try {
    const userEvent: UserBuildEvent = {
      id: eventId?.toString() ?? `temp-${Date.now()}`,
      build_id: buildId,
      event_type: eventData.eventType,
      phase: eventData.phase,
      title: eventData.title,
      description: eventData.description,
      overall_progress: eventData.overallProgress || 0,
      finished: eventData.finished || false,
      preview_url: eventData.previewUrl,
      event_code: eventData.code,
      event_params: eventData.params,
      error_message: sanitizedErrorMessage || undefined,
      created_at: new Date().toISOString(),
      duration_seconds: eventData.durationSeconds,
      versionId: eventData.versionId,
      versionName: eventData.versionName
    };

    bus.emit(buildId, userEvent);
    bus.emit('all', userEvent);

    // Send webhook (non-blocking)
    try {
      const webhookService = getWebhookService();
      await webhookService.send({
        buildId,
        type: eventData.eventType as any,
        data: userEvent,
        timestamp: Date.now()
      });
    } catch (webhookError) {
      console.warn('[CleanEvent] Webhook delivery failed (non-blocking):', webhookError);
    }

    console.log(`[CleanEvent] ${eventData.eventType}/${eventData.phase} for build ${buildId}: ${eventData.title}`);
    // Only log internal data in non-production to prevent leaking sensitive info (paths, commands, etc.)
    if (eventData.internalData && process.env.NODE_ENV !== 'production') {
      console.log(`[CleanEvent] Internal data:`, eventData.internalData);
    }
  } catch (busError) {
    console.error('[CleanEvent] Bus emit failed:', busError);
  }

  return eventId;
}

/**
 * Get clean user-facing events for a build (filtered for security)
 * @param buildId - The build ID
 * @param lastEventId - Last event ID received by client
 * @param userId - User ID for security filtering
 */
export async function getCleanEventsSince(
  buildId: string,
  lastEventId: number = 0,
  userId?: string
): Promise<UserBuildEvent[]> {
  if (!pool) {
    return [];
  }

  // Query only user-visible events with clean schema including structured errors, i18n fields, and version info
  const query = userId
    ? `SELECT
        id, build_id, event_type, event_phase, event_title, event_description,
        overall_progress, finished, preview_url,
        error_code, error_params, error_message, user_error_message,
        event_code, event_params,
        version_id, version_name,
        created_at, duration_seconds
       FROM project_build_events
       WHERE build_id = $1 AND id > $2 AND user_id = $3 AND user_visible = true
       AND event_phase IS NOT NULL  -- Only clean events
       ORDER BY id`
    : `SELECT
        id, build_id, event_type, event_phase, event_title, event_description,
        overall_progress, finished, preview_url,
        error_code, error_params, error_message, user_error_message,
        event_code, event_params,
        version_id, version_name,
        created_at, duration_seconds
       FROM project_build_events
       WHERE build_id = $1 AND id > $2 AND user_visible = true
       AND event_phase IS NOT NULL  -- Only clean events
       ORDER BY id`;

  const params = userId ? [buildId, lastEventId, userId] : [buildId, lastEventId];
  const result = await pool.query(query, params);

  return result.rows.map((row: any) => {
    // Build structured error object if error exists (safely parse error_params)
    let error: StructuredError | undefined = undefined;
    if (row.error_code) {
      let errorParams: Record<string, any> | undefined;
      if (row.error_params) {
        try {
          // pg may return jsonb as object already - don't double-parse
          errorParams = typeof row.error_params === 'string'
            ? JSON.parse(row.error_params)
            : row.error_params;
        } catch {
          errorParams = undefined;
        }
      }
      error = {
        code: row.error_code,
        params: errorParams,
        message: row.user_error_message || undefined
      };
    }

    // Parse event_params JSON if present
    let eventParams: Record<string, any> | undefined;
    if (row.event_params) {
      try {
        eventParams = typeof row.event_params === 'string'
          ? JSON.parse(row.event_params)
          : row.event_params;
      } catch {
        eventParams = undefined;
      }
    }

    return {
      id: row.id.toString(),
      build_id: row.build_id,
      event_type: row.event_type,
      phase: row.event_phase,
      title: row.event_title,
      description: row.event_description,
      overall_progress: toNumber(row.overall_progress) ?? 0,
      finished: row.finished === true,
      preview_url: row.preview_url || undefined,

      // i18n fields
      event_code: row.event_code || undefined,
      event_params: eventParams,

      // Structured error (new approach)
      error,

      // Legacy error message for backward compatibility
      error_message: row.user_error_message || row.error_message || undefined,

      created_at: row.created_at,

      // Version info for completion events
      versionId: row.version_id || undefined,
      versionName: row.version_name || undefined
    };
  });
}

/**
 * Get internal events with full debug data (admin/internal use only)
 * Authentication is handled by the route middleware layer
 * @param buildId - The build ID
 * @param lastEventId - Last event ID received
 */
export async function getInternalEventsSince(
  buildId: string,
  lastEventId: number = 0
): Promise<InternalBuildEvent[]> {
  if (!pool) {
    return [];
  }

  // Authentication is handled by admin middleware at the route level

  const query = `SELECT
      id, build_id, event_type, event_data, user_id, internal_data,
      event_phase, event_title, event_description, overall_progress,
      finished, preview_url, error_message, created_at, duration_seconds,
      version_id, version_name
     FROM project_build_events
     WHERE build_id = $1 AND id > $2
     AND event_phase IS NOT NULL  -- Only clean events
     ORDER BY id`;

  const result = await pool.query(query, [buildId, lastEventId]);

  return result.rows.map((row: any) => ({
    id: row.id.toString(),
    build_id: row.build_id,
    event_type: row.event_type,
    phase: row.event_phase,
    title: row.event_title,
    description: row.event_description,
    overall_progress: toNumber(row.overall_progress) ?? 0,
    finished: row.finished === true,
    preview_url: row.preview_url || undefined,
    error_message: row.error_message || undefined,
    created_at: row.created_at,
    duration_seconds: toNumber(row.duration_seconds) ?? undefined,
    user_id: row.user_id || undefined,
    internal_data: row.internal_data || undefined,
    versionId: row.version_id || undefined,
    versionName: row.version_name || undefined
  }));
}

/**
 * Helper function to emit common build phase events
 */

// Throttle deprecation warnings - warn once per unique title per process
// Limit size to prevent unbounded memory growth in long-running processes
const warnedLegacyTitles = new Set<string>();
const MAX_WARNED_TITLES = 100;

export class CleanEventEmitter {
  constructor(private buildId: string, private userId: string) {}

  /**
   * @deprecated Use phaseStartedWithCode() for i18n support
   */
  async phaseStarted(phase: BuildPhase, title: string, description: string, progress: number = 0) {
    // Deprecation warning - throttled to avoid log spam, with size limit
    if (!warnedLegacyTitles.has(title) && warnedLegacyTitles.size < MAX_WARNED_TITLES) {
      warnedLegacyTitles.add(title);
      console.warn(
        `⚠️ DEPRECATED: phaseStarted() called without event_code. ` +
        `Use phaseStartedWithCode() instead. Title: "${title}"`
      );
    }
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'started',
      title,
      description,
      overallProgress: progress,
      finished: false
    });
  }

  /**
   * @deprecated Use phaseProgressWithCode() for i18n support
   */
  async phaseProgress(phase: BuildPhase, title: string, description: string, progress: number) {
    // Deprecation warning - throttled to avoid log spam, with size limit
    if (!warnedLegacyTitles.has(title) && warnedLegacyTitles.size < MAX_WARNED_TITLES) {
      warnedLegacyTitles.add(title);
      console.warn(
        `⚠️ DEPRECATED: phaseProgress() called without event_code. ` +
        `Use phaseProgressWithCode() instead. Title: "${title}"`
      );
    }
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'progress',
      title,
      description,
      overallProgress: progress,
      finished: false
    });
  }

  /**
   * @deprecated Use phaseCompletedWithCode() for i18n support
   */
  async phaseCompleted(phase: BuildPhase, title: string, description: string, progress: number, durationSeconds?: number) {
    // Deprecation warning - throttled to avoid log spam, with size limit
    if (!warnedLegacyTitles.has(title) && warnedLegacyTitles.size < MAX_WARNED_TITLES) {
      warnedLegacyTitles.add(title);
      console.warn(
        `⚠️ DEPRECATED: phaseCompleted() called without event_code. ` +
        `Use phaseCompletedWithCode() instead. Title: "${title}"`
      );
    }
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'completed',
      title,
      description,
      overallProgress: progress,
      finished: false, // Only the final deploy phase should set finished = true
      durationSeconds
    });
  }

  /**
   * @deprecated Use buildCompletedWithCode() for i18n support
   */
  async buildCompleted(previewUrl: string, durationSeconds?: number, versionInfo?: { versionId: string; versionName: string }) {
    // No warning for buildCompleted - it's a terminal event that doesn't need translation
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase: 'deploy',
      eventType: 'completed',
      title: 'Preview Complete',
      description: 'Your application is ready!',
      overallProgress: 1.0,
      finished: true,
      previewUrl,
      durationSeconds,
      // Frontend team requested: Add version information to completion events
      versionId: versionInfo?.versionId,
      versionName: versionInfo?.versionName
    });
  }

  /**
   * @deprecated Use buildFailedWithCode() for i18n support
   */
  async buildFailed(phase: BuildPhase, errorMessage: string, internalData?: any) {
    // No warning for buildFailed - error handling is separate from i18n
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'failed',
      title: 'Build Failed',
      description: 'Something went wrong',
      overallProgress: 0,
      finished: true,
      errorMessage,
      internalData
    });
  }

  // **NEW STRUCTURED METHODS**: Support for i18n event codes
  async phaseStartedWithCode(phase: BuildPhase, code: string, params?: Record<string, any>, progress: number = 0) {
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'started',
      code,
      params,
      overallProgress: progress,
      finished: false,
      // Legacy fields (will be removed in Week 3)
      title: '',
      description: ''
    });
  }

  async phaseProgressWithCode(phase: BuildPhase, code: string, progress: number, params?: Record<string, any>) {
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'progress',
      code,
      params,
      overallProgress: progress,
      finished: false,
      // Legacy fields (will be removed in Week 3)
      title: '',
      description: ''
    });
  }

  async phaseCompletedWithCode(phase: BuildPhase, code: string, progress: number, params?: Record<string, any>, durationSeconds?: number) {
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'completed',
      code,
      params,
      overallProgress: progress,
      finished: false, // Only the final deploy phase should set finished = true
      durationSeconds,
      // Legacy fields (will be removed in Week 3)
      title: '',
      description: ''
    });
  }

  async buildCompletedWithCode(code: string, params?: Record<string, any>, durationSeconds?: number, versionInfo?: { versionId: string; versionName: string }) {
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase: 'deploy',
      eventType: 'completed',
      code,
      params: {
        ...params,
        // Add version info to params for i18n interpolation
        versionId: versionInfo?.versionId,
        versionName: versionInfo?.versionName,
        duration: durationSeconds
      },
      overallProgress: 1.0,
      finished: true,
      previewUrl: params?.url, // Extract from params
      durationSeconds,
      // Legacy fields (will be removed in Week 3)
      title: '',
      description: ''
    });
  }

  async buildFailedWithCode(phase: BuildPhase, code: string, params?: Record<string, any>) {
    // Extract error message from params for backward compatibility
    // Even though we have structured error codes, the legacy errorMessage field
    // ensures the error is visible in the API until fully migrated
    const errorMessage = params?.message || params?.error || code;

    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'failed',
      code,
      params,
      overallProgress: 0,
      finished: true,
      // Legacy fields - keep errorMessage populated for backward compatibility
      title: 'Build Failed',
      description: errorMessage,
      errorMessage
    });
  }

  /**
   * Emit recommendations_ready event for SSE clients.
   * Called after recommendations are successfully saved to the database.
   */
  async recommendationsReady(data: {
    projectId: string;
    versionId: string;
    buildSessionId?: string;
    recommendationCount: number;
    recommendations?: Array<{
      id: string;
      title: string;
      type: string;
      priority: string;
    }>;
  }) {
    return emitRecommendationsEvent(this.buildId, this.userId, 'recommendations_ready', data);
  }

  /**
   * Emit recommendations_failed event for SSE clients.
   * Called when recommendation generation fails.
   */
  async recommendationsFailed(data: {
    projectId: string;
    versionId: string;
    buildSessionId?: string;
    error: string;
    recoverable?: boolean;
  }) {
    return emitRecommendationsEvent(this.buildId, this.userId, 'recommendations_failed', data);
  }
}

// Type-safe payloads for recommendations events
type RecommendationsReadyPayload = {
  projectId: string;
  versionId: string;
  buildSessionId?: string;
  recommendationCount: number;
  recommendations?: Array<{ id: string; title: string; type: string; priority: string }>;
};

type RecommendationsFailedPayload = {
  projectId: string;
  versionId: string;
  buildSessionId?: string;
  error: string;
  recoverable?: boolean;
};

type RecommendationsPayload = RecommendationsReadyPayload | RecommendationsFailedPayload;

/**
 * Emit recommendations-specific events for SSE push.
 * These events are sent directly to connected SSE clients and stored
 * in the event stream for resumption support.
 *
 * @param buildId - The build ID for routing
 * @param userId - The user ID
 * @param eventType - 'recommendations_ready' or 'recommendations_failed'
 * @param data - Event payload
 */
async function emitRecommendationsEvent(
  buildId: string,
  userId: string,
  eventType: 'recommendations_ready' | 'recommendations_failed',
  data: RecommendationsPayload
): Promise<void> {
  const event = {
    buildId,
    type: eventType,
    data: {
      ...data,
      timestamp: Date.now(),
      userId
    },
    timestamp: new Date().toISOString()
  };

  // Emit to SSE system
  bus.emit(buildId, event);
  bus.emit('all', event);

  // Store in event stream for SSE resumption (if buildSessionId provided)
  if (data.buildSessionId) {
    try {
      const { getEventStream } = await import('./eventStream');
      const eventStream = getEventStream();
      await eventStream.storeEvent(data.buildSessionId as string, {
        type: eventType,
        data: event.data
      });
    } catch (error) {
      console.error(`[EventService] Failed to store ${eventType} in event stream:`, error);
      // Don't fail - the event was already broadcast via bus
    }
  }

  // Send webhook if configured
  try {
    const webhookService = getWebhookService();
    await webhookService.send({
      buildId,
      type: eventType as any,
      data: event.data,
      timestamp: Date.now()
    });
  } catch (webhookError) {
    console.warn(`[EventService] Webhook delivery failed for ${eventType} (non-blocking):`, webhookError);
  }

  // Type-safe logging based on event type
  const logDetails = eventType === 'recommendations_ready'
    ? { count: (data as RecommendationsReadyPayload).recommendationCount }
    : { error: (data as RecommendationsFailedPayload).error };

  console.log(`[EventService] ${eventType} emitted for build ${buildId}:`, {
    projectId: data.projectId,
    versionId: data.versionId,
    ...logDetails
  });
}
