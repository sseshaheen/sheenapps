/**
 * Safely write text to clipboard. Returns true on success, false on failure.
 * Safari and Firefox can reject clipboard access in certain contexts.
 */
export async function safeCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
