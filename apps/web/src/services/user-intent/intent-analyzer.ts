import { logger } from '@/utils/logger';

// User Intent Analyzer - Converts natural language to AI prompts
// Processes user comments like "make it more modern" into specific AI instructions

export interface AnalyzedIntent {
  action: 'generate' | 'modify' | 'enhance' | 'replace'
  target: string                      // 'colors', 'layout', 'content', 'style', 'components'
  intensity: 'subtle' | 'moderate' | 'strong'
  style: string[]                     // ['modern', 'professional', 'clean']
  specifics: {
    colors?: string[]
    fonts?: string[]
    layout?: string
    content?: string
    features?: string[]
  }
  confidence: number                  // 0-100
  suggestions: string[]              // Clarifying questions if intent unclear
}

export class IntentAnalyzer {
  private patterns: Map<string, any> = new Map()
  private styleKeywords: Map<string, string[]> = new Map()

  constructor() {
    this.initializePatterns()
    this.initializeStyleKeywords()
  }

  async analyzeIntent(userComment: string, section: string = 'general'): Promise<AnalyzedIntent> {
    logger.info(`🔍 Analyzing user intent: "${userComment}" for section: ${section}`);

    const comment = userComment.toLowerCase().trim()
    
    // Extract action
    const action = this.extractAction(comment)
    
    // Extract target
    const target = this.extractTarget(comment, section)
    
    // Extract intensity
    const intensity = this.extractIntensity(comment)
    
    // Extract style keywords
    const style = this.extractStyleKeywords(comment)
    
    // Extract specifics
    const specifics = this.extractSpecifics(comment)
    
    // Calculate confidence
    const confidence = this.calculateConfidence(comment, action, target, style)
    
    // Generate suggestions if confidence is low
    const suggestions = confidence < 70 ? this.generateSuggestions(comment, section) : []

    const intent: AnalyzedIntent = {
      action,
      target,
      intensity,
      style,
      specifics,
      confidence,
      suggestions
    }

    logger.info('🎯 Intent analysis result:', intent);
    
    return intent
  }

  private extractAction(comment: string): 'generate' | 'modify' | 'enhance' | 'replace' {
    // Action patterns
    if (this.matchesPattern(comment, ['make', 'change', 'update', 'modify', 'adjust'])) {
      return 'modify'
    }
    
    if (this.matchesPattern(comment, ['add', 'include', 'enhance', 'improve', 'upgrade'])) {
      return 'enhance'
    }
    
    if (this.matchesPattern(comment, ['replace', 'swap', 'substitute', 'switch'])) {
      return 'replace'
    }
    
    if (this.matchesPattern(comment, ['create', 'generate', 'build', 'design'])) {
      return 'generate'
    }
    
    // Default to modify for most user comments
    return 'modify'
  }

  private extractTarget(comment: string, section: string): string {
    // Color-related
    if (this.matchesPattern(comment, ['color', 'colors', 'scheme', 'palette', 'background'])) {
      return 'colors'
    }
    
    // Layout-related
    if (this.matchesPattern(comment, ['layout', 'structure', 'arrangement', 'organization', 'spacing'])) {
      return 'layout'
    }
    
    // Typography-related
    if (this.matchesPattern(comment, ['font', 'text', 'typography', 'heading', 'title'])) {
      return 'typography'
    }
    
    // Content-related
    if (this.matchesPattern(comment, ['copy', 'content', 'text', 'wording', 'message'])) {
      return 'content'
    }
    
    // Component-related
    if (this.matchesPattern(comment, ['button', 'menu', 'navigation', 'header', 'footer'])) {
      return 'components'
    }
    
    // Overall style
    if (this.matchesPattern(comment, ['style', 'look', 'feel', 'appearance', 'design'])) {
      return 'style'
    }
    
    // Default based on section
    return this.getDefaultTargetForSection(section)
  }

  private extractIntensity(comment: string): 'subtle' | 'moderate' | 'strong' {
    // Strong intensity indicators
    if (this.matchesPattern(comment, ['completely', 'totally', 'dramatically', 'major', 'significant', 'huge'])) {
      return 'strong'
    }
    
    // Subtle intensity indicators
    if (this.matchesPattern(comment, ['slightly', 'a bit', 'little', 'minor', 'subtle', 'gentle'])) {
      return 'subtle'
    }
    
    // More/very indicates moderate to strong
    if (this.matchesPattern(comment, ['more', 'very', 'much', 'way', 'really'])) {
      return 'moderate'
    }
    
    return 'moderate'
  }

  private extractStyleKeywords(comment: string): string[] {
    const styles: string[] = []
    
    // Check each style category
    for (const [category, keywords] of this.styleKeywords) {
      for (const keyword of keywords) {
        if (comment.includes(keyword)) {
          styles.push(category)
          break
        }
      }
    }
    
    return [...new Set(styles)] // Remove duplicates
  }

  private extractSpecifics(comment: string): any {
    const specifics: any = {}
    
    // Color specifics
    const colorMatches = comment.match(/\b(blue|red|green|yellow|purple|orange|pink|black|white|gray|gold|silver)\b/g)
    if (colorMatches) {
      specifics.colors = colorMatches
    }
    
    // Font specifics
    const fontMatches = comment.match(/\b(serif|sans-serif|modern|classic|bold|light|thin)\b/g)
    if (fontMatches) {
      specifics.fonts = fontMatches
    }
    
    // Layout specifics
    if (this.matchesPattern(comment, ['centered', 'left', 'right'])) {
      specifics.layout = 'alignment'
    }
    
    if (this.matchesPattern(comment, ['wider', 'narrower', 'bigger', 'smaller'])) {
      specifics.layout = 'sizing'
    }
    
    // Feature specifics
    const featureMatches = comment.match(/\b(booking|contact|gallery|testimonials|pricing|menu)\b/g)
    if (featureMatches) {
      specifics.features = featureMatches
    }
    
    return specifics
  }

  private calculateConfidence(comment: string, action: string, target: string, style: string[]): number {
    let confidence = 50 // Base confidence
    
    // Increase confidence for clear action words
    if (this.matchesPattern(comment, ['make', 'change', 'add', 'create'])) {
      confidence += 20
    }
    
    // Increase confidence for specific targets
    if (target !== 'style') {
      confidence += 15
    }
    
    // Increase confidence for recognized styles
    confidence += Math.min(style.length * 10, 30)
    
    // Decrease confidence for very short or vague comments
    if (comment.length < 10) {
      confidence -= 20
    }
    
    if (this.matchesPattern(comment, ['better', 'nicer', 'good', 'improve'])) {
      confidence -= 10 // Too vague
    }
    
    return Math.max(0, Math.min(100, confidence))
  }

  private generateSuggestions(comment: string, section: string): string[] {
    const suggestions = []
    
    if (comment.length < 10) {
      suggestions.push("Could you be more specific about what you'd like to change?")
    }
    
    if (this.matchesPattern(comment, ['better', 'nicer', 'improve'])) {
      suggestions.push("What specific aspect would you like to improve? (colors, layout, text, etc.)")
    }
    
    if (!this.matchesPattern(comment, ['color', 'font', 'layout', 'text'])) {
      suggestions.push(`For the ${section} section, you could specify: colors, fonts, layout, or content`)
    }
    
    return suggestions
  }

  private matchesPattern(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => text.includes(pattern))
  }

  private getDefaultTargetForSection(section: string): string {
    const sectionTargets: Record<string, string> = {
      'hero': 'content',
      'header': 'components',
      'features': 'layout',
      'testimonials': 'content',
      'pricing': 'layout',
      'contact': 'content',
      'footer': 'components'
    }
    
    return sectionTargets[section] || 'style'
  }

  private initializePatterns() {
    // Initialize common patterns for better intent recognition
    this.patterns.set('actions', {
      modify: ['make', 'change', 'update', 'modify', 'adjust', 'turn', 'set'],
      enhance: ['add', 'include', 'enhance', 'improve', 'upgrade', 'boost'],
      replace: ['replace', 'swap', 'substitute', 'switch', 'change to'],
      generate: ['create', 'generate', 'build', 'design', 'make new']
    })
  }

  private initializeStyleKeywords() {
    this.styleKeywords.set('modern', ['modern', 'contemporary', 'current', 'updated', 'fresh', 'new'])
    this.styleKeywords.set('professional', ['professional', 'business', 'corporate', 'formal', 'serious'])
    this.styleKeywords.set('luxury', ['luxury', 'premium', 'elegant', 'sophisticated', 'high-end', 'upscale'])
    this.styleKeywords.set('playful', ['playful', 'fun', 'friendly', 'casual', 'relaxed', 'cheerful'])
    this.styleKeywords.set('minimal', ['minimal', 'clean', 'simple', 'minimalist', 'uncluttered'])
    this.styleKeywords.set('warm', ['warm', 'cozy', 'welcoming', 'friendly', 'inviting', 'comfortable'])
    this.styleKeywords.set('bold', ['bold', 'striking', 'dramatic', 'strong', 'powerful', 'impactful'])
    this.styleKeywords.set('creative', ['creative', 'artistic', 'unique', 'innovative', 'original'])
    this.styleKeywords.set('trustworthy', ['trustworthy', 'reliable', 'secure', 'credible', 'established'])
    this.styleKeywords.set('energetic', ['energetic', 'dynamic', 'vibrant', 'lively', 'active'])
  }

  // ===== PUBLIC UTILITY METHODS =====

  getSupportedStyles(): string[] {
    return Array.from(this.styleKeywords.keys())
  }

  getStyleKeywords(style: string): string[] {
    return this.styleKeywords.get(style) || []
  }

  getConfidenceThreshold(): number {
    return 70 // Minimum confidence for automatic processing
  }

  // For testing and debugging
  testIntent(comment: string, section: string = 'general'): void {
    this.analyzeIntent(comment, section).then(result => {
      console.table({
        'User Comment': comment,
        'Action': result.action,
        'Target': result.target,
        'Intensity': result.intensity,
        'Styles': result.style.join(', '),
        'Confidence': `${result.confidence}%`,
        'Suggestions': result.suggestions.length
      })
    })
  }
}

// Export singleton instance
export const intentAnalyzer = new IntentAnalyzer()

// Utility function for quick intent analysis
export async function analyzeUserIntent(
  comment: string, 
  section: string = 'general'
): Promise<AnalyzedIntent> {
  return intentAnalyzer.analyzeIntent(comment, section)
}