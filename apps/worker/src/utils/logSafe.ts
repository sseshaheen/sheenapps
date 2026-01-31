/**
 * Safe logging utility to prevent log explosion in Cloud Run
 * Caps output length and provides clear truncation indicators
 */

export interface LogSafeOptions {
  maxLength?: number;
  showTruncationInfo?: boolean;
  prefix?: string;
}

const DEFAULT_MAX_LENGTH = 2000;

/**
 * Log text with size limits to prevent log volume explosion
 * @param text The text to log
 * @param options Configuration options
 */
export function logSafe(text: string, options: LogSafeOptions = {}): void {
  const {
    maxLength = DEFAULT_MAX_LENGTH,
    showTruncationInfo = true,
    prefix = ''
  } = options;

  if (text.length <= maxLength) {
    console.log(`${prefix}${text}`);
    return;
  }

  const truncatedText = text.slice(0, maxLength);
  const truncationInfo = showTruncationInfo 
    ? `... (truncated ${text.length - maxLength} chars)` 
    : '...';
  
  console.log(`${prefix}${truncatedText}${truncationInfo}`);
}

/**
 * Log object with JSON stringification and size limits
 * @param obj The object to log
 * @param label Optional label for the log entry
 * @param options Configuration options
 */
export function logSafeObject(obj: any, label = '', options: LogSafeOptions = {}): void {
  try {
    const jsonString = JSON.stringify(obj, null, 2);
    const prefix = label ? `${label}: ` : '';
    logSafe(jsonString, { ...options, prefix });
  } catch (error) {
    console.log(`${label ? `${label}: ` : ''}[Object - JSON stringify failed]`);
  }
}

/**
 * Create a log-safe function with preset options
 * Useful for consistent logging within a module
 */
export function createLogSafe(defaultOptions: LogSafeOptions) {
  return (text: string, options: LogSafeOptions = {}) => {
    logSafe(text, { ...defaultOptions, ...options });
  };
}