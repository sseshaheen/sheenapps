/**
 * Navigation Silencer Utility
 * Temporarily suppresses auth toasts during navigation transitions
 * Prevents phantom "Authentication required" toasts caused by timing issues
 */

let silenceUntil = 0;

/**
 * Silence auth-related toasts for a specified duration
 * @param ms - Duration in milliseconds to silence toasts (default: 2000ms)
 */
export function silenceAuthToasts(ms = 2000) {
  silenceUntil = Date.now() + ms;
  console.debug('[Nav Silencer] Auth toasts silenced for', ms, 'ms');
}

/**
 * Check if auth toasts should be silenced
 * @returns true if currently in silence period
 */
export function shouldSilenceAuthToasts(): boolean {
  const shouldSilence = Date.now() < silenceUntil;
  if (shouldSilence) {
    console.debug('[Nav Silencer] Silencing auth toast (remaining:', silenceUntil - Date.now(), 'ms)');
  }
  return shouldSilence;
}