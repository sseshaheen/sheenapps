/**
 * RTL (Right-to-Left) utilities for proper Arabic language support
 * 
 * MODERNIZED: Most RTL functionality now handled by CSS logical properties.
 * This file contains only essential utilities that cannot be replaced by CSS.
 */

/**
 * Check if a locale is RTL
 * Simplified approach - Arabic locales use RTL direction
 */
export function isRTL(locale: string): boolean {
  return locale.startsWith('ar')
}

/**
 * Get direction for a locale
 * Useful for dir attributes: dir={getDirection(locale)}
 */
export function getDirection(locale: string): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr'
}