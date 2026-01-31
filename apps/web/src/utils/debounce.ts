/**
 * Debounce utility for throttling function calls
 * Used for chat read status throttling to prevent excessive API calls
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | undefined

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }

    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * Debounce with immediate execution option
 * Useful when you want the first call to execute immediately
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounceImmediate<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | undefined

  return function executedFunction(...args: Parameters<T>) {
    const callNow = immediate && !timeout

    const later = () => {
      clearTimeout(timeout)
      timeout = undefined
      if (!immediate) func(...args)
    }

    clearTimeout(timeout)
    timeout = setTimeout(later, wait)

    if (callNow) func(...args)
  }
}