// Choice Generator - Creates intelligent choices based on prompt analysis
// Generates options that users can select from while also allowing custom prompting

import { BusinessPromptAnalysis } from './prompt-analyzer'
import { aiClient } from './enhanced-ai-client'
import { AIComponentRequest } from './mock-responses/types'

export interface GeneratedChoice {
  id: string
  title: string                        // "Luxury Salon Experience"
  description: string                   // "Premium, upscale design focused on luxury clients"
  preview: {
    image?: string                     // Preview image if available
    colorScheme: string               // Visual color scheme preview
    example: string                   // Brief example text
  }
  tags: string[]                      // ['luxury', 'professional', 'premium']
  
  // AI generation data
  aiPrompt: string                    // The AI prompt that will generate this choice
  components: ComponentChoice[]       // Individual component choices
  
  // Business context
  targetAudience: string[]           // Who this choice is best for
  businessTypes: string[]            // Which business types this works for
  confidence: number                 // How well this matches the user's prompt
  
  // Customization options
  allowCustomization: boolean        // Can user modify this choice?
  suggestedModifications: string[]   // Suggested ways to customize
}

export interface ComponentChoice {
  type: 'header' | 'hero' | 'features' | 'testimonials' | 'pricing' | 'contact'
  title: string                      // "Professional Header"
  description: string                // "Clean, business-focused navigation"
  preview: string                    // Brief HTML preview or description
  aiRequest: AIComponentRequest      // The request that will generate this component
}

export interface ChoiceGenerationRequest {
  promptAnalysis: BusinessPromptAnalysis
  numberOfChoices?: number           // How many choices to generate (default: 3-4)
  choiceTypes?: ('personality' | 'layout' | 'features' | 'audience')[]
  includeCustomOption?: boolean      // Include "Custom" option for user input
}

export interface ChoiceGenerationResponse {
  choices: GeneratedChoice[]
  customOption?: CustomChoiceOption
  followUpQuestions: string[]        // Questions to refine choices further
  confidence: number                 // Overall confidence in choice quality
}

export interface CustomChoiceOption {
  id: 'custom'
  title: string                      // "Tell us exactly what you want"
  description: string                // "Describe your vision and we'll create it"
  promptTemplate: string             // Template to help users write good prompts
  examples: string[]                 // Example prompts they could use
}

export class ChoiceGenerator {
  private businessTypeChoices: Map<string, any> = new Map()
  private personalityChoices: Map<string, any> = new Map()
  private audienceChoices: Map<string, any> = new Map()

  constructor() {
    this.initializeChoiceTemplates()
  }

  async generateChoices(request: ChoiceGenerationRequest): Promise<ChoiceGenerationResponse> {
    console.log('🎯 Generating choices based on prompt analysis:', {
      businessType: request.promptAnalysis.businessType,
      personality: request.promptAnalysis.personality,
      analysisQuality: request.promptAnalysis.analysisQuality
    })

    const { promptAnalysis } = request
    const numberOfChoices = request.numberOfChoices || 3
    const includeCustomOption = request.includeCustomOption ?? true

    // Generate different types of choices
    const choices: GeneratedChoice[] = []

    // 1. Personality-based choices (if personality detected)
    if (promptAnalysis.personality.length > 0) {
      const personalityChoices = await this.generatePersonalityChoices(promptAnalysis, 2)
      choices.push(...personalityChoices)
    }

    // 2. Audience-based choices (if audience detected)
    if (promptAnalysis.targetAudience.length > 0) {
      const audienceChoice = await this.generateAudienceChoice(promptAnalysis)
      if (audienceChoice) choices.push(audienceChoice)
    }

    // 3. Business-type specific choices
    const businessChoices = await this.generateBusinessTypeChoices(promptAnalysis, numberOfChoices - choices.length)
    choices.push(...businessChoices)

    // 4. Fill remaining slots with diverse options
    while (choices.length < numberOfChoices) {
      const diverseChoice = await this.generateDiverseChoice(promptAnalysis, choices)
      if (diverseChoice) choices.push(diverseChoice)
      else break
    }

    // Sort by confidence score
    choices.sort((a, b) => b.confidence - a.confidence)

    // Generate custom option if requested
    const customOption = includeCustomOption ? this.generateCustomOption(promptAnalysis) : undefined

    // Generate follow-up questions
    const followUpQuestions = this.generateFollowUpQuestions(promptAnalysis, choices)

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence(choices, promptAnalysis)

    const response: ChoiceGenerationResponse = {
      choices: choices.slice(0, numberOfChoices),
      customOption,
      followUpQuestions,
      confidence
    }

    console.log('✅ Generated choices:', {
      choiceCount: response.choices.length,
      hasCustomOption: !!response.customOption,
      confidence: `${response.confidence}%`,
      followUpQuestions: response.followUpQuestions.length
    })

    return response
  }

  private async generatePersonalityChoices(analysis: BusinessPromptAnalysis, count: number): Promise<GeneratedChoice[]> {
    const choices: GeneratedChoice[] = []

    for (const personality of analysis.personality.slice(0, count)) {
      const choiceTemplate = this.personalityChoices.get(personality)
      if (!choiceTemplate) continue

      const choice: GeneratedChoice = {
        id: `personality-${personality}-${Date.now()}`,
        title: choiceTemplate.title.replace('{businessType}', analysis.businessType),
        description: choiceTemplate.description,
        preview: {
          colorScheme: choiceTemplate.colorScheme,
          example: choiceTemplate.example.replace('{businessName}', analysis.businessName || 'Your Business')
        },
        tags: [personality, ...choiceTemplate.tags],
        aiPrompt: this.buildAIPrompt(analysis, personality, choiceTemplate.focus),
        components: await this.generateComponentChoices(analysis, personality),
        targetAudience: choiceTemplate.targetAudience,
        businessTypes: choiceTemplate.businessTypes || [analysis.businessType],
        confidence: this.calculateChoiceConfidence(analysis, personality),
        allowCustomization: true,
        suggestedModifications: choiceTemplate.modifications || []
      }

      choices.push(choice)
    }

    return choices
  }

  private async generateAudienceChoice(analysis: BusinessPromptAnalysis): Promise<GeneratedChoice | null> {
    const primaryAudience = analysis.targetAudience[0]
    if (!primaryAudience) return null

    const audienceTemplate = this.audienceChoices.get(primaryAudience)
    if (!audienceTemplate) return null

    return {
      id: `audience-${primaryAudience}-${Date.now()}`,
      title: audienceTemplate.title.replace('{businessType}', analysis.businessType),
      description: audienceTemplate.description,
      preview: {
        colorScheme: audienceTemplate.colorScheme,
        example: audienceTemplate.example.replace('{businessName}', analysis.businessName || 'Your Business')
      },
      tags: [primaryAudience, ...audienceTemplate.tags],
      aiPrompt: this.buildAIPrompt(analysis, primaryAudience, audienceTemplate.focus),
      components: await this.generateComponentChoices(analysis, primaryAudience),
      targetAudience: [primaryAudience],
      businessTypes: [analysis.businessType],
      confidence: this.calculateChoiceConfidence(analysis, primaryAudience),
      allowCustomization: true,
      suggestedModifications: audienceTemplate.modifications || []
    }
  }

  private async generateBusinessTypeChoices(analysis: BusinessPromptAnalysis, count: number): Promise<GeneratedChoice[]> {
    const choices: GeneratedChoice[] = []
    const businessTemplate = this.businessTypeChoices.get(analysis.businessType)

    if (!businessTemplate) {
      // Generate generic business choice
      return [await this.generateGenericChoice(analysis)]
    }

    // Generate business-specific choices
    const variants = businessTemplate.variants || ['standard', 'premium', 'modern']
    
    for (let i = 0; i < Math.min(count, variants.length); i++) {
      const variant = variants[i]
      const variantData = businessTemplate[variant] || businessTemplate.standard

      const choice: GeneratedChoice = {
        id: `business-${analysis.businessType}-${variant}-${Date.now()}`,
        title: variantData.title.replace('{businessName}', analysis.businessName || `${analysis.businessType} Business`),
        description: variantData.description,
        preview: {
          colorScheme: variantData.colorScheme,
          example: variantData.example
        },
        tags: [analysis.businessType, variant, ...variantData.tags],
        aiPrompt: this.buildAIPrompt(analysis, variant, variantData.focus),
        components: await this.generateComponentChoices(analysis, variant),
        targetAudience: analysis.targetAudience,
        businessTypes: [analysis.businessType],
        confidence: this.calculateChoiceConfidence(analysis, variant),
        allowCustomization: true,
        suggestedModifications: variantData.modifications || []
      }

      choices.push(choice)
    }

    return choices
  }

  private async generateDiverseChoice(analysis: BusinessPromptAnalysis, existingChoices: GeneratedChoice[]): Promise<GeneratedChoice | null> {
    // Generate a choice that's different from existing ones
    const existingTags = new Set(existingChoices.flatMap(c => c.tags))
    
    const diverseOptions = ['creative', 'minimal', 'bold', 'friendly', 'trustworthy']
    const availableOptions = diverseOptions.filter(opt => !existingTags.has(opt))
    
    if (availableOptions.length === 0) return null

    const chosenOption = availableOptions[0]
    const template = this.personalityChoices.get(chosenOption)
    
    if (!template) return null

    return {
      id: `diverse-${chosenOption}-${Date.now()}`,
      title: template.title.replace('{businessType}', analysis.businessType),
      description: template.description,
      preview: {
        colorScheme: template.colorScheme,
        example: template.example.replace('{businessName}', analysis.businessName || 'Your Business')
      },
      tags: [chosenOption, 'diverse'],
      aiPrompt: this.buildAIPrompt(analysis, chosenOption, template.focus),
      components: await this.generateComponentChoices(analysis, chosenOption),
      targetAudience: analysis.targetAudience,
      businessTypes: [analysis.businessType],
      confidence: this.calculateChoiceConfidence(analysis, chosenOption) - 10, // Lower confidence for diverse
      allowCustomization: true,
      suggestedModifications: template.modifications || []
    }
  }

  private async generateGenericChoice(analysis: BusinessPromptAnalysis): Promise<GeneratedChoice> {
    return {
      id: `generic-${analysis.businessType}-${Date.now()}`,
      title: `Professional ${analysis.businessType} Website`,
      description: 'Clean, professional design that works for any business',
      preview: {
        colorScheme: 'blue-gray-professional',
        example: `Welcome to ${analysis.businessName || 'Your Business'} - Professional services you can trust`
      },
      tags: ['professional', 'generic', analysis.businessType],
      aiPrompt: this.buildAIPrompt(analysis, 'professional', 'Clean and professional design'),
      components: await this.generateComponentChoices(analysis, 'professional'),
      targetAudience: analysis.targetAudience,
      businessTypes: [analysis.businessType],
      confidence: 60, // Medium confidence for generic
      allowCustomization: true,
      suggestedModifications: ['Add more personality', 'Customize colors', 'Add business-specific features']
    }
  }

  private generateCustomOption(analysis: BusinessPromptAnalysis): CustomChoiceOption {
    return {
      id: 'custom',
      title: 'Describe Your Vision',
      description: 'Tell us exactly what you want and we\'ll create it with AI',
      promptTemplate: `I want a ${analysis.businessType} website that {describe your vision here}. 
The style should be {personality/mood} and target {audience}. 
Key features needed: {list important features}.`,
      examples: [
        `I want a ${analysis.businessType} website that feels warm and welcoming like a family business. The style should be friendly and inviting, targeting local families. Key features: easy booking, service showcase, customer reviews.`,
        `I want a ${analysis.businessType} website that looks ultra-modern and high-tech. The style should be sleek and minimalist, targeting tech-savvy professionals. Key features: advanced booking system, integration with apps, analytics dashboard.`,
        `I want a ${analysis.businessType} website that screams luxury and exclusivity. The style should be elegant and sophisticated, targeting high-income clients. Key features: VIP booking, premium service showcase, exclusive member area.`
      ]
    }
  }

  private async generateComponentChoices(analysis: BusinessPromptAnalysis, style: string): Promise<ComponentChoice[]> {
    const components: ComponentChoice[] = []

    // Generate component choices for main sections
    const componentTypes: Array<'header' | 'hero' | 'features'> = ['header', 'hero', 'features']

    for (const type of componentTypes) {
      const componentChoice: ComponentChoice = {
        type,
        title: `${this.capitalize(style)} ${this.capitalize(type)}`,
        description: `${this.capitalize(style)} design for your ${type} section`,
        preview: `<${type} class="${style}-${type}">Preview of ${style} ${type}</${type}>`,
        aiRequest: {
          type: 'generate',
          componentType: type,
          userIntent: `Create a ${style} ${type} for a ${analysis.businessType} business`,
          businessContext: {
            type: analysis.businessType,
            personality: [style],
            audience: analysis.targetAudience,
            brandName: analysis.businessName
          }
        }
      }

      components.push(componentChoice)
    }

    return components
  }

  private buildAIPrompt(analysis: BusinessPromptAnalysis, style: string, focus: string): string {
    const services = analysis.services.length > 0 ? analysis.services.join(', ') : 'general services'
    const audience = analysis.targetAudience.length > 0 ? analysis.targetAudience.join(', ') : 'general audience'

    return `Create a ${style} website for ${analysis.businessName || 'a ' + analysis.businessType} that offers ${services}. 
Target audience: ${audience}. 
Focus on: ${focus}. 
Business type: ${analysis.businessType}. 
Key features needed: ${analysis.functionalRequirements.join(', ') || 'basic business features'}.
Brand personality: ${style}, ${analysis.personality.join(', ')}
Tone: ${analysis.tone}`
  }

  private calculateChoiceConfidence(analysis: BusinessPromptAnalysis, style: string): number {
    let confidence = 60 // Base confidence

    // Increase if style matches detected personality
    if (analysis.personality.includes(style)) confidence += 20

    // Increase based on analysis quality
    if (analysis.analysisQuality === 'detailed') confidence += 15
    else if (analysis.analysisQuality === 'good') confidence += 10

    // Increase if services are well-defined
    if (analysis.services.length > 2) confidence += 10

    // Increase if audience is clear
    if (analysis.targetAudience.length > 0) confidence += 5

    return Math.min(confidence, 95)
  }

  private generateFollowUpQuestions(analysis: BusinessPromptAnalysis, choices: GeneratedChoice[]): string[] {
    const questions: string[] = []

    if (analysis.analysisQuality === 'basic') {
      questions.push('What specific services will you offer?')
      questions.push('Who is your target audience?')
    }

    if (analysis.personality.length === 0) {
      questions.push('What personality should your brand have? (professional, friendly, luxury, modern)')
    }

    if (analysis.functionalRequirements.length === 0) {
      questions.push('What key features do you need? (booking system, online payments, customer portal)')
    }

    // Add choice-specific questions
    if (choices.length > 1) {
      questions.push('Which style direction feels most aligned with your vision?')
    }

    return questions.slice(0, 3) // Limit to 3 questions
  }

  private calculateOverallConfidence(choices: GeneratedChoice[], analysis: BusinessPromptAnalysis): number {
    if (choices.length === 0) return 30

    const avgChoiceConfidence = choices.reduce((sum, choice) => sum + choice.confidence, 0) / choices.length
    const analysisConfidence = analysis.confidence

    return Math.round((avgChoiceConfidence + analysisConfidence) / 2)
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  private initializeChoiceTemplates() {
    // Personality-based choices
    this.personalityChoices.set('luxury', {
      title: 'Luxury {businessType} Experience',
      description: 'Premium, upscale design that conveys exclusivity and sophistication',
      colorScheme: 'gold-black-cream',
      example: 'Experience the pinnacle of luxury at {businessName}',
      focus: 'Premium quality, exclusivity, and sophisticated elegance',
      tags: ['premium', 'upscale', 'sophisticated'],
      targetAudience: ['luxury_seekers', 'high_income'],
      modifications: ['Adjust luxury level', 'Change color scheme', 'Add premium features']
    })

    this.personalityChoices.set('friendly', {
      title: 'Warm & Welcoming {businessType}',
      description: 'Approachable, community-focused design that feels like home',
      colorScheme: 'warm-orange-cream',
      example: 'Welcome to {businessName} - Your neighborhood favorite',
      focus: 'Warmth, community connection, and approachable service',
      tags: ['welcoming', 'community', 'approachable'],
      targetAudience: ['families', 'locals', 'community'],
      modifications: ['Adjust warmth level', 'Add community features', 'Change color warmth']
    })

    this.personalityChoices.set('professional', {
      title: 'Professional {businessType} Services',
      description: 'Clean, business-focused design that builds trust and credibility',
      colorScheme: 'navy-gray-white',
      example: '{businessName} - Professional excellence you can trust',
      focus: 'Professionalism, expertise, and trustworthiness',
      tags: ['trustworthy', 'credible', 'expert'],
      targetAudience: ['professionals', 'business_clients'],
      modifications: ['Adjust formality level', 'Add credentials', 'Customize industry focus']
    })

    this.personalityChoices.set('modern', {
      title: 'Modern {businessType} Hub',
      description: 'Contemporary, cutting-edge design with the latest trends',
      colorScheme: 'black-white-accent',
      example: '{businessName} - Innovation meets excellence',
      focus: 'Innovation, contemporary design, and forward-thinking',
      tags: ['contemporary', 'innovative', 'trendy'],
      targetAudience: ['young_professionals', 'tech_savvy'],
      modifications: ['Adjust modernity level', 'Change accent color', 'Add tech features']
    })

    // Business type specific choices
    this.businessTypeChoices.set('salon', {
      variants: ['luxury', 'friendly', 'trendy'],
      luxury: {
        title: '{businessName} - Luxury Beauty Sanctuary',
        description: 'High-end salon experience with premium services',
        colorScheme: 'gold-black-cream',
        example: 'Transform yourself in our luxury beauty sanctuary',
        focus: 'Premium beauty services and luxury experience',
        tags: ['beauty', 'transformation', 'premium']
      },
      friendly: {
        title: '{businessName} - Your Beauty Family',
        description: 'Warm, welcoming salon that feels like home',
        colorScheme: 'coral-cream-white',
        example: 'Where every visit feels like visiting family',
        focus: 'Community, warmth, and personal care',
        tags: ['family', 'community', 'welcoming']
      },
      trendy: {
        title: '{businessName} - Modern Style Studio',
        description: 'Cutting-edge salon with the latest trends',
        colorScheme: 'black-pink-white',
        example: 'Stay ahead of the trends with our expert stylists',
        focus: 'Latest trends, modern techniques, style innovation',
        tags: ['trendy', 'modern', 'stylish']
      }
    })

    // Audience-based choices
    this.audienceChoices.set('families', {
      title: 'Family-Friendly {businessType}',
      description: 'Designed with families in mind - welcoming for all ages',
      colorScheme: 'blue-green-cream',
      example: '{businessName} - Where families feel at home',
      focus: 'Family comfort, kid-friendly, multi-generational appeal',
      tags: ['family', 'kids', 'multigenerational']
    })

    this.audienceChoices.set('professionals', {
      title: 'Professional {businessType} Services',
      description: 'Streamlined for busy professionals who value efficiency',
      colorScheme: 'navy-gray-white',
      example: '{businessName} - Efficient service for busy professionals',
      focus: 'Efficiency, convenience, professional quality',
      tags: ['efficient', 'convenient', 'professional']
    })
  }
}

// Export singleton instance
export const choiceGenerator = new ChoiceGenerator()