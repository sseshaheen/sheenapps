/**
 * Share Utilities
 * Web Share API + WhatsApp fallback for MENA users
 *
 * See: WORKSPACE_SIMPLIFICATION_PLAN.md Phase 4 - Publish Success Flow
 */

/**
 * Build WhatsApp share URL
 * wa.me works across mobile + desktop WhatsApp web
 */
export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/**
 * Build Twitter/X share URL
 */
export function buildTwitterShareUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
}

/**
 * Build LinkedIn share URL
 */
export function buildLinkedInShareUrl(url: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
}

/**
 * Try native Web Share API (mobile-first)
 * Returns true if share was successful, false if API not available or share cancelled
 */
export async function tryNativeShare(payload: {
  title?: string
  text?: string
  url?: string
}): Promise<boolean> {
  if (typeof navigator === 'undefined') return false
  if (!('share' in navigator)) return false

  try {
    await navigator.share(payload)
    return true
  } catch (error) {
    // User cancelled or share failed
    return false
  }
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined') return false

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }

    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    const success = document.execCommand('copy')
    document.body.removeChild(textArea)
    return success
  } catch {
    return false
  }
}

/**
 * Get share text in the appropriate language
 */
export function getShareText(url: string, locale: string): string {
  if (locale.startsWith('ar')) {
    return `شاهد موقعي الجديد: ${url}`
  }
  if (locale.startsWith('fr')) {
    return `Découvrez mon nouveau site: ${url}`
  }
  if (locale.startsWith('es')) {
    return `Mira mi nuevo sitio: ${url}`
  }
  if (locale.startsWith('de')) {
    return `Schau dir meine neue Website an: ${url}`
  }
  return `Check out my new site: ${url}`
}
