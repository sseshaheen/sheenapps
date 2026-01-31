/**
 * Hybrid Prompt Analyzer
 *
 * Uses keyword-based analysis for English, LLM-based for other languages.
 * Optimizes cost while ensuring Arabic prompts are properly analyzed.
 *
 * Strategy:
 * 1. Non-English locale → Use LLM (keyword matching won't work)
 * 2. Arabic detected in prompt → Use LLM (fallback when locale missing)
 * 3. English with high-confidence keyword match → Use free keyword analyzer
 * 4. English with low-confidence keyword match → Fall back to LLM
 *
 * @see /ARABIC_PROMPT_HANDLING_PLAN.md for implementation details
 */

import { PromptAnalyzer, BusinessPromptAnalysis, promptAnalyzer } from './prompt-analyzer';
import { LLMPromptClassifier, llmPromptClassifier } from './llm-prompt-classifier';
import { detectArabicPrompt, normalizeLocale } from './locale-aware-prompts';
import { logger } from '@/utils/logger';

export class HybridPromptAnalyzer {
  private keywordAnalyzer: PromptAnalyzer;
  private llmClassifier: LLMPromptClassifier;

  constructor(
    keywordAnalyzerInstance?: PromptAnalyzer,
    llmClassifierInstance?: LLMPromptClassifier
  ) {
    this.keywordAnalyzer = keywordAnalyzerInstance || promptAnalyzer;
    this.llmClassifier = llmClassifierInstance || llmPromptClassifier;
  }

  /**
   * Analyze a business prompt using the most appropriate method.
   *
   * @param userPrompt - The user's business idea prompt
   * @param locale - Optional locale from request header (e.g., 'ar', 'ar-eg', 'en')
   * @returns BusinessPromptAnalysis with structured business information
   */
  async analyzePrompt(
    userPrompt: string,
    locale?: string
  ): Promise<BusinessPromptAnalysis> {
    const baseLocale = locale ? normalizeLocale(locale) : 'en';

    // Strategy 1: Use LLM for non-English locales - keyword matching won't work
    if (baseLocale !== 'en') {
      logger.info(`[HybridAnalyzer] Using LLM classifier for ${baseLocale} prompt`);
      return this.llmClassifier.classifyPrompt(userPrompt, locale);
    }

    // Strategy 2: Use LLM if auto-detected as Arabic (fallback when locale missing)
    if (detectArabicPrompt(userPrompt)) {
      logger.info('[HybridAnalyzer] Auto-detected Arabic, using LLM classifier');
      return this.llmClassifier.classifyPrompt(userPrompt, 'ar');
    }

    // Strategy 3: For English, try keyword-based first (free)
    const keywordResult = await this.keywordAnalyzer.analyzePrompt(userPrompt);

    // Strategy 4: If keyword analysis has low confidence, use LLM as fallback
    if (keywordResult.confidence < 50 || keywordResult.businessType === 'general_business') {
      logger.info('[HybridAnalyzer] Low confidence from keyword analyzer, falling back to LLM');
      const llmResult = await this.llmClassifier.classifyPrompt(userPrompt, locale);

      // Merge: prefer LLM result but keep any additional keyword-extracted info
      return this.mergeResults(keywordResult, llmResult);
    }

    logger.info('[HybridAnalyzer] Using keyword-based analysis (high confidence)');
    return keywordResult;
  }

  /**
   * Merge keyword and LLM results, preferring LLM for core fields
   * but keeping keyword-extracted details that LLM might miss.
   */
  private mergeResults(
    keywordResult: BusinessPromptAnalysis,
    llmResult: BusinessPromptAnalysis
  ): BusinessPromptAnalysis {
    return {
      // Core fields from LLM (better for non-obvious classifications)
      businessType: llmResult.businessType,
      businessName: keywordResult.businessName || llmResult.businessName,
      industry: llmResult.industry,

      // Merge arrays - combine unique values
      services: this.mergeArrays(keywordResult.services, llmResult.services),
      products: this.mergeArrays(keywordResult.products, llmResult.products),
      features: this.mergeArrays(keywordResult.features, llmResult.features),
      targetAudience: this.mergeArrays(keywordResult.targetAudience, llmResult.targetAudience),

      // Demographics from keyword (more detailed extraction)
      demographics: Object.keys(keywordResult.demographics).length > 0
        ? keywordResult.demographics
        : llmResult.demographics,

      // Personality from LLM (better understanding)
      personality: llmResult.personality.length > 0
        ? llmResult.personality
        : keywordResult.personality,
      tone: llmResult.tone || keywordResult.tone,

      // Technical requirements from keyword analyzer (specific pattern matching)
      functionalRequirements: this.mergeArrays(
        keywordResult.functionalRequirements,
        llmResult.functionalRequirements
      ),
      platforms: this.mergeArrays(keywordResult.platforms, llmResult.platforms),
      integrations: this.mergeArrays(keywordResult.integrations, llmResult.integrations),

      // Location from either
      location: llmResult.location || keywordResult.location,

      // Quality metrics - use LLM's confidence for merged result
      analysisQuality: llmResult.analysisQuality,
      confidence: llmResult.confidence,
      missingInformation: llmResult.missingInformation,

      // Insights from keyword analyzer (specific business type recommendations)
      suggestedQuestions: keywordResult.suggestedQuestions,
      recommendedFeatures: keywordResult.recommendedFeatures
    };
  }

  /**
   * Merge two string arrays, removing duplicates
   */
  private mergeArrays(arr1: string[], arr2: string[]): string[] {
    return [...new Set([...arr1, ...arr2])];
  }

  /**
   * Force use of LLM classifier (useful for testing or specific scenarios)
   */
  async analyzeWithLLM(
    userPrompt: string,
    locale?: string
  ): Promise<BusinessPromptAnalysis> {
    return this.llmClassifier.classifyPrompt(userPrompt, locale);
  }

  /**
   * Force use of keyword analyzer (useful for testing or cost optimization)
   */
  async analyzeWithKeywords(userPrompt: string): Promise<BusinessPromptAnalysis> {
    return this.keywordAnalyzer.analyzePrompt(userPrompt);
  }

  /**
   * Get statistics about which analyzer is being used
   */
  getStats(): {
    llmCacheStats: { size: number; maxSize: number; ttlMs: number };
  } {
    return {
      llmCacheStats: this.llmClassifier.getCacheStats()
    };
  }
}

// Export singleton instance for convenience
export const hybridPromptAnalyzer = new HybridPromptAnalyzer();
