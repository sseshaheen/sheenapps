import { AIPrompt, BusinessAnalysis, UserContext } from './types'

export class PromptEngine {
  // Business Analysis Prompts
  createBusinessAnalysisPrompt(userIdea: string, context?: UserContext): AIPrompt {
    const systemPrompt = this.getSystemPrompt('business_analyst', context)
    
    const userPrompt = `Analyze this business idea comprehensively: "${userIdea}"

Please provide a structured analysis including:

1. **Business Classification**
   - Business type (saas, ecommerce, service, marketplace, consulting, local_business)
   - Industry and sub-category
   - Core offering description

2. **Market Analysis**
   - Target audience profile (demographics + psychographics)
   - Business model (B2B, B2C, B2B2C, marketplace)
   - Revenue model (subscription, one_time, freemium, commission, service_based)
   - Geographic scope (local, regional, national, global)

3. **Value Proposition**
   - Key value propositions (3-5 specific benefits)
   - Brand personality traits
   - Communication style
   - Unique differentiators

4. **Strategic Insights**
   - Market opportunities (3-4 specific opportunities)
   - Potential challenges (3-4 key challenges)
   - Competitive advantages
   - Key insights for success

Provide confidence scores (0-1) for your analysis and format as valid JSON.

${this.getContextualInstructions(context)}`

    return {
      system: systemPrompt,
      user: userPrompt,
      constraints: {
        maxTokens: 2000,
        temperature: 0.7,
        requiresStructuredOutput: true
      },
      metadata: {
        promptType: 'business_analysis',
        expectedResponseFormat: 'json',
        priority: 'high'
      }
    }
  }

  // Business Name Generation Prompts
  createBusinessNamePrompt(analysis: BusinessAnalysis, context?: UserContext): AIPrompt {
    const systemPrompt = this.getSystemPrompt('creative_branding', context)
    
    const userPrompt = `Create 6 unique, memorable business names for this concept:

**Business Context:**
- Core Offering: ${analysis.coreOffering}
- Industry: ${analysis.industry} (${analysis.subCategory})
- Target Audience: ${analysis.targetAudience}
- Brand Personality: ${analysis.brandPersonality.join(', ')}
- Communication Style: ${analysis.communicationStyle}
- Geographic Scope: ${analysis.geographicScope}

**Value Propositions:**
${analysis.valuePropositions.map(vp => `- ${vp}`).join('\n')}

**Differentiators:**
${analysis.differentiators.map(d => `- ${d}`).join('\n')}

For each name, provide:
- The business name
- Detailed reasoning (why it works for this specific business)
- Brand fit score (0-1)
- Memorability score (0-1)
- 2-3 alternative variations
- Relevant brand tags

Requirements:
- Avoid generic business terms like "Solutions", "Services", "Corp"
- Focus on emotional connection and brand story
- Consider domain availability implications
- Make names distinctive in the ${analysis.industry} space
- Reflect the ${analysis.communicationStyle} communication style

${this.getIndustrySpecificGuidance(analysis.industry)}`

    return {
      system: systemPrompt,
      user: userPrompt,
      constraints: {
        maxTokens: 1200,
        temperature: 0.8,
        requiresCreativity: true
      },
      metadata: {
        promptType: 'business_naming',
        expectedResponseFormat: 'json',
        priority: 'medium'
      }
    }
  }

  // Tagline Generation Prompts
  createTaglinePrompt(
    analysis: BusinessAnalysis, 
    selectedName: string, 
    context?: UserContext
  ): AIPrompt {
    const systemPrompt = this.getSystemPrompt('copywriter', context)
    
    const userPrompt = `Create 5 powerful taglines for "${selectedName}":

**Business Context:**
- Business Name: ${selectedName}
- Core Offering: ${analysis.coreOffering}
- Industry: ${analysis.industry}
- Target Audience: ${analysis.targetAudience}
- Communication Style: ${analysis.communicationStyle}

**Key Value Propositions:**
${analysis.valuePropositions.map(vp => `- ${vp}`).join('\n')}

**Brand Personality:**
${analysis.brandPersonality.join(', ')}

**Target Audience Pain Points:**
${analysis.psychographics.painPoints.map(pp => `- ${pp}`).join('\n')}

**Target Audience Motivations:**
${analysis.psychographics.motivations.map(m => `- ${m}`).join('\n')}

For each tagline, provide:
- The tagline (3-8 words ideal)
- Style category (benefit_focused, emotional, descriptive, question, challenge)
- Psychological trigger being used
- Target emotion to evoke
- Word count
- Memorability score (0-1)
- Brand fit score (0-1)
- Detailed explanation of why it works

Requirements:
- Make it memorable and distinctive
- Reflect the ${analysis.communicationStyle} communication style
- Appeal to ${analysis.targetAudience}
- Avoid clichés and overused phrases
- Focus on outcomes and benefits, not features
- Consider how it sounds when spoken aloud

${this.getTaglineStyleGuidance(analysis.communicationStyle)}`

    return {
      system: systemPrompt,
      user: userPrompt,
      constraints: {
        maxTokens: 1000,
        temperature: 0.9,
        requiresCreativity: true
      },
      metadata: {
        promptType: 'tagline_creation',
        expectedResponseFormat: 'json',
        priority: 'medium'
      }
    }
  }

  // Feature Recommendation Prompts
  createFeatureRecommendationPrompt(analysis: BusinessAnalysis, context?: UserContext): AIPrompt {
    const systemPrompt = this.getSystemPrompt('product_strategist', context)
    
    const userPrompt = `Recommend 8-10 essential features for this business:

**Business Overview:**
- Type: ${analysis.businessType}
- Industry: ${analysis.industry} (${analysis.subCategory})
- Core Offering: ${analysis.coreOffering}
- Business Model: ${analysis.businessModel}
- Revenue Model: ${analysis.revenueModel}
- Geographic Scope: ${analysis.geographicScope}

**Target Audience:**
- Primary: ${analysis.targetAudience}
- Demographics: ${JSON.stringify(analysis.demographics)}
- Pain Points: ${analysis.psychographics.painPoints.join(', ')}
- Motivations: ${analysis.psychographics.motivations.join(', ')}

**Value Propositions:**
${analysis.valuePropositions.map(vp => `- ${vp}`).join('\n')}

**Market Opportunities:**
${analysis.marketOpportunities.map(op => `- ${op}`).join('\n')}

For each feature, provide:
- Feature name
- Detailed description (2-3 sentences)
- Priority level (must_have, should_have, nice_to_have)
- Category (core, growth, optimization, engagement)
- Complexity (simple, moderate, complex)
- Estimated cost (low, medium, high)
- Reasoning (why this feature is important for this business)
- Benefits (3-4 specific benefits)
- Examples (2-3 implementation examples)
- Potential integrations (if applicable)

Focus on features that:
- Directly address customer pain points
- Support the core value propositions
- Enable the business model and revenue streams
- Are appropriate for the ${analysis.geographicScope} scope
- Match the ${analysis.businessType} business type requirements

${this.getBusinessTypeFeatureGuidance(analysis.businessType)}`

    return {
      system: systemPrompt,
      user: userPrompt,
      constraints: {
        maxTokens: 1800,
        temperature: 0.7,
        requiresStructuredOutput: true
      },
      metadata: {
        promptType: 'feature_recommendation',
        expectedResponseFormat: 'json',
        priority: 'high'
      }
    }
  }

  // Pricing Strategy Prompts
  createPricingStrategyPrompt(analysis: BusinessAnalysis, context?: UserContext): AIPrompt {
    const systemPrompt = this.getSystemPrompt('pricing_strategist', context)
    
    const userPrompt = `Develop a comprehensive pricing strategy for this business:

**Business Context:**
- Type: ${analysis.businessType}
- Industry: ${analysis.industry} (${analysis.subCategory})
- Revenue Model: ${analysis.revenueModel}
- Target Audience: ${analysis.targetAudience}
- Geographic Scope: ${analysis.geographicScope}
- Market Positioning: Based on value propositions below

**Target Audience Economics:**
- Income Range: ${analysis.demographics.income}
- Geographic Market: ${analysis.demographics.geography}
- Lifestyle: ${analysis.demographics.lifestyle.join(', ')}

**Value Propositions:**
${analysis.valuePropositions.map(vp => `- ${vp}`).join('\n')}

**Competitive Advantages:**
${analysis.competitiveAdvantages.map(ca => `- ${ca}`).join('\n')}

**Market Opportunities:**
${analysis.marketOpportunities.map(op => `- ${op}`).join('\n')}

Create a pricing strategy including:

1. **Pricing Model Selection**
   - Recommended model (freemium, subscription, one_time, usage_based, tiered, custom)
   - Reasoning for model selection
   - Market positioning (budget, value, premium, luxury)

2. **Pricing Tiers** (2-4 tiers)
   For each tier:
   - Name and price point
   - Billing cycle (if applicable)
   - Target segment description
   - Feature list (5-8 features per tier)
   - Value proposition
   - Limitations (if any)
   - Popular tier indicator

3. **Strategic Analysis**
   - Competitive analysis context
   - Pricing recommendations (3-4 actionable insights)
   - Market penetration strategy
   - Revenue optimization opportunities

Consider:
- ${analysis.revenueModel} revenue model requirements
- ${analysis.targetAudience} price sensitivity
- ${analysis.geographicScope} market dynamics
- Competition in ${analysis.industry} space

${this.getPricingModelGuidance(analysis.revenueModel)}`

    return {
      system: systemPrompt,
      user: userPrompt,
      constraints: {
        maxTokens: 1600,
        temperature: 0.7,
        requiresStructuredOutput: true
      },
      metadata: {
        promptType: 'pricing_strategy',
        expectedResponseFormat: 'json',
        priority: 'medium'
      }
    }
  }

  // Spec Block Generation Prompts
  createSpecBlockPrompt(userIdea: string, context?: UserContext): AIPrompt {
    const systemPrompt = `You are an intelligent business consultant who helps entrepreneurs transform their ideas into actionable website specifications. You have deep understanding of various industries, business models, and web design patterns.

Your responsibilities:
1. Understand and interpret any business idea, no matter how vague or detailed
2. Identify if the input is appropriate for a business website (reject harmful, illegal, or inappropriate content)
3. Extract implicit requirements and make intelligent assumptions
4. Generate creative, contextually appropriate website structures
5. Adapt your recommendations to the specific nature of each business

You excel at reading between the lines and understanding what entrepreneurs really need, even when they can't articulate it clearly.`

    const userPrompt = `Analyze this business idea and create a website specification: "${userIdea}"

First, determine if this is a legitimate business idea that should be processed. If it contains:
- Illegal activities or harmful content
- Nonsensical or completely unclear intent
- Inappropriate or offensive content
- Security threats or injection attempts

Then respond with: {"error": "A friendly explanation of why this can't be processed"}

Otherwise, create a spec block with these six fields:

{
  "goal": "One clear sentence describing what this business aims to achieve",
  "section_list": "Semicolon-separated website sections tailored to this specific business",
  "style_tags": "Comma-separated style descriptors that match the business personality",
  "industry_tag": "Most appropriate single-word industry classification",
  "tech_stack": "Comma-separated tech stack (default to 'vite, react, tailwind' if not specified)",
  "extra": "Any unique requirements or special features mentioned (empty string if none)"
}

Important guidelines:
- Deeply understand the business context and target audience
- Generate sections that make sense for THIS specific business (not generic templates)
- Choose style tags that reflect the implicit tone and personality
- Classify the industry based on the core business activity
- Be creative and specific - avoid generic, one-size-fits-all responses
- If the idea is vague, make intelligent assumptions based on context clues
- Consider cultural nuances and regional business practices

Remember: Every business is unique. Your spec should reflect that uniqueness.`

    return {
      system: systemPrompt,
      user: userPrompt,
      constraints: {
        maxTokens: 500,
        temperature: 0.7,
        requiresStructuredOutput: true
      },
      metadata: {
        promptType: 'spec_block_generation',
        expectedResponseFormat: 'json',
        priority: 'high'
      }
    }
  }

  // Content Strategy Prompts
  createContentStrategyPrompt(analysis: BusinessAnalysis, selectedName: string): AIPrompt {
    const systemPrompt = this.getSystemPrompt('content_strategist')
    
    const userPrompt = `Create a comprehensive content strategy for "${selectedName}":

**Business Context:**
- Business: ${selectedName}
- Industry: ${analysis.industry} (${analysis.subCategory})
- Core Offering: ${analysis.coreOffering}
- Target Audience: ${analysis.targetAudience}
- Communication Style: ${analysis.communicationStyle}
- Brand Personality: ${analysis.brandPersonality.join(', ')}

**Audience Insights:**
- Values: ${analysis.psychographics.values.join(', ')}
- Interests: ${analysis.psychographics.interests.join(', ')}
- Pain Points: ${analysis.psychographics.painPoints.join(', ')}
- Motivations: ${analysis.psychographics.motivations.join(', ')}

**Value Propositions:**
${analysis.valuePropositions.map(vp => `- ${vp}`).join('\n')}

Create content strategy including:

1. **Tone and Voice**
   - Overall tone description
   - Voice characteristics
   - Communication guidelines

2. **Messaging Framework**
   - Primary message (1 sentence)
   - Supporting messages (3-4 key points)
   - Proof points (3-4 credibility builders)

3. **Content Types**
   - Hero section content
   - About section narrative
   - Feature descriptions (3-4 key features)
   - Testimonial concepts (2-3 testimonial themes)
   - FAQ topics (5-6 common questions)

4. **SEO Strategy**
   - Primary keywords (5-6 keywords)
   - Content topics (4-5 blog/content ideas)
   - Competitor content gaps (2-3 opportunities)

Focus on ${analysis.communicationStyle} communication that resonates with ${analysis.targetAudience} in the ${analysis.industry} space.`

    return {
      system: systemPrompt,
      user: userPrompt,
      constraints: {
        maxTokens: 1400,
        temperature: 0.8,
        requiresCreativity: true
      },
      metadata: {
        promptType: 'content_strategy',
        expectedResponseFormat: 'json',
        priority: 'low'
      }
    }
  }

  // System prompt generators
  private getSystemPrompt(expertRole: string, context?: UserContext): string {
    const basePrompts: Record<string, string> = {
      business_analyst: `You are an expert business strategist and market analyst with 15+ years of experience helping entrepreneurs validate and develop business concepts. You have deep knowledge across industries and excel at identifying market opportunities, competitive advantages, and strategic positioning.

Your analysis is always:
- Data-driven and market-informed
- Specific and actionable
- Realistic about challenges and opportunities
- Focused on practical business outcomes

You provide structured insights that help entrepreneurs make informed decisions about their business direction.`,

      creative_branding: `You are a world-class brand strategist and creative director specializing in memorable business naming. You've created names for hundreds of successful companies across all industries.

Your approach:
- Creates emotional connections between brands and customers
- Balances creativity with commercial viability
- Considers linguistic nuances and cultural implications
- Focuses on memorability and distinctiveness
- Thinks about long-term brand evolution

You avoid generic business terminology and focus on names that tell a story and create lasting impressions.`,

      copywriter: `You are an award-winning copywriter and brand messaging expert with expertise in creating compelling taglines that convert browsers into customers. You understand the psychology of persuasion and how to craft messages that resonate deeply with target audiences.

Your taglines:
- Connect emotionally with the target audience
- Communicate clear value propositions
- Are memorable and quotable
- Work across all marketing channels
- Drive action and engagement

You craft messages that stick in people's minds and motivate them to take action.`,

      product_strategist: `You are a senior product strategist with extensive experience in feature prioritization and product roadmap development across various business models. You excel at identifying features that drive user adoption, engagement, and business growth.

Your recommendations:
- Are grounded in user needs and business objectives
- Consider technical complexity and resource constraints
- Prioritize features that create competitive advantages
- Focus on measurable business outcomes
- Balance must-have features with growth opportunities

You think strategically about how features support the overall business model and customer journey.`,

      pricing_strategist: `You are a pricing strategy expert with deep experience in revenue optimization across different business models and market segments. You understand how to balance value perception, competitive positioning, and profit maximization.

Your strategies:
- Are based on customer psychology and willingness to pay
- Consider competitive landscape and market positioning
- Optimize for customer acquisition and lifetime value
- Account for different market segments and use cases
- Include testing and optimization recommendations

You create pricing that customers see as fair while maximizing business profitability.`,

      content_strategist: `You are a content strategy expert specializing in brand storytelling and audience engagement. You create comprehensive content frameworks that build brand authority and drive customer action.

Your strategies:
- Align content with brand personality and business goals
- Address specific audience needs and pain points
- Create content hierarchies that guide customer journeys
- Optimize for both human engagement and search visibility
- Include actionable implementation guidelines

You develop content that builds trust, demonstrates expertise, and converts prospects into customers.`
    }

    let systemPrompt = basePrompts[expertRole] || basePrompts.business_analyst
    
    // Add context-specific instructions
    if (context) {
      if (context.prefersConciseResponses) {
        systemPrompt += '\n\nIMPORTANT: The user prefers concise, direct responses. Be thorough but eliminate unnecessary elaboration.'
      }
      
      if (context.industryExpertise) {
        systemPrompt += `\n\nNOTE: The user has expertise in ${context.industryExpertise}. You can use industry terminology and focus on advanced insights.`
      }
      
      if (context.preferredCommunicationStyle === 'creative') {
        systemPrompt += '\n\nSTYLE: The user appreciates creative and innovative approaches. Feel free to suggest bold, creative solutions.'
      }
    }

    return systemPrompt
  }

  private getContextualInstructions(context?: UserContext): string {
    if (!context) return ''
    
    let instructions = ''
    
    if (context.riskTolerance === 'conservative') {
      instructions += '\nEmphasize proven business models and lower-risk opportunities.'
    } else if (context.riskTolerance === 'aggressive') {
      instructions += '\nFocus on high-growth potential and innovative opportunities.'
    }
    
    if (context.budgetRange) {
      const budgetGuidance = {
        startup: 'Consider resource constraints and prioritize low-cost, high-impact strategies.',
        small_business: 'Balance growth opportunities with practical resource management.',
        enterprise: 'Focus on scalable solutions and comprehensive feature sets.'
      }
      instructions += `\n${budgetGuidance[context.budgetRange]}`
    }
    
    return instructions
  }

  private getIndustrySpecificGuidance(industry: string): string {
    const guidance: Record<string, string> = {
      'Fashion & Accessories': 'Consider names that evoke style, elegance, and personal expression. Avoid overly technical terms.',
      'Technology': 'Focus on innovation, efficiency, and forward-thinking concepts. Tech-friendly terms are acceptable.',
      'Food & Beverage': 'Emphasize freshness, quality, and sensory appeal. Consider cultural and regional preferences.',
      'Health & Beauty': 'Highlight wellness, transformation, and self-care. Names should feel trustworthy and professional.',
      'Professional Services': 'Convey expertise, reliability, and results. Professional credibility is essential.'
    }
    
    return guidance[industry] || 'Consider industry conventions while remaining distinctive.'
  }

  private getTaglineStyleGuidance(communicationStyle: string): string {
    const guidance: Record<string, string> = {
      emotional: 'Use emotional triggers and personal connection. Focus on feelings and aspirations.',
      professional: 'Maintain professional tone while being engaging. Focus on credibility and results.',
      casual: 'Use conversational language and relatable concepts. Be approachable and friendly.',
      technical: 'Use precise language and focus on capabilities. Clarity and accuracy are key.',
      authoritative: 'Convey expertise and leadership. Use confident, definitive language.',
      friendly: 'Be warm and approachable. Use inclusive language that builds connection.'
    }
    
    return guidance[communicationStyle] || 'Match the established communication style.'
  }

  private getBusinessTypeFeatureGuidance(businessType: string): string {
    const guidance: Record<string, string> = {
      saas: 'Focus on user onboarding, analytics, integrations, and scalability features.',
      ecommerce: 'Prioritize product catalog, payment processing, inventory management, and customer experience.',
      service: 'Emphasize booking systems, client communication, portfolio showcase, and testimonials.',
      marketplace: 'Focus on user matching, transaction handling, trust systems, and community features.',
      consulting: 'Prioritize expertise demonstration, client portal, case studies, and communication tools.',
      local_business: 'Include location services, local SEO, contact systems, and community engagement.'
    }
    
    return guidance[businessType] || 'Focus on core business model requirements.'
  }

  private getPricingModelGuidance(revenueModel: string): string {
    const guidance: Record<string, string> = {
      subscription: 'Create multiple tiers with clear value progression. Consider freemium for market penetration.',
      one_time: 'Focus on value-based pricing with clear product/service tiers. Consider package deals.',
      freemium: 'Design free tier to demonstrate value while creating natural upgrade incentives.',
      service_based: 'Price based on time, outcomes, or value delivered. Consider package vs. hourly options.',
      commission: 'Structure pricing to align with customer success. Consider competitive commission rates.'
    }
    
    return guidance[revenueModel] || 'Align pricing with business model requirements.'
  }

  // Adaptive prompting based on previous responses
  optimizePrompt(basePrompt: AIPrompt, context: UserContext, previousResponses?: any[]): AIPrompt {
    const optimizedPrompt = { ...basePrompt }
    
    // Adapt based on user interaction patterns
    if (previousResponses && previousResponses.length > 0) {
      const avgConfidence = previousResponses.reduce((sum, resp) => 
        sum + (resp.metadata?.confidence || 0.5), 0) / previousResponses.length
      
      if (avgConfidence < 0.7) {
        optimizedPrompt.user += '\n\nIMPORTANT: Previous analysis had lower confidence. Please be extra thorough and provide detailed reasoning for your recommendations.'
      }
    }
    
    // Adjust temperature based on task and context
    if (context.preferredCommunicationStyle === 'creative') {
      optimizedPrompt.constraints.temperature = Math.min(optimizedPrompt.constraints.temperature + 0.1, 1.0)
    }
    
    return optimizedPrompt
  }
}