/**
 * Format build events from Worker API with new structured format
 * Worker sends: { code: "BUILD_DEPENDENCIES_INSTALLING", params: { step, total, progress } }
 * We translate codes to localized messages
 */

import type { CleanBuildEvent } from '@/types/build-events';

/**
 * Simple parameter interpolation for messages
 * Replaces {key} with params[key]
 */
function interpolateParams(template: string, params: Record<string, any>): string {
  return template.replace(/{(\w+)}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Format a build event using the new Worker format
 * Falls back gracefully during transition period
 */
export function formatBuildEvent(
  event: CleanBuildEvent,
  messages: any,
  locale: string = 'en'
): { title: string; description: string } {
  // Check if this is a new format event with code
  if (event.code && messages?.builder?.buildEvents?.[event.code]) {
    const template = messages.builder.buildEvents[event.code];
    const description = event.params 
      ? interpolateParams(template, event.params)
      : template;
    
    // Generate a title from the code if not provided
    const title = event.title || formatEventCodeAsTitle(event.code);
    
    return { title, description };
  }
  
  // Fallback to legacy format during transition
  return {
    title: event.title || 'Processing...',
    description: event.description || 'Working on your project...'
  };
}

/**
 * Convert event code to readable title
 * BUILD_DEPENDENCIES_INSTALLING -> Installing Dependencies
 * ROLLBACK_STARTED -> Rollback Started
 */
function formatEventCodeAsTitle(code: string): string {
  return code
    .replace(/^(BUILD_|ROLLBACK_)/, '')
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Check if event uses new structured format
 */
export function isStructuredEvent(event: any): boolean {
  return !!(event?.code && !event?.message);
}

/**
 * Get event progress percentage
 * New format uses params.progress (0.0-1.0)
 * Legacy format uses overall_progress (0-100)
 */
export function getEventProgress(event: CleanBuildEvent): number {
  if (event.params?.progress !== undefined) {
    // New format: 0.0-1.0 -> convert to percentage
    return Math.round(event.params.progress * 100);
  }
  
  // Legacy format: already in percentage
  return event.overall_progress || 0;
}

/**
 * Format event for display in build timeline
 */
export function formatEventForTimeline(
  event: CleanBuildEvent,
  messages: any,
  locale: string = 'en'
): {
  title: string;
  description: string;
  progress: number;
  isError: boolean;
  canRetry: boolean;
} {
  const { title, description } = formatBuildEvent(event, messages, locale);
  const progress = getEventProgress(event);
  
  return {
    title,
    description,
    progress,
    isError: event.event_type === 'failed' || !!event.error,
    canRetry: event.error?.code ? isRetryableError(event.error.code) : false
  };
}

/**
 * Check if error code is retryable
 */
function isRetryableError(code: string): boolean {
  const retryableCodes = [
    'NETWORK_TIMEOUT',
    'AI_LIMIT_REACHED',
    'RATE_LIMITED',
    'BUILD_TIMEOUT',
    'PROVIDER_UNAVAILABLE',
    'ROLLBACK_FAILED'  // Rollback can be retried if recoverable
  ];
  
  return retryableCodes.includes(code);
}

// Extended interface to support new Worker format
declare module '@/types/build-events' {
  interface CleanBuildEvent {
    code?: string;  // New: Event code from Worker
    params?: {      // New: Event parameters
      step?: number;
      total?: number;
      progress?: number;
      [key: string]: any;
    };
  }
}