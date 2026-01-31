// AI prompts for generating dynamic questions

export const QUESTION_GENERATION_PROMPTS = {
  businessValidation: (businessIdea: string) => `
    Analyze this business idea: "${businessIdea}"
    
    Generate a strategic question that helps validate and refine the core concept.
    Focus on:
    - Market viability and demand
    - Unique value proposition
    - Competitive differentiation
    - Core problem being solved
    
    Provide 4-6 answer options that cover different business angles.
    
    Return JSON:
    {
      "question": "Clear, engaging question text",
      "context": "Why this question matters for business success (1-2 sentences)",
      "options": [
        {
          "id": "option1",
          "text": "Option text (clear and specific)",
          "description": "2-3 sentence explanation of this approach",
          "icon": "relevant emoji",
          "businessImplications": ["implication1", "implication2", "implication3"],
          "previewImpact": {
            "action": "content_change",
            "target": "hero_section",
            "changes": {"headline": "example headline", "subtext": "example subtext"},
            "animationDuration": 1000
          }
        }
      ],
      "metadata": {
        "aiReasoning": "Detailed explanation of why this question is important for business validation",
        "estimatedTime": 60,
        "difficultyLevel": "beginner",
        "businessImpact": "high"
      }
    }
  `,
  
  targetAudience: (businessIdea: string, businessType?: string, previousAnswers?: string) => `
    For business idea: "${businessIdea}"
    Business type: ${businessType || 'unknown'}
    ${previousAnswers ? `Previous context: ${previousAnswers}` : ''}
    
    Generate a question about target audience that goes deeper than demographics.
    Focus on:
    - Specific user personas and use cases
    - Pain points and motivations
    - Behavioral patterns and preferences
    - Decision-making criteria
    - Psychographic insights
    
    Options should be specific and actionable, not generic demographic categories.
    
    Return JSON with the same structure as above, but focus the options on:
    - Different user personas with specific needs
    - Various use cases and scenarios
    - Different motivation drivers
    - Behavioral segments
    
    Make each option paint a clear picture of WHO the customer is and WHY they would choose this business.
  `,
  
  featurePrioritization: (businessContext: string, currentAnswers: string) => `
    Business context: ${businessContext}
    Current answers: ${currentAnswers}
    
    Generate a question about feature prioritization using the MoSCoW method.
    Present 6-8 potential features and ask user to categorize them as:
    - Must Have (core functionality)
    - Should Have (important but not critical)
    - Could Have (nice to have)
    - Won't Have (out of scope for now)
    
    Features should be specific to their business type and context.
    
    Return JSON:
    {
      "question": "How would you prioritize these features for your business?",
      "context": "Understanding feature priorities helps us build the right solution first",
      "type": "priority_ranking",
      "options": [
        {
          "id": "feature1",
          "text": "Feature name",
          "description": "What this feature does and why it matters",
          "icon": "emoji",
          "businessImplications": ["impact1", "impact2"],
          "previewImpact": {
            "action": "feature_add",
            "target": "features_section",
            "changes": {"newFeature": "feature_name"},
            "animationDuration": 800
          }
        }
      ],
      "metadata": {
        "aiReasoning": "Feature prioritization helps focus development on what matters most",
        "estimatedTime": 90,
        "difficultyLevel": "intermediate",
        "businessImpact": "high"
      }
    }
  `,
  
  designPreferences: (businessIdea: string, targetAudience?: string) => `
    For business: "${businessIdea}"
    ${targetAudience ? `Target audience: ${targetAudience}` : ''}
    
    Generate questions about brand personality, color psychology, and visual style.
    Focus on:
    - Brand personality traits (professional, playful, luxurious, etc.)
    - Color preferences and psychology
    - Typography style (modern, classic, bold, minimal)
    - Imagery approach (photos, illustrations, icons)
    - Overall aesthetic direction
    
    Provide options that represent different design directions with clear explanations.
    
    Return JSON with 4-5 design direction options that include:
    - Visual style description
    - Color palette suggestions
    - Typography recommendations
    - Brand personality alignment
    - Target audience fit
  `,
  
  technicalRequirements: (businessType: string, complexity: string) => `
    Business type: ${businessType}
    Complexity level: ${complexity}
    
    Generate questions about technical requirements and integrations.
    Focus on:
    - Essential third-party integrations
    - Performance requirements
    - Security considerations
    - Scalability needs
    - Mobile strategy
    - Compliance requirements
    
    Provide options based on the business type and complexity level.
    Options should be practical and business-focused, not overly technical.
    
    Return JSON with 4-6 technical approach options covering:
    - Integration priorities
    - Performance expectations
    - Security requirements
    - Growth planning
  `,
  
  revenueModel: (businessIdea: string, businessType: string, previousAnswers: string) => `
    Business idea: "${businessIdea}"
    Business type: ${businessType}
    Previous answers: ${previousAnswers}
    
    Generate questions about revenue models and monetization strategy.
    Focus on:
    - Primary revenue streams
    - Pricing strategy
    - Payment methods and timing
    - Subscription vs one-time payments
    - Value-based pricing considerations
    - Market positioning impact
    
    Provide 4-6 monetization options that are realistic for this business type.
    Each option should explain the revenue model, pricing approach, and business implications.
    
    Return JSON with monetization strategy options including:
    - Revenue model description
    - Pricing structure
    - Payment flow
    - Pros and cons
    - Market fit assessment
  `,
  
  growthStrategy: (businessContext: string, targetAudience: string) => `
    Business context: ${businessContext}
    Target audience: ${targetAudience}
    
    Generate questions about growth and marketing strategy.
    Focus on:
    - Customer acquisition channels
    - Retention strategies
    - Viral growth opportunities
    - Partnership potential
    - Content marketing approach
    - Community building
    
    Provide options that align with the target audience and business model.
    Each option should explain the growth approach and why it fits this business.
    
    Return JSON with 4-5 growth strategy options covering:
    - Primary acquisition channels
    - Retention tactics
    - Growth mechanisms
    - Resource requirements
    - Expected timeline
  `,
  
  followUpGeneration: (businessIdea: string, previousAnswers: string, gaps: string[]) => `
    Based on this business idea: "${businessIdea}"
    
    Previous answers:
    ${previousAnswers}
    
    Identified gaps in understanding:
    ${gaps.join(', ')}
    
    Generate 1 strategic follow-up question that will help us build the perfect solution.
    
    Requirements:
    - Be conversational and engaging
    - Provide 4-6 specific answer options
    - Focus on the biggest gap in our understanding
    - Drive toward actionable implementation details
    - Maintain momentum and user engagement
    
    Categories to consider (pick the most important gap):
    - Target audience specifics (if not fully defined)
    - Core functionality requirements
    - Visual/UX preferences
    - Technical integrations needed
    - Business model considerations
    - Success metrics and goals
    
    Return JSON:
    {
      "question": "Engaging question that addresses the main gap",
      "context": "Why this question matters now in the flow",
      "category": "audience|features|design|technical|business",
      "priority": "high|medium|low",
      "options": [
        {
          "id": "option1",
          "text": "Clear, specific option",
          "description": "Why this matters",
          "icon": "emoji",
          "businessImplications": ["impact1", "impact2"],
          "previewImpact": {
            "action": "content_change|feature_add|theme_change|layout_update",
            "target": "section_name",
            "changes": {"property": "value"},
            "animationDuration": 1000
          }
        }
      ],
      "followUpLogic": {
        "option1": "next_question_type",
        "option2": "next_question_type"
      },
      "metadata": {
        "aiReasoning": "Why this specific question was chosen",
        "estimatedTime": 45,
        "difficultyLevel": "beginner|intermediate|advanced",
        "businessImpact": "high|medium|low"
      }
    }
  `
}

// Helper function to build contextual prompts
export function buildContextualPrompt(
  promptType: keyof typeof QUESTION_GENERATION_PROMPTS,
  context: Record<string, unknown>
): string {
  switch (promptType) {
    case 'businessValidation':
      return QUESTION_GENERATION_PROMPTS.businessValidation(context.businessIdea as string)
      
    case 'targetAudience':
      return QUESTION_GENERATION_PROMPTS.targetAudience(
        context.businessIdea as string,
        context.businessType as string,
        context.previousAnswers as string
      )
      
    case 'featurePrioritization':
      return QUESTION_GENERATION_PROMPTS.featurePrioritization(
        context.businessContext as string,
        context.currentAnswers as string
      )
      
    case 'designPreferences':
      return QUESTION_GENERATION_PROMPTS.designPreferences(
        context.businessIdea as string,
        context.targetAudience as string
      )
      
    case 'technicalRequirements':
      return QUESTION_GENERATION_PROMPTS.technicalRequirements(
        context.businessType as string,
        context.complexity as string
      )
      
    case 'revenueModel':
      return QUESTION_GENERATION_PROMPTS.revenueModel(
        context.businessIdea as string,
        context.businessType as string,
        context.previousAnswers as string
      )
      
    case 'growthStrategy':
      return QUESTION_GENERATION_PROMPTS.growthStrategy(
        context.businessContext as string,
        context.targetAudience as string
      )
      
    case 'followUpGeneration':
      return QUESTION_GENERATION_PROMPTS.followUpGeneration(
        context.businessIdea as string,
        context.previousAnswers as string,
        context.gaps as string[]
      )
      
    default:
      throw new Error(`Unknown prompt type: ${promptType}`)
  }
}

// Question quality validation
export function validateQuestionStructure(questionData: unknown): boolean {
  try {
    const q = questionData as Record<string, unknown>
    
    // Check required fields
    if (!q.question || !q.context || !q.options || !q.metadata) {
      return false
    }
    
    // Check options structure
    const options = q.options as Array<Record<string, unknown>>
    if (!Array.isArray(options) || options.length < 3 || options.length > 8) {
      return false
    }
    
    // Check each option
    for (const option of options) {
      if (!option.id || !option.text || !option.businessImplications) {
        return false
      }
    }
    
    // Check metadata
    const metadata = q.metadata as Record<string, unknown>
    if (!metadata.aiReasoning || !metadata.estimatedTime || !metadata.difficultyLevel || !metadata.businessImpact) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}