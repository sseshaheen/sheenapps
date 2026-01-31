/**
 * Clipboard Utilities
 *
 * Milestone C - Expert Review Round 2 (Jan 2026)
 *
 * Provides cross-browser clipboard copy functionality with fallback
 * for Safari and insecure contexts (http:// instead of https://).
 *
 * Usage:
 * ```typescript
 * try {
 *   await copyToClipboard(text)
 *   showSuccessToast()
 * } catch (error) {
 *   showErrorToast()
 * }
 * ```
 */

/**
 * Copy text to clipboard with fallback for Safari/insecure contexts
 *
 * Tries modern navigator.clipboard API first, falls back to
 * deprecated document.execCommand if needed (still widely supported).
 *
 * @param text - Text to copy to clipboard
 * @throws Error if both methods fail
 *
 * @example
 * ```typescript
 * await copyToClipboard('API_KEY_123')
 * ```
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Modern path (preferred)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch (error) {
      // Fall through to fallback method
      console.warn('navigator.clipboard.writeText failed, using fallback:', error)
    }
  }

  // Fallback path for Safari / insecure contexts
  // Note: document.execCommand('copy') is deprecated but still widely supported
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed' // Prevent scrolling to bottom
    textarea.style.opacity = '0' // Make invisible
    textarea.style.pointerEvents = 'none' // Prevent interaction

    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()

    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (!successful) {
      throw new Error('execCommand copy failed')
    }
  } catch (error) {
    // Both methods failed
    throw new Error('Failed to copy to clipboard')
  }
}

/**
 * Check if clipboard write is supported in current environment
 *
 * @returns True if clipboard API is available
 *
 * @example
 * ```typescript
 * if (isClipboardSupported()) {
 *   // Show copy button
 * }
 * ```
 */
export function isClipboardSupported(): boolean {
  return !!(navigator.clipboard?.writeText || document.queryCommandSupported?.('copy'))
}
