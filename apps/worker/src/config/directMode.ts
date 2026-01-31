/**
 * Direct mode configuration
 * Centralized place to check if direct mode is enabled
 */

export function isDirectModeEnabled(): boolean {
  // If DIRECT_MODE is explicitly set, use that value
  if (process.env.DIRECT_MODE !== undefined) {
    return process.env.DIRECT_MODE === 'true';
  }
  
  // Otherwise, fall back to legacy behavior
  return process.env.SKIP_QUEUE === 'true' || process.env.NODE_ENV === 'development';
}