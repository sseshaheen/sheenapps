/**
 * Quick Suggestions Service
 *
 * Generates instant suggestions from prompt analysis data.
 * These are shown immediately when a build starts, before AI recommendations arrive.
 *
 * Key Principles:
 * - Uses MISSING information to suggest what to add (not what already exists)
 * - Returns i18n keys only - localization happens in UI components
 * - Client-safe: NO server-only imports (next-intl/server, etc.)
 *
 * Usage in components:
 * ```typescript
 * const t = useTranslations('recommendations')
 * const localizedSuggestions = suggestions.map(s => ({
 *   ...s,
 *   title: t(s.titleKey),
 *   description: t(s.descriptionKey),
 *   prompt: t(s.promptKey),
 * }))
 * ```
 */

'use client'

import type { QuickSuggestion, PromptAnalysis } from '@/store/recommendations-store'

/**
 * Suggestion rules based on what's MISSING from the prompt.
 * These are high-priority because the user didn't mention them.
 */
const MISSING_INFO_SUGGESTIONS: Record<string, QuickSuggestion> = {
  'contact': {
    id: 'qs-contact',
    titleKey: 'quickSuggestions.contact.title',
    descriptionKey: 'quickSuggestions.contact.description',
    category: 'feature',
    promptKey: 'quickSuggestions.contact.prompt'
  },
  'pricing': {
    id: 'qs-pricing',
    titleKey: 'quickSuggestions.pricing.title',
    descriptionKey: 'quickSuggestions.pricing.description',
    category: 'feature',
    promptKey: 'quickSuggestions.pricing.prompt'
  },
  'faq': {
    id: 'qs-faq',
    titleKey: 'quickSuggestions.faq.title',
    descriptionKey: 'quickSuggestions.faq.description',
    category: 'feature',
    promptKey: 'quickSuggestions.faq.prompt'
  },
  'testimonials': {
    id: 'qs-testimonials',
    titleKey: 'quickSuggestions.testimonials.title',
    descriptionKey: 'quickSuggestions.testimonials.description',
    category: 'ui',
    promptKey: 'quickSuggestions.testimonials.prompt'
  },
  'about': {
    id: 'qs-about',
    titleKey: 'quickSuggestions.about.title',
    descriptionKey: 'quickSuggestions.about.description',
    category: 'feature',
    promptKey: 'quickSuggestions.about.prompt'
  },
  'services': {
    id: 'qs-services',
    titleKey: 'quickSuggestions.services.title',
    descriptionKey: 'quickSuggestions.services.description',
    category: 'feature',
    promptKey: 'quickSuggestions.services.prompt'
  },
  'portfolio': {
    id: 'qs-portfolio',
    titleKey: 'quickSuggestions.portfolio.title',
    descriptionKey: 'quickSuggestions.portfolio.description',
    category: 'ui',
    promptKey: 'quickSuggestions.portfolio.prompt'
  },
  'team': {
    id: 'qs-team',
    titleKey: 'quickSuggestions.team.title',
    descriptionKey: 'quickSuggestions.team.description',
    category: 'feature',
    promptKey: 'quickSuggestions.team.prompt'
  }
}

/**
 * Service-based suggestions for services NOT mentioned in the prompt.
 * Suggests common features based on what wasn't explicitly requested.
 */
const SERVICE_SUGGESTIONS: Record<string, QuickSuggestion> = {
  'booking': {
    id: 'qs-booking',
    titleKey: 'quickSuggestions.booking.title',
    descriptionKey: 'quickSuggestions.booking.description',
    category: 'feature',
    promptKey: 'quickSuggestions.booking.prompt'
  },
  'payment': {
    id: 'qs-payment',
    titleKey: 'quickSuggestions.payment.title',
    descriptionKey: 'quickSuggestions.payment.description',
    category: 'feature',
    promptKey: 'quickSuggestions.payment.prompt'
  },
  'gallery': {
    id: 'qs-gallery',
    titleKey: 'quickSuggestions.gallery.title',
    descriptionKey: 'quickSuggestions.gallery.description',
    category: 'ui',
    promptKey: 'quickSuggestions.gallery.prompt'
  },
  'newsletter': {
    id: 'qs-newsletter',
    titleKey: 'quickSuggestions.newsletter.title',
    descriptionKey: 'quickSuggestions.newsletter.description',
    category: 'feature',
    promptKey: 'quickSuggestions.newsletter.prompt'
  },
  'blog': {
    id: 'qs-blog',
    titleKey: 'quickSuggestions.blog.title',
    descriptionKey: 'quickSuggestions.blog.description',
    category: 'feature',
    promptKey: 'quickSuggestions.blog.prompt'
  },
  'social': {
    id: 'qs-social',
    titleKey: 'quickSuggestions.social.title',
    descriptionKey: 'quickSuggestions.social.description',
    category: 'feature',
    promptKey: 'quickSuggestions.social.prompt'
  }
}

/**
 * Universal suggestions that are always good additions.
 * Used to fill remaining slots when specific suggestions aren't applicable.
 */
const UNIVERSAL_SUGGESTIONS: QuickSuggestion[] = [
  {
    id: 'qs-seo',
    titleKey: 'quickSuggestions.seo.title',
    descriptionKey: 'quickSuggestions.seo.description',
    category: 'seo',
    promptKey: 'quickSuggestions.seo.prompt'
  },
  {
    id: 'qs-analytics',
    titleKey: 'quickSuggestions.analytics.title',
    descriptionKey: 'quickSuggestions.analytics.description',
    category: 'seo',
    promptKey: 'quickSuggestions.analytics.prompt'
  },
  {
    id: 'qs-mobile',
    titleKey: 'quickSuggestions.mobile.title',
    descriptionKey: 'quickSuggestions.mobile.description',
    category: 'performance',
    promptKey: 'quickSuggestions.mobile.prompt'
  },
  {
    id: 'qs-accessibility',
    titleKey: 'quickSuggestions.accessibility.title',
    descriptionKey: 'quickSuggestions.accessibility.description',
    category: 'accessibility',
    promptKey: 'quickSuggestions.accessibility.prompt'
  },
  {
    id: 'qs-darkMode',
    titleKey: 'quickSuggestions.darkMode.title',
    descriptionKey: 'quickSuggestions.darkMode.description',
    category: 'ui',
    promptKey: 'quickSuggestions.darkMode.prompt'
  }
]

/**
 * Normalize a string key for matching against suggestion maps.
 * Handles variations like "contact details" → "contact", "pricing info" → "pricing".
 *
 * NOTE: This is a simple implementation. If we see patterns in production data
 * that aren't matching, we can add more normalization rules here.
 */
function normalizeKey(input: string): string {
  const lower = input.toLowerCase().trim()

  // Handle common variations
  if (lower.includes('contact')) return 'contact'
  if (lower.includes('pric')) return 'pricing'
  if (lower.includes('faq') || lower.includes('question')) return 'faq'
  if (lower.includes('testimon') || lower.includes('review')) return 'testimonials'
  if (lower.includes('about')) return 'about'
  if (lower.includes('service')) return 'services'
  if (lower.includes('portfolio') || lower.includes('work') || lower.includes('project')) return 'portfolio'
  if (lower.includes('team') || lower.includes('staff')) return 'team'
  if (lower.includes('book') || lower.includes('appointment') || lower.includes('schedule')) return 'booking'
  if (lower.includes('pay') || lower.includes('checkout') || lower.includes('cart')) return 'payment'
  if (lower.includes('gallery') || lower.includes('photo') || lower.includes('image')) return 'gallery'
  if (lower.includes('newsletter') || lower.includes('subscribe') || lower.includes('email list')) return 'newsletter'
  if (lower.includes('blog') || lower.includes('article') || lower.includes('post')) return 'blog'
  if (lower.includes('social') || lower.includes('facebook') || lower.includes('instagram') || lower.includes('twitter')) return 'social'

  return lower
}

/**
 * Generate quick suggestions based on prompt analysis.
 *
 * Strategy:
 * 1. Add suggestions for missing information (highest priority)
 * 2. Add service suggestions for services NOT mentioned
 * 3. Fill remaining slots with universal suggestions
 *
 * Always returns exactly 3 suggestions (or fewer if not enough apply).
 *
 * @param analysis - The prompt analysis from AI
 * @returns Array of quick suggestions (max 3)
 */
export function generateQuickSuggestions(analysis: PromptAnalysis): QuickSuggestion[] {
  const suggestions: QuickSuggestion[] = []
  const addedIds = new Set<string>()

  // Normalize existing services for comparison
  const existingServices = new Set(
    analysis.extractedInfo.services.map(s => normalizeKey(s))
  )

  // Also check functional requirements for what they already have
  const existingRequirements = new Set(
    analysis.extractedInfo.functionalRequirements.map(r => normalizeKey(r))
  )

  // Combine existing features
  const allExisting = new Set([...existingServices, ...existingRequirements])

  // Helper to add a suggestion if not already added and not already existing
  function maybeAdd(suggestion: QuickSuggestion, key: string): boolean {
    if (suggestions.length >= 3) return false
    if (addedIds.has(suggestion.id)) return false
    if (allExisting.has(key)) return false

    suggestions.push(suggestion)
    addedIds.add(suggestion.id)
    return true
  }

  // 1. Add suggestions for missing information (highest priority)
  for (const missing of analysis.missingInformation) {
    if (suggestions.length >= 3) break
    const key = normalizeKey(missing)
    const suggestion = MISSING_INFO_SUGGESTIONS[key]
    if (suggestion) {
      maybeAdd(suggestion, key)
    }
  }

  // 2. Add service suggestions for services NOT mentioned
  for (const [serviceKey, suggestion] of Object.entries(SERVICE_SUGGESTIONS)) {
    if (suggestions.length >= 3) break
    if (!allExisting.has(serviceKey)) {
      maybeAdd(suggestion, serviceKey)
    }
  }

  // 3. Fill remaining slots with universal suggestions
  for (const suggestion of UNIVERSAL_SUGGESTIONS) {
    if (suggestions.length >= 3) break
    // Universal suggestions don't conflict with existing services
    if (!addedIds.has(suggestion.id)) {
      suggestions.push(suggestion)
      addedIds.add(suggestion.id)
    }
  }

  return suggestions.slice(0, 3)
}

/**
 * Generate fallback suggestions when no prompt analysis is available.
 * Uses universal suggestions only.
 *
 * @returns Array of 3 universal suggestions
 */
export function generateFallbackSuggestions(): QuickSuggestion[] {
  return UNIVERSAL_SUGGESTIONS.slice(0, 3)
}

/**
 * Check if a suggestion is a quick suggestion (vs AI recommendation).
 * Quick suggestions have IDs starting with 'qs-'.
 */
export function isQuickSuggestion(item: { id: string | number }): boolean {
  const id = String(item.id)
  return id.startsWith('qs-')
}
