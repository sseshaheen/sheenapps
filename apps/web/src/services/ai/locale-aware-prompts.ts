/**
 * Locale-Aware Prompt Builder
 *
 * Injects language directives into system prompts based on user locale.
 * This ensures Claude responds in the user's language while keeping
 * format constraints in English (since they're instructions for Claude, not output).
 *
 * @see /ARABIC_PROMPT_HANDLING_PLAN.md for implementation details
 */

export type SupportedLocale = 'en' | 'ar' | 'fr' | 'es' | 'de';

const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  ar: 'Arabic',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
};

/**
 * Normalize locale to base language code.
 * ar-eg, ar-sa, ar-ae → ar
 * fr-ma, fr-fr → fr
 */
export function normalizeLocale(locale: string): SupportedLocale {
  const base = locale.toLowerCase().split('-')[0];
  const supported: SupportedLocale[] = ['en', 'ar', 'fr', 'es', 'de'];
  return supported.includes(base as SupportedLocale)
    ? (base as SupportedLocale)
    : 'en';
}

/**
 * Language directive to inject into system prompts.
 * Only injected for non-English locales.
 *
 * This directive tells Claude:
 * 1. What language to use for user-facing text
 * 2. What NOT to translate (technical terms, enum values)
 * 3. Output format requirements
 */
export function getLanguageDirective(locale: string): string {
  const baseLocale = normalizeLocale(locale);

  if (baseLocale === 'en') {
    return ''; // No directive needed for English
  }

  const languageName = LANGUAGE_NAMES[baseLocale] || "the user's";

  return `
LANGUAGE REQUIREMENTS:
- All user-facing text (names, descriptions, taglines, labels, etc.) MUST be in ${languageName}
- Do NOT mix English sentences into ${languageName} output fields
- Do NOT translate technical terms, code identifiers, URLs, or library names
- Enum values (like "saas", "ecommerce") remain in English, but their descriptions are in ${languageName}
- Return valid JSON only; ${languageName} text goes inside JSON string values
- Maintain professional tone appropriate for ${languageName}-speaking business audiences
`;
}

/**
 * Wraps user input with consistent delimiters.
 * Always uses XML-style tags to prevent JSON escaping issues and prompt injection.
 *
 * IMPORTANT: Keep all language policy rules in the SYSTEM prompt only.
 * This function should ONLY delimit content - no duplicate instructions.
 */
export function wrapUserPrompt(prompt: string): string {
  // Just delimit the content - all language rules live in system prompt
  return `<business_idea>
${prompt}
</business_idea>`;
}

/**
 * Detect if a prompt appears to be in Arabic.
 * Used ONLY as last-resort fallback when locale header is missing.
 * Prefer explicit locale from route → service chain.
 *
 * IMPORTANT: This can misfire on short prompts or mixed content.
 * Always pass locale explicitly when available.
 *
 * Arabic Unicode ranges:
 * - 0600-06FF: Arabic
 * - 0750-077F: Arabic Supplement
 * - FB50-FDFF: Arabic Presentation Forms-A
 * - FE70-FEFF: Arabic Presentation Forms-B
 */
export function detectArabicPrompt(text: string): boolean {
  // Must use 'g' flag to match ALL Arabic characters, not just the first
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const arabicChars = (text.match(arabicPattern) || []).length;
  const totalChars = text.replace(/\s/g, '').length;

  // If >30% of characters are Arabic, consider it an Arabic prompt
  return totalChars > 0 && (arabicChars / totalChars) > 0.3;
}

/**
 * Minimal Arabic text normalizer for cache key generation.
 * NOT for display - only for consistent hashing/matching.
 *
 * Normalizations:
 * - Alef variants (أ إ آ) → ا
 * - Alef Maqsura (ى) → Ya (ي)
 * - Remove Tatweel (ـ)
 * - Remove diacritics (tashkeel)
 */
export function normalizeArabicForCacheKey(text: string): string {
  return text
    // Normalize Alef variants (أ إ آ ا) → ا
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    // Normalize Alef Maqsura → Ya (ى → ي)
    .replace(/\u0649/g, '\u064A')
    // Remove Tatweel (ـ)
    .replace(/\u0640/g, '')
    // Remove diacritics (tashkeel)
    .replace(/[\u064B-\u065F]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Get the full language name for a locale.
 * Useful for logging and debugging.
 */
export function getLanguageName(locale: string): string {
  const baseLocale = normalizeLocale(locale);
  return LANGUAGE_NAMES[baseLocale] || 'English';
}
