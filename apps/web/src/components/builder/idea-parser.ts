export interface BusinessIntelligence {
  // Core business understanding
  type: 'saas' | 'ecommerce' | 'service' | 'portfolio' | 'marketplace' | 'food' | 'health' | 'education' | 'fintech'
  industry: string
  subCategory: string
  target: 'b2b' | 'b2c' | 'both'
  scale: 'local' | 'national' | 'global'
  
  // Extracted details
  businessName?: string
  products: string[]
  services: string[]
  features: string[]
  keywords: string[]
  location?: string
  
  // Personality & tone
  tone: 'professional' | 'casual' | 'luxury' | 'friendly' | 'technical' | 'creative'
  vibe: 'startup' | 'enterprise' | 'boutique' | 'community' | 'innovative'
  
  // Confidence scoring
  confidence: number // 0-1
  complexity: 'simple' | 'moderate' | 'complex'
}

interface IndustryPattern {
  keywords: string[]
  type: BusinessIntelligence['type']
  industry: string
  subCategory: string
  commonFeatures: string[]
  tone: BusinessIntelligence['tone']
  vibe: BusinessIntelligence['vibe']
}

// Comprehensive industry patterns for intelligent parsing
const industryPatterns: IndustryPattern[] = [
  // Food & Beverage
  {
    keywords: ['restaurant', 'food', 'coffee', 'cafe', 'delivery', 'kitchen', 'menu', 'recipe', 'chef', 'dining', 'bakery', 'catering'],
    type: 'food',
    industry: 'Food & Beverage',
    subCategory: 'Restaurant',
    commonFeatures: ['online ordering', 'delivery tracking', 'menu management', 'reservations', 'loyalty program'],
    tone: 'friendly',
    vibe: 'community'
  },
  {
    keywords: ['jewelry', 'handmade', 'crafts', 'art', 'boutique', 'fashion', 'clothing', 'accessories', 'design'],
    type: 'ecommerce',
    industry: 'Fashion & Accessories',
    subCategory: 'Handmade',
    commonFeatures: ['product catalog', 'custom orders', 'gallery', 'shipping', 'reviews'],
    tone: 'creative',
    vibe: 'boutique'
  },
  // SaaS & Technology
  {
    keywords: ['saas', 'software', 'platform', 'dashboard', 'analytics', 'automation', 'workflow', 'productivity', 'tool', 'app'],
    type: 'saas',
    industry: 'Technology',
    subCategory: 'Productivity',
    commonFeatures: ['user authentication', 'dashboard', 'analytics', 'integrations', 'API access'],
    tone: 'professional',
    vibe: 'startup'
  },
  {
    keywords: ['project management', 'team', 'collaboration', 'tasks', 'planning', 'organization'],
    type: 'saas',
    industry: 'Technology',
    subCategory: 'Project Management',
    commonFeatures: ['task management', 'team collaboration', 'time tracking', 'reporting', 'notifications'],
    tone: 'professional',
    vibe: 'enterprise'
  },
  // Services
  {
    keywords: ['consulting', 'advisor', 'strategy', 'business', 'expert', 'professional services'],
    type: 'service',
    industry: 'Professional Services',
    subCategory: 'Consulting',
    commonFeatures: ['booking calendar', 'consultation forms', 'case studies', 'testimonials', 'expertise areas'],
    tone: 'professional',
    vibe: 'enterprise'
  },
  {
    keywords: ['salon', 'spa', 'beauty', 'hair', 'massage', 'wellness', 'appointment', 'booking'],
    type: 'service',
    industry: 'Health & Beauty',
    subCategory: 'Salon & Spa',
    commonFeatures: ['appointment booking', 'service menu', 'staff profiles', 'gallery', 'loyalty program'],
    tone: 'friendly',
    vibe: 'boutique'
  },
  // Health & Fitness
  {
    keywords: ['fitness', 'gym', 'personal trainer', 'workout', 'health', 'wellness', 'nutrition'],
    type: 'service',
    industry: 'Health & Fitness',
    subCategory: 'Fitness',
    commonFeatures: ['class scheduling', 'membership management', 'trainer profiles', 'workout plans', 'progress tracking'],
    tone: 'friendly',
    vibe: 'community'
  },
  // E-commerce variations
  {
    keywords: ['online store', 'shop', 'sell', 'products', 'inventory', 'retail', 'marketplace'],
    type: 'ecommerce',
    industry: 'Retail',
    subCategory: 'General Store',
    commonFeatures: ['product catalog', 'shopping cart', 'payment processing', 'inventory management', 'order tracking'],
    tone: 'friendly',
    vibe: 'startup'
  },
  // Creative & Portfolio
  {
    keywords: ['portfolio', 'design', 'photography', 'creative', 'artist', 'freelance', 'agency'],
    type: 'portfolio',
    industry: 'Creative Services',
    subCategory: 'Design',
    commonFeatures: ['portfolio gallery', 'project showcase', 'contact forms', 'testimonials', 'about story'],
    tone: 'creative',
    vibe: 'boutique'
  }
]

// Business name patterns and generators
const businessNamePatterns = {
  'Food & Beverage': {
    prefixes: ['The', 'Casa', 'Cafe', 'Bistro', 'Kitchen', 'Fresh'],
    suffixes: ['Kitchen', 'Cafe', 'Bistro', 'Table', 'House', 'Co.', 'Eatery'],
    styles: ['cozy', 'fresh', 'artisan', 'local', 'modern']
  },
  'Fashion & Accessories': {
    prefixes: ['Bella', 'Luna', 'Golden', 'Silk', 'Pure', 'Luxe'],
    suffixes: ['Studio', 'Boutique', 'Collection', 'Atelier', 'House', 'Co.'],
    styles: ['elegant', 'handcrafted', 'modern', 'vintage', 'luxury']
  },
  'Technology': {
    prefixes: ['Smart', 'Quick', 'Pro', 'Flow', 'Sync', 'Cloud'],
    suffixes: ['Hub', 'Flow', 'Sync', 'Pro', 'Labs', 'Works', 'Tech'],
    styles: ['efficient', 'powerful', 'intelligent', 'seamless', 'innovative']
  }
}

export class IdeaParser {
  private idea: string
  private intelligence: Partial<BusinessIntelligence> = {}

  constructor(idea: string) {
    this.idea = idea.toLowerCase()
    this.intelligence = {
      confidence: 0,
      products: [],
      services: [],
      features: [],
      keywords: []
    }
  }

  // Main parsing function with instant feedback
  parse(): BusinessIntelligence {
    this.extractKeywords()
    this.identifyBusinessType()
    this.extractBusinessName()
    this.identifyScale()
    this.extractProducts()
    this.suggestFeatures()
    this.determineTone()
    this.calculateConfidence()

    return this.intelligence as BusinessIntelligence
  }

  private extractKeywords(): void {
    const words = this.idea.split(/\s+/)
    const meaningfulWords = words.filter(word => 
      word.length > 3 && 
      !['want', 'need', 'like', 'would', 'could', 'should', 'that', 'this', 'with', 'from'].includes(word)
    )
    this.intelligence.keywords = meaningfulWords
  }

  private identifyBusinessType(): void {
    let bestMatch: IndustryPattern | null = null
    let highestScore = 0

    for (const pattern of industryPatterns) {
      const score = this.calculatePatternScore(pattern)
      if (score > highestScore) {
        highestScore = score
        bestMatch = pattern
      }
    }

    if (bestMatch && highestScore > 0.3) {
      this.intelligence.type = bestMatch.type
      this.intelligence.industry = bestMatch.industry
      this.intelligence.subCategory = bestMatch.subCategory
      this.intelligence.tone = bestMatch.tone
      this.intelligence.vibe = bestMatch.vibe
      this.intelligence.features = [...(this.intelligence.features || []), ...bestMatch.commonFeatures]
    } else {
      // Default fallback
      this.intelligence.type = 'service'
      this.intelligence.industry = 'General Business'
      this.intelligence.tone = 'professional'
      this.intelligence.vibe = 'startup'
    }
  }

  private calculatePatternScore(pattern: IndustryPattern): number {
    const ideaWords = this.idea.split(/\s+/)
    let matches = 0
    
    for (const keyword of pattern.keywords) {
      if (ideaWords.some(word => word.includes(keyword) || keyword.includes(word))) {
        matches++
      }
    }
    
    return matches / pattern.keywords.length
  }

  private extractBusinessName(): void {
    // Look for explicit business name mentions
    const namePatterns = [
      /(?:called|named|brand|business)\s+["\']?([A-Z][a-zA-Z\s]+)["\']?/i,
      /["\']([A-Z][a-zA-Z\s]+)["\'](?:\s+(?:business|company|store|shop))?/i
    ]

    for (const pattern of namePatterns) {
      const match = this.idea.match(pattern)
      if (match) {
        this.intelligence.businessName = match[1].trim()
        return
      }
    }

    // Generate intelligent suggestions
    this.generateBusinessName()
  }

  private generateBusinessName(): void {
    const industry = this.intelligence.industry || 'General Business'
    const patterns = businessNamePatterns[industry as keyof typeof businessNamePatterns]
    
    if (patterns && this.intelligence.keywords) {
      const keyword = this.intelligence.keywords[0]
      const prefix = patterns.prefixes[Math.floor(Math.random() * patterns.prefixes.length)]
      const suffix = patterns.suffixes[Math.floor(Math.random() * patterns.suffixes.length)]
      
      // Create contextual business name
      const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)
      this.intelligence.businessName = `${prefix} ${capitalize(keyword)} ${suffix}`
    }
  }

  private identifyScale(): void {
    if (this.idea.includes('local') || this.idea.includes('neighborhood') || this.idea.includes('city')) {
      this.intelligence.scale = 'local'
    } else if (this.idea.includes('national') || this.idea.includes('country')) {
      this.intelligence.scale = 'national'
    } else if (this.idea.includes('global') || this.idea.includes('worldwide') || this.idea.includes('international')) {
      this.intelligence.scale = 'global'
    } else {
      // Infer from business type
      this.intelligence.scale = this.intelligence.type === 'saas' ? 'global' : 'local'
    }
  }

  private extractProducts(): void {
    const productKeywords = ['sell', 'product', 'item', 'goods', 'merchandise']
    const serviceKeywords = ['service', 'provide', 'offer', 'help', 'assist']
    
    // Extract mentioned products/services
    if (productKeywords.some(kw => this.idea.includes(kw))) {
      this.intelligence.products = this.extractEntities()
    }
    
    if (serviceKeywords.some(kw => this.idea.includes(kw))) {
      this.intelligence.services = this.extractEntities()
    }
  }

  private extractEntities(): string[] {
    // Simple entity extraction - can be enhanced with NLP
    const words = this.intelligence.keywords || []
    return words.filter(word => word.length > 4).slice(0, 3)
  }

  private suggestFeatures(): void {
    const typeFeatures: Record<string, string[]> = {
      saas: ['user authentication', 'dashboard', 'analytics', 'API access', 'integrations'],
      ecommerce: ['shopping cart', 'payment processing', 'inventory management', 'product reviews'],
      service: ['appointment booking', 'contact forms', 'testimonials', 'service catalog'],
      food: ['online ordering', 'delivery tracking', 'menu management', 'reservations'],
      portfolio: ['project gallery', 'contact forms', 'testimonials', 'about section']
    }

    const suggested = typeFeatures[this.intelligence.type || 'service'] || []
    this.intelligence.features = [...new Set([...(this.intelligence.features || []), ...suggested])]
  }

  private determineTone(): void {
    if (this.idea.includes('professional') || this.idea.includes('corporate') || this.idea.includes('enterprise')) {
      this.intelligence.tone = 'professional'
    } else if (this.idea.includes('luxury') || this.idea.includes('premium') || this.idea.includes('high-end')) {
      this.intelligence.tone = 'luxury'
    } else if (this.idea.includes('friendly') || this.idea.includes('casual') || this.idea.includes('fun')) {
      this.intelligence.tone = 'casual'
    }
    // Otherwise keep the tone from pattern matching
  }

  private calculateConfidence(): void {
    let score = 0
    
    // Business type identification confidence
    if (this.intelligence.type) score += 0.3
    
    // Industry specificity
    if (this.intelligence.industry && this.intelligence.industry !== 'General Business') score += 0.2
    
    // Found business name
    if (this.intelligence.businessName) score += 0.2
    
    // Extracted meaningful features
    if (this.intelligence.features && this.intelligence.features.length > 0) score += 0.1
    
    // Keywords quality
    if (this.intelligence.keywords && this.intelligence.keywords.length > 2) score += 0.1
    
    // Products/services identified
    if ((this.intelligence.products?.length || 0) + (this.intelligence.services?.length || 0) > 0) score += 0.1
    
    this.intelligence.confidence = Math.min(score, 1)
    
    // Determine complexity based on confidence and features
    if (this.intelligence.confidence > 0.7) {
      this.intelligence.complexity = 'complex'
    } else if (this.intelligence.confidence > 0.4) {
      this.intelligence.complexity = 'moderate'
    } else {
      this.intelligence.complexity = 'simple'
    }
  }

  // Generate contextual suggestions for user
  generateSuggestions(): string[] {
    const suggestions: string[] = []
    
    if (this.intelligence.type === 'ecommerce') {
      suggestions.push('Add shopping cart functionality')
      suggestions.push('Include customer reviews')
      suggestions.push('Set up payment processing')
    }
    
    if (this.intelligence.type === 'service') {
      suggestions.push('Add appointment booking')
      suggestions.push('Include testimonials section')
      suggestions.push('Create service packages')
    }
    
    if (this.intelligence.scale === 'local') {
      suggestions.push('Add location and hours')
      suggestions.push('Include contact information')
    }
    
    return suggestions
  }
}

// Export convenience function
export function parseBusinessIdea(idea: string): BusinessIntelligence {
  const parser = new IdeaParser(idea)
  return parser.parse()
}