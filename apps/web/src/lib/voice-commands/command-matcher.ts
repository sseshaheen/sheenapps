/**
 * Arabic Voice Command Matcher
 *
 * Provides fuzzy matching for Arabic voice commands with:
 * - Diacritics (tashkeel) removal
 * - Alef variant normalization
 * - Ta marbuta / Ha normalization
 * - Alef maqsura / Ya normalization
 * - Substring matching for longer transcripts
 */

import { VOICE_COMMANDS, VoiceAction, VoiceCommandDefinition } from './command-definitions'

export interface CommandMatch {
  /** The matched action */
  action: VoiceAction
  /** Confidence score (0-1) */
  confidence: number
  /** The phrase that was matched */
  matchedPhrase: string
  /** The original transcript */
  originalTranscript: string
  /** Command definition for additional context */
  definition: VoiceCommandDefinition
}

/**
 * Normalize Arabic text for comparison.
 *
 * Removes diacritics and normalizes letter variants:
 * - Removes tashkeel (harakat): فَتْحَة → فتحه
 * - Normalizes alef variants: أ إ آ → ا
 * - Normalizes ta marbuta: ة → ه
 * - Normalizes alef maqsura: ى → ي
 * - Removes tatweel (kashida): ـ
 * - Collapses whitespace
 */
export function normalizeArabic(text: string): string {
  return text
    // Remove diacritics (tashkeel): U+064B-U+065F
    .replace(/[\u064B-\u065F]/g, '')
    // Remove tatweel (kashida): U+0640
    .replace(/\u0640/g, '')
    // Normalize alef variants (أ إ آ ٱ) → ا
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize ta marbuta → ha
    .replace(/ة/g, 'ه')
    // Normalize alef maqsura → ya
    .replace(/ى/g, 'ي')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    // Trim
    .trim()
    // Lowercase for any Latin chars mixed in
    .toLowerCase()
}

/**
 * Calculate similarity between two normalized strings.
 * Uses a combination of exact match, contains, and Levenshtein distance.
 *
 * @returns Similarity score from 0 to 1
 */
function calculateSimilarity(normalized: string, target: string): number {
  // Exact match
  if (normalized === target) {
    return 1.0
  }

  // Check if transcript contains the target phrase
  if (normalized.includes(target)) {
    // Bonus for shorter remaining text (more focused command)
    const lengthRatio = target.length / normalized.length
    return 0.85 + (lengthRatio * 0.1) // 0.85 - 0.95
  }

  // Check if target is part of transcript (for short commands in longer speech)
  if (target.includes(normalized)) {
    return 0.75
  }

  // Check word overlap
  const normalizedWords = normalized.split(' ')
  const targetWords = target.split(' ')
  const commonWords = targetWords.filter(w => normalizedWords.includes(w))

  if (commonWords.length > 0) {
    const wordOverlapScore = commonWords.length / targetWords.length
    return 0.5 * wordOverlapScore
  }

  // Levenshtein distance for fuzzy matching (for short phrases only)
  if (normalized.length <= 20 && target.length <= 20) {
    const distance = levenshteinDistance(normalized, target)
    const maxLen = Math.max(normalized.length, target.length)
    const similarity = 1 - (distance / maxLen)

    // Only return if reasonably similar
    if (similarity > 0.6) {
      return similarity * 0.7 // Scale down slightly
    }
  }

  return 0
}

/**
 * Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Match a transcript against known voice commands.
 *
 * @param transcript - The transcribed text from voice input
 * @returns CommandMatch if a command is found with sufficient confidence, null otherwise
 */
export function matchCommand(transcript: string): CommandMatch | null {
  if (!transcript || transcript.trim().length === 0) {
    return null
  }

  const normalizedTranscript = normalizeArabic(transcript)

  let bestMatch: CommandMatch | null = null
  let bestScore = 0

  // Check all commands and their aliases
  for (const [primaryPhrase, definition] of Object.entries(VOICE_COMMANDS)) {
    const allPhrases = [primaryPhrase, ...definition.aliases]

    for (const phrase of allPhrases) {
      const normalizedPhrase = normalizeArabic(phrase)
      const similarity = calculateSimilarity(normalizedTranscript, normalizedPhrase)

      if (similarity > bestScore) {
        bestScore = similarity
        bestMatch = {
          action: definition.action,
          confidence: similarity,
          matchedPhrase: phrase,
          originalTranscript: transcript,
          definition
        }
      }
    }
  }

  // Apply minimum confidence threshold
  if (bestMatch) {
    const minConfidence = bestMatch.definition.minConfidence ?? 0.6

    if (bestMatch.confidence >= minConfidence) {
      return bestMatch
    }
  }

  return null
}

/**
 * Check if text contains any potential command indicators.
 * Useful for early filtering before full matching.
 */
export function mightBeCommand(transcript: string): boolean {
  const normalized = normalizeArabic(transcript)

  // Check if any command phrase might be present
  for (const [primaryPhrase, definition] of Object.entries(VOICE_COMMANDS)) {
    const allPhrases = [primaryPhrase, ...definition.aliases]

    for (const phrase of allPhrases) {
      const normalizedPhrase = normalizeArabic(phrase)

      // Check for word overlap
      const phraseWords = normalizedPhrase.split(' ')
      const transcriptWords = normalized.split(' ')

      for (const word of phraseWords) {
        if (transcriptWords.includes(word) && word.length > 2) {
          return true
        }
      }
    }
  }

  return false
}

/**
 * Get suggested commands for autocomplete/help.
 * Returns primary phrases grouped by category.
 */
export function getSuggestedCommands(): Array<{
  phrase: string
  action: VoiceAction
  category: VoiceCommandDefinition['category']
}> {
  return Object.entries(VOICE_COMMANDS).map(([phrase, def]) => ({
    phrase,
    action: def.action,
    category: def.category
  }))
}
