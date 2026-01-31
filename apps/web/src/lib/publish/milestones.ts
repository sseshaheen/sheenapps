/**
 * Publish Milestone Tracking
 * Server-truth with localStorage fallback
 *
 * Best practice: store first_published_at on user/project in DB
 * and return it with session payload. This file provides the
 * client-side layer that works with both approaches.
 *
 * See: WORKSPACE_SIMPLIFICATION_PLAN.md Phase 4 - Publish Success Flow
 */

const STORAGE_PREFIX = 'sheenapps:publish'

/**
 * Get localStorage key for user's first publish flag
 */
function getFirstPublishKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}:hasPublished`
}

/**
 * Check if this is the user's first publish (localStorage fallback)
 * Prefer server-truth (firstPublishedAt from API) when available
 */
export function isFirstPublishLocal(userId: string): boolean {
  if (typeof window === 'undefined') return false
  if (!userId) return false
  return !localStorage.getItem(getFirstPublishKey(userId))
}

/**
 * Mark user as having published (localStorage)
 * Call this after successful first publish
 */
export function markPublishedLocal(userId: string): void {
  if (typeof window === 'undefined') return
  if (!userId) return
  localStorage.setItem(getFirstPublishKey(userId), new Date().toISOString())
}

/**
 * Determine if this is a first publish using server-truth or localStorage fallback
 *
 * @param serverFirstPublishedAt - from API response (null = never published)
 * @param userId - for localStorage fallback
 */
export function isFirstPublish(
  serverFirstPublishedAt: string | null | undefined,
  userId?: string
): boolean {
  // Server-truth takes precedence
  if (serverFirstPublishedAt !== undefined) {
    return serverFirstPublishedAt === null
  }

  // Fallback to localStorage
  if (userId) {
    return isFirstPublishLocal(userId)
  }

  return false
}

/**
 * Check if this is a milestone publish (10th, 50th, 100th version)
 */
export function isMilestoneVersion(versionNumber: number): boolean {
  const milestones = [10, 50, 100, 500, 1000]
  return milestones.includes(versionNumber)
}

/**
 * Get milestone message for a version number
 */
export function getMilestoneMessage(
  versionNumber: number,
  locale: string
): string | null {
  if (!isMilestoneVersion(versionNumber)) return null

  const messages: Record<number, Record<string, string>> = {
    10: {
      ar: 'مبروك! نشرت 10 نسخ - هذا تقدم حقيقي!',
      en: 'Amazing! 10 versions published - real iteration!',
      fr: 'Incroyable! 10 versions publiées - vraie itération!',
      es: '¡Increíble! 10 versiones publicadas - verdadera iteración!',
      de: 'Fantastisch! 10 Versionen veröffentlicht - echte Iteration!'
    },
    50: {
      ar: '50 نسخة! أنت محترف حقيقي الآن.',
      en: '50 versions! You\'re a true pro now.',
      fr: '50 versions! Vous êtes un vrai pro maintenant.',
      es: '¡50 versiones! Eres un verdadero profesional.',
      de: '50 Versionen! Du bist jetzt ein echter Profi.'
    },
    100: {
      ar: '100 نسخة! إنجاز لا يصدق.',
      en: '100 versions! Incredible achievement.',
      fr: '100 versions! Réalisation incroyable.',
      es: '¡100 versiones! Logro increíble.',
      de: '100 Versionen! Unglaubliche Leistung.'
    },
    500: {
      ar: '500 نسخة! أنت أسطورة.',
      en: '500 versions! You\'re a legend.',
      fr: '500 versions! Vous êtes une légende.',
      es: '¡500 versiones! Eres una leyenda.',
      de: '500 Versionen! Du bist eine Legende.'
    },
    1000: {
      ar: '1000 نسخة! لا كلمات تكفي.',
      en: '1000 versions! No words.',
      fr: '1000 versions! Pas de mots.',
      es: '¡1000 versiones! Sin palabras.',
      de: '1000 Versionen! Keine Worte.'
    }
  }

  const langKey = locale.startsWith('ar')
    ? 'ar'
    : locale.startsWith('fr')
      ? 'fr'
      : locale.startsWith('es')
        ? 'es'
        : locale.startsWith('de')
          ? 'de'
          : 'en'

  return messages[versionNumber]?.[langKey] ?? null
}
