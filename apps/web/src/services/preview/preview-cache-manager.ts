import { logger } from '@/utils/logger';

// Preview Cache Manager - Manages pre-generated preview content
export class PreviewCacheManager {
  private static instance: PreviewCacheManager
  private cache: Map<string, {
    generated: boolean
    content: any
    timestamp: number
  }> = new Map()

  static getInstance(): PreviewCacheManager {
    if (!PreviewCacheManager.instance) {
      PreviewCacheManager.instance = new PreviewCacheManager()
    }
    return PreviewCacheManager.instance
  }

  // Mark a choice as generated with its content
  setGenerated(choiceId: string, content: any): void {
    this.cache.set(choiceId, {
      generated: true,
      content,
      timestamp: Date.now()
    })
    logger.info('📦 Cached generated preview for:', choiceId);
  }

  // Check if a choice is generated
  isGenerated(choiceId: string): boolean {
    return this.cache.get(choiceId)?.generated || false
  }

  // Get cached content for a choice
  getCachedContent(choiceId: string): any | null {
    return this.cache.get(choiceId)?.content || null
  }

  // Clear cache for a specific question
  clearForQuestion(questionId: string): void {
    // In a real implementation, we'd track which choices belong to which questions
    logger.info('🗑️ Clearing cache for question:', questionId);
  }

  // Get all generated choice IDs
  getGeneratedChoiceIds(): Set<string> {
    const ids = new Set<string>()
    this.cache.forEach((value, key) => {
      if (value.generated) {
        ids.add(key)
      }
    })
    return ids
  }
}