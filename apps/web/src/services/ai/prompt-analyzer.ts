import { logger } from '@/utils/logger';

// Prompt Analyzer - Extracts context and information from user's initial business idea
// Handles both brief prompts ("booking app for salon") and detailed prompts

export interface BusinessPromptAnalysis {
  // Core business information extracted
  businessType: string                    // 'salon', 'restaurant', 'ecommerce', etc.
  businessName?: string                   // Extracted business name if mentioned
  industry: string                        // 'beauty', 'food', 'retail', etc.
  
  // Services/products mentioned
  services: string[]                      // ['booking', 'appointments', 'haircuts']
  products: string[]                      // ['shampoo', 'styling tools']
  features: string[]                      // ['online booking', 'payment processing']
  
  // Target audience clues
  targetAudience: string[]               // ['professionals', 'families', 'luxury_seekers']
  demographics: {
    ageRange?: string                    // 'young_adults', 'families', 'seniors'
    income?: string                      // 'budget', 'mid_range', 'luxury'
    lifestyle?: string[]                 // ['busy_professionals', 'health_conscious']
  }
  
  // Brand personality indicators
  personality: string[]                   // ['professional', 'friendly', 'luxury', 'modern']
  tone: string                           // 'professional', 'casual', 'luxury', 'playful'
  
  // Technical requirements
  functionalRequirements: string[]        // ['booking_system', 'payment_processing', 'inventory']
  platforms: string[]                     // ['web', 'mobile', 'tablet']
  integrations: string[]                  // ['google_calendar', 'stripe', 'mailchimp']
  
  // Geographic/location info
  location?: {
    region?: string                      // 'local', 'national', 'international'
    specific?: string                    // 'downtown', 'suburb', 'online_only'
  }
  
  // Quality and confidence metrics
  analysisQuality: 'basic' | 'good' | 'detailed'
  confidence: number                      // 0-100
  missingInformation: string[]            // What we need to ask about
  
  // Generated insights
  suggestedQuestions: string[]            // Smart follow-up questions
  recommendedFeatures: string[]           // Features commonly needed for this business type
}

export class PromptAnalyzer {
  private businessTypePatterns: Map<string, string[]> = new Map()
  private industryMapping: Map<string, string> = new Map()
  private servicePatterns: Map<string, string[]> = new Map()
  private personalityIndicators: Map<string, string[]> = new Map()
  private audiencePatterns: Map<string, string[]> = new Map()

  constructor() {
    this.initializePatterns()
  }

  async analyzePrompt(userPrompt: string): Promise<BusinessPromptAnalysis> {
    logger.info(`🔍 Analyzing business prompt: "${userPrompt}"`);
    
    const prompt = userPrompt.toLowerCase().trim()
    const words = prompt.split(/\s+/)
    
    // Extract core business information
    const businessType = this.extractBusinessType(prompt)
    const businessName = this.extractBusinessName(userPrompt) // Use original case
    const industry = this.mapBusinessTypeToIndustry(businessType)
    
    // Extract services and products
    const services = this.extractServices(prompt, businessType)
    const products = this.extractProducts(prompt, businessType)
    const features = this.extractFeatures(prompt)
    
    // Extract audience and personality
    const targetAudience = this.extractTargetAudience(prompt)
    const demographics = this.extractDemographics(prompt)
    const personality = this.extractPersonality(prompt)
    const tone = this.determineTone(personality, businessType)
    
    // Extract technical requirements
    const functionalRequirements = this.extractFunctionalRequirements(prompt, services)
    const platforms = this.extractPlatforms(prompt)
    const integrations = this.extractIntegrations(prompt, businessType)
    
    // Extract location info
    const location = this.extractLocation(prompt)
    
    // Assess analysis quality
    const analysisQuality = this.assessAnalysisQuality(words.length, services.length, personality.length)
    const confidence = this.calculateConfidence(prompt, businessType, services, personality)
    const missingInformation = this.identifyMissingInformation(businessType, services, personality)
    
    // Generate insights
    const suggestedQuestions = this.generateSuggestedQuestions(businessType, missingInformation)
    const recommendedFeatures = this.getRecommendedFeatures(businessType, services)

    const analysis: BusinessPromptAnalysis = {
      businessType,
      businessName,
      industry,
      services,
      products,
      features,
      targetAudience,
      demographics,
      personality,
      tone,
      functionalRequirements,
      platforms,
      integrations,
      location,
      analysisQuality,
      confidence,
      missingInformation,
      suggestedQuestions,
      recommendedFeatures
    }

    console.log('🎯 Prompt analysis complete:', {
      businessType,
      analysisQuality,
      confidence: `${confidence}%`,
      servicesFound: services.length,
      personalityIndicators: personality.length,
      missingInfo: missingInformation.length
    })

    return analysis
  }

  private extractBusinessType(prompt: string): string {
    // Check business type patterns
    for (const [type, patterns] of this.businessTypePatterns) {
      if (patterns.some(pattern => prompt.includes(pattern))) {
        return type
      }
    }
    
    // Fallback to service-based detection
    if (prompt.includes('booking') || prompt.includes('appointment')) {
      if (prompt.includes('hair') || prompt.includes('beauty') || prompt.includes('spa')) return 'salon'
      if (prompt.includes('medical') || prompt.includes('doctor') || prompt.includes('clinic')) return 'medical'
      if (prompt.includes('service')) return 'professional_services'
    }
    
    if (prompt.includes('food') || prompt.includes('restaurant') || prompt.includes('dining')) return 'restaurant'
    if (prompt.includes('shop') || prompt.includes('store') || prompt.includes('ecommerce')) return 'ecommerce'
    
    return 'general_business'
  }

  private extractBusinessName(prompt: string): string | undefined {
    // Look for quoted business names
    const quotedMatch = prompt.match(/["']([^"']+)["']/);
    if (quotedMatch) return quotedMatch[1];
    
    // Look for "for [Business Name]" pattern
    const forMatch = prompt.match(/\bfor\s+([A-Z][a-zA-Z\s&]+?)(?:\s|$|[.!?])/);
    if (forMatch) return forMatch[1].trim();
    
    // Look for "called [Business Name]" pattern
    const calledMatch = prompt.match(/\bcalled\s+([A-Z][a-zA-Z\s&]+?)(?:\s|$|[.!?])/);
    if (calledMatch) return calledMatch[1].trim();
    
    // Look for possessive patterns like "my salon's" or "our restaurant's"
    const possessiveMatch = prompt.match(/\b(my|our)\s+(\w+)(?:'s|\s)/);
    if (possessiveMatch) {
      const businessWord = possessiveMatch[2];
      // Generate a name based on the business type
      return this.generateBusinessName(businessWord);
    }
    
    return undefined;
  }

  private generateBusinessName(businessType: string): string {
    const nameTemplates: Record<string, string[]> = {
      salon: ['Bella Salon', 'Style Studio', 'Beauty Haven', 'Glamour Lounge'],
      restaurant: ['Bistro Central', 'The Corner Kitchen', 'Feast & Co', 'Garden Café'],
      spa: ['Serenity Spa', 'Wellness Retreat', 'Tranquil Touch', 'Peaceful Oasis'],
      clinic: ['Health Center', 'Wellness Clinic', 'Care Plus', 'Medical Associates'],
      shop: ['Boutique Store', 'The Shop', 'Corner Market', 'Style Boutique']
    };
    
    const templates = nameTemplates[businessType] || ['Business Name', 'My Company', 'Local Business'];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private extractServices(prompt: string, businessType: string): string[] {
    const services: Set<string> = new Set()
    
    // Check service patterns for business type
    const servicePatterns = this.servicePatterns.get(businessType) || []
    for (const service of servicePatterns) {
      if (prompt.includes(service)) {
        services.add(service)
      }
    }
    
    // Generic service extraction
    const serviceKeywords = [
      'booking', 'appointment', 'scheduling', 'consultation', 
      'delivery', 'pickup', 'catering', 'takeout',
      'styling', 'coloring', 'cutting', 'treatment',
      'massage', 'facial', 'manicure', 'pedicure',
      'training', 'classes', 'workshops', 'sessions'
    ]
    
    for (const keyword of serviceKeywords) {
      if (prompt.includes(keyword)) {
        services.add(keyword)
      }
    }
    
    return Array.from(services)
  }

  private extractProducts(prompt: string, businessType: string): string[] {
    const products: Set<string> = new Set()
    
    const productKeywords: Record<string, string[]> = {
      salon: ['shampoo', 'conditioner', 'styling products', 'hair tools'],
      restaurant: ['beverages', 'desserts', 'appetizers', 'entrees'],
      ecommerce: ['clothing', 'accessories', 'electronics', 'home goods'],
      spa: ['skincare', 'aromatherapy', 'candles', 'wellness products']
    }
    
    const businessProducts = productKeywords[businessType] || []
    for (const product of businessProducts) {
      if (prompt.includes(product.split(' ')[0])) { // Check first word
        products.add(product)
      }
    }
    
    return Array.from(products)
  }

  private extractFeatures(prompt: string): string[] {
    const features: Set<string> = new Set()
    
    const featureKeywords = [
      'online booking', 'payment processing', 'inventory management',
      'customer management', 'reporting', 'analytics',
      'social media', 'email marketing', 'reviews',
      'mobile app', 'website', 'e-commerce',
      'calendar integration', 'notification system'
    ]
    
    for (const feature of featureKeywords) {
      if (prompt.includes(feature.replace(' ', '')) || 
          feature.split(' ').every(word => prompt.includes(word))) {
        features.add(feature)
      }
    }
    
    return Array.from(features)
  }

  private extractTargetAudience(prompt: string): string[] {
    const audience: Set<string> = new Set()
    
    for (const [audienceType, patterns] of this.audiencePatterns) {
      if (patterns.some(pattern => prompt.includes(pattern))) {
        audience.add(audienceType)
      }
    }
    
    return Array.from(audience)
  }

  private extractDemographics(prompt: string): any {
    const demographics: any = {}
    
    // Age range detection
    if (prompt.includes('young') || prompt.includes('millennial') || prompt.includes('students')) {
      demographics.ageRange = 'young_adults'
    } else if (prompt.includes('family') || prompt.includes('parents') || prompt.includes('kids')) {
      demographics.ageRange = 'families'
    } else if (prompt.includes('senior') || prompt.includes('elderly')) {
      demographics.ageRange = 'seniors'
    }
    
    // Income level detection
    if (prompt.includes('luxury') || prompt.includes('premium') || prompt.includes('high-end')) {
      demographics.income = 'luxury'
    } else if (prompt.includes('affordable') || prompt.includes('budget') || prompt.includes('cheap')) {
      demographics.income = 'budget'
    } else {
      demographics.income = 'mid_range'
    }
    
    // Lifestyle detection
    const lifestyle: string[] = []
    if (prompt.includes('professional') || prompt.includes('business')) lifestyle.push('busy_professionals')
    if (prompt.includes('health') || prompt.includes('wellness') || prompt.includes('fitness')) lifestyle.push('health_conscious')
    if (prompt.includes('family')) lifestyle.push('family_oriented')
    
    if (lifestyle.length > 0) demographics.lifestyle = lifestyle
    
    return demographics
  }

  private extractPersonality(prompt: string): string[] {
    const personality: Set<string> = new Set()
    
    for (const [trait, indicators] of this.personalityIndicators) {
      if (indicators.some(indicator => prompt.includes(indicator))) {
        personality.add(trait)
      }
    }
    
    return Array.from(personality)
  }

  private determineTone(personality: string[], businessType: string): string {
    if (personality.includes('luxury') || personality.includes('professional')) return 'professional'
    if (personality.includes('friendly') || personality.includes('warm')) return 'friendly'
    if (personality.includes('playful') || personality.includes('creative')) return 'playful'
    if (personality.includes('luxury') || personality.includes('premium')) return 'luxury'
    
    // Default based on business type
    const businessTones: Record<string, string> = {
      salon: 'friendly',
      restaurant: 'welcoming',
      medical: 'professional',
      legal: 'professional',
      ecommerce: 'engaging',
      spa: 'calming'
    }
    
    return businessTones[businessType] || 'professional'
  }

  private extractFunctionalRequirements(prompt: string, services: string[]): string[] {
    const requirements: Set<string> = new Set()
    
    // Service-based requirements
    if (services.includes('booking') || services.includes('appointment')) {
      requirements.add('booking_system')
      requirements.add('calendar_integration')
    }
    
    if (prompt.includes('payment') || prompt.includes('pay') || prompt.includes('purchase')) {
      requirements.add('payment_processing')
    }
    
    if (prompt.includes('inventory') || prompt.includes('stock') || prompt.includes('products')) {
      requirements.add('inventory_management')
    }
    
    if (prompt.includes('customer') || prompt.includes('client') || prompt.includes('member')) {
      requirements.add('customer_management')
    }
    
    return Array.from(requirements)
  }

  private extractPlatforms(prompt: string): string[] {
    const platforms: Set<string> = new Set(['web']) // Default to web
    
    if (prompt.includes('mobile') || prompt.includes('app') || prompt.includes('phone')) {
      platforms.add('mobile')
    }
    
    if (prompt.includes('tablet') || prompt.includes('ipad')) {
      platforms.add('tablet')
    }
    
    return Array.from(platforms)
  }

  private extractIntegrations(prompt: string, businessType: string): string[] {
    const integrations: Set<string> = new Set()
    
    // Common integrations
    if (prompt.includes('google') || prompt.includes('calendar')) integrations.add('google_calendar')
    if (prompt.includes('stripe') || prompt.includes('payment')) integrations.add('stripe')
    if (prompt.includes('email') || prompt.includes('newsletter')) integrations.add('email_marketing')
    if (prompt.includes('social') || prompt.includes('instagram') || prompt.includes('facebook')) integrations.add('social_media')
    
    // Business-specific integrations
    const businessIntegrations: Record<string, string[]> = {
      salon: ['square', 'vagaro', 'booker'],
      restaurant: ['toast', 'grubhub', 'doordash'],
      ecommerce: ['shopify', 'woocommerce', 'stripe'],
      medical: ['epic', 'cerner', 'athenahealth']
    }
    
    const specificIntegrations = businessIntegrations[businessType] || []
    for (const integration of specificIntegrations) {
      if (prompt.includes(integration)) {
        integrations.add(integration)
      }
    }
    
    return Array.from(integrations)
  }

  private extractLocation(prompt: string): any {
    const location: any = {}
    
    if (prompt.includes('local') || prompt.includes('neighborhood') || prompt.includes('community')) {
      location.region = 'local'
    } else if (prompt.includes('national') || prompt.includes('nationwide')) {
      location.region = 'national'
    } else if (prompt.includes('online') || prompt.includes('digital') || prompt.includes('virtual')) {
      location.region = 'online_only'
    }
    
    if (prompt.includes('downtown') || prompt.includes('city center')) {
      location.specific = 'downtown'
    } else if (prompt.includes('suburb') || prompt.includes('residential')) {
      location.specific = 'suburb'
    }
    
    return Object.keys(location).length > 0 ? location : undefined
  }

  private mapBusinessTypeToIndustry(businessType: string): string {
    return this.industryMapping.get(businessType) || 'general'
  }

  private assessAnalysisQuality(wordCount: number, servicesCount: number, personalityCount: number): 'basic' | 'good' | 'detailed' {
    const score = wordCount + (servicesCount * 2) + (personalityCount * 3)
    
    if (score >= 15) return 'detailed'
    if (score >= 8) return 'good'
    return 'basic'
  }

  private calculateConfidence(prompt: string, businessType: string, services: string[], personality: string[]): number {
    let confidence = 30 // Base confidence
    
    // Business type confidence
    if (businessType !== 'general_business') confidence += 20
    
    // Services confidence
    confidence += Math.min(services.length * 10, 30)
    
    // Personality confidence
    confidence += Math.min(personality.length * 5, 20)
    
    // Prompt length confidence
    const wordCount = prompt.split(' ').length
    if (wordCount > 5) confidence += 10
    if (wordCount > 10) confidence += 10
    
    return Math.min(confidence, 95)
  }

  private identifyMissingInformation(businessType: string, services: string[], personality: string[]): string[] {
    const missing: string[] = []
    
    if (services.length === 0) missing.push('services_offered')
    if (personality.length === 0) missing.push('brand_personality')
    if (businessType === 'general_business') missing.push('business_type')
    
    // Business-specific missing info
    if (businessType === 'salon' && !services.includes('booking')) missing.push('appointment_system')
    if (businessType === 'restaurant' && !services.includes('delivery')) missing.push('service_model')
    if (businessType === 'ecommerce' && !services.includes('payment')) missing.push('payment_method')
    
    return missing
  }

  private generateSuggestedQuestions(businessType: string, missingInfo: string[]): string[] {
    const questions: string[] = []
    
    if (missingInfo.includes('services_offered')) {
      const serviceQuestions: Record<string, string> = {
        salon: 'What services will you offer? (haircuts, coloring, styling, treatments)',
        restaurant: 'What type of dining experience? (dine-in, takeout, delivery, catering)',
        ecommerce: 'What products will you sell? (clothing, electronics, home goods)',
        spa: 'What wellness services? (massage, facials, body treatments)'
      }
      questions.push(serviceQuestions[businessType] || 'What services will your business offer?')
    }
    
    if (missingInfo.includes('brand_personality')) {
      questions.push('What personality should your brand have? (professional, friendly, luxury, modern)')
    }
    
    if (missingInfo.includes('business_type')) {
      questions.push('What type of business is this? (salon, restaurant, retail store, service business)')
    }
    
    return questions
  }

  private getRecommendedFeatures(businessType: string, services: string[]): string[] {
    const recommendations: Record<string, string[]> = {
      salon: ['online_booking', 'customer_profiles', 'service_menu', 'staff_scheduling', 'payment_processing'],
      restaurant: ['online_ordering', 'table_reservations', 'menu_display', 'delivery_tracking', 'loyalty_program'],
      ecommerce: ['product_catalog', 'shopping_cart', 'payment_gateway', 'inventory_tracking', 'customer_reviews'],
      spa: ['appointment_booking', 'treatment_packages', 'membership_system', 'wellness_blog', 'gift_certificates']
    }
    
    return recommendations[businessType] || ['contact_form', 'about_section', 'service_showcase']
  }

  private initializePatterns() {
    // Business type patterns
    this.businessTypePatterns.set('salon', ['salon', 'hair', 'beauty', 'stylist', 'barber'])
    this.businessTypePatterns.set('restaurant', ['restaurant', 'café', 'bistro', 'eatery', 'diner', 'food'])
    this.businessTypePatterns.set('spa', ['spa', 'wellness', 'massage', 'relaxation'])
    this.businessTypePatterns.set('medical', ['clinic', 'medical', 'doctor', 'healthcare', 'dental'])
    this.businessTypePatterns.set('ecommerce', ['shop', 'store', 'ecommerce', 'retail', 'marketplace'])
    this.businessTypePatterns.set('fitness', ['gym', 'fitness', 'training', 'workout', 'exercise'])
    this.businessTypePatterns.set('professional_services', ['consulting', 'services', 'agency', 'firm'])
    
    // Industry mapping
    this.industryMapping.set('salon', 'beauty')
    this.industryMapping.set('spa', 'wellness')
    this.industryMapping.set('restaurant', 'food')
    this.industryMapping.set('medical', 'healthcare')
    this.industryMapping.set('ecommerce', 'retail')
    this.industryMapping.set('fitness', 'health')
    
    // Service patterns
    this.servicePatterns.set('salon', ['haircut', 'coloring', 'styling', 'treatment', 'highlights', 'blowout'])
    this.servicePatterns.set('restaurant', ['dine-in', 'takeout', 'delivery', 'catering', 'brunch', 'dinner'])
    this.servicePatterns.set('spa', ['massage', 'facial', 'body treatment', 'aromatherapy', 'meditation'])
    
    // Personality indicators
    this.personalityIndicators.set('luxury', ['luxury', 'premium', 'high-end', 'upscale', 'exclusive'])
    this.personalityIndicators.set('friendly', ['friendly', 'welcoming', 'warm', 'approachable', 'family'])
    this.personalityIndicators.set('professional', ['professional', 'business', 'corporate', 'expert'])
    this.personalityIndicators.set('modern', ['modern', 'contemporary', 'trendy', 'innovative', 'cutting-edge'])
    this.personalityIndicators.set('playful', ['fun', 'playful', 'creative', 'vibrant', 'energetic'])
    
    // Audience patterns
    this.audiencePatterns.set('professionals', ['professional', 'business', 'corporate', 'executive'])
    this.audiencePatterns.set('families', ['family', 'families', 'kids', 'children', 'parents'])
    this.audiencePatterns.set('young_adults', ['young', 'millennial', 'student', 'college'])
    this.audiencePatterns.set('luxury_seekers', ['luxury', 'premium', 'high-end', 'exclusive'])
  }
}

// Export singleton instance
export const promptAnalyzer = new PromptAnalyzer()