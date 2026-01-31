/**
 * Shared industry tag definitions for Run Hub
 * Used by both project creation and PATCH validation
 */

export const INDUSTRY_TAGS = [
  'ecommerce',
  'services',
  'restaurant',
  'portfolio',
  'course',
  'publishing',
  'fitness',
  'saas',
  'marketplace',
  'real-estate',
  'events',
  'generic',
] as const

export type IndustryTag = (typeof INDUSTRY_TAGS)[number]

/**
 * Type guard for validating industry tags
 */
export function isIndustryTag(v: unknown): v is IndustryTag {
  return typeof v === 'string' && (INDUSTRY_TAGS as readonly string[]).includes(v)
}
