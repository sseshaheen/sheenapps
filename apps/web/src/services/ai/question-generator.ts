// Lazy imports for performance - don't load AI services until needed
import { aiCache } from './cache-service'
import { RobustJSONParser } from './json-parser'
import { logger } from '@/utils/logger';
import type { 
  MCQQuestion, 
  QuestionFlow, 
  BusinessContext, 
  Answer, 
  QuestionGenerationRequest,
  QuestionGenerationResponse,
  QuestionOption,
  PreviewImpact
} from '@/types/question-flow'

export class AIQuestionGenerator {
  private openaiService: any = null
  private anthropicService: any = null
  private aiRefinementBridge: any = null
  private cacheService: typeof aiCache

  constructor() {
    this.cacheService = aiCache
  }

  /**
   * Lazy load AI services only when needed
   */
  private async getAIServices() {
    if (!this.openaiService && typeof window === 'undefined') {
      const [
        { OpenAIService },
        { AnthropicService },
        { AIRefinementBridgeSimple }
      ] = await Promise.all([
        import('./openai-service'),
        import('./anthropic-service'),
        import('../refinement/ai-bridge-simple')
      ])
      
      this.openaiService = new OpenAIService()
      this.anthropicService = new AnthropicService()
      this.aiRefinementBridge = new AIRefinementBridgeSimple()
    }
    
    return {
      openai: this.openaiService,
      anthropic: this.anthropicService,
      bridge: this.aiRefinementBridge
    }
  }

  async generateQuestionFlow(businessIdea: string): Promise<QuestionFlow> {
    logger.info('Generator: Starting question flow generation for:', businessIdea);
    
    // Return default flow on client side
    if (typeof window !== 'undefined') {
      logger.info('Generator: Using default flow (client-side);')
      const defaultFlow = await this.generateDefaultQuestionFlow(businessIdea)
      console.log('Generator: Default flow created:', {
        questionsCount: defaultFlow.questions.length,
        firstQuestion: defaultFlow.questions[0]?.question
      })
      return defaultFlow
    }

    // Lazy load AI services on server side
    const { openai } = await this.getAIServices()
    logger.info('Generator: AI services loaded, available:', !!openai);
    
    try {
      // NEW: Use AI Refinement Bridge for enhanced question generation
      const { questions, metadata } = await this.generateRefinementQuestions(businessIdea)
      
      if (questions.length > 0) {
        console.log('Generator: Using AI refinement bridge:', {
          questionsCount: questions.length,
          stage: metadata.stage
        })
        
        // Create business context from business idea
        const businessContext = await this.analyzeBusinessContext(businessIdea)
        return this.createAdaptiveFlow(questions, businessContext)
      }
      
      // Fallback to original method if refinement bridge fails
      logger.info('Generator: Falling back to original method');
      
      // 1. Analyze business idea for context
      const analysis = await this.analyzeBusinessContext(businessIdea)
      
      // 2. Generate initial question set
      const initialQuestions = await this.generateFoundationQuestions(analysis)
      
      // 3. Create adaptive flow with branching logic
      return this.createAdaptiveFlow(initialQuestions, analysis)
    } catch (error) {
      logger.error('Error generating question flow:', error);
      logger.info('Generator: Using fallback default flow due to error');
      return await this.generateDefaultQuestionFlow(businessIdea)
    }
  }

  /**
   * Generate questions using the AI Refinement Bridge with robust validation
   */
  private async generateRefinementQuestions(
    businessIdea: string,
    previousChoices: Array<any> = []
  ): Promise<{ questions: MCQQuestion[], metadata: any }> {
    try {
      logger.info('🤖 Calling AI Refinement Bridge for:', businessIdea);
      
      // Extract business type from idea
      const businessType = this.extractBusinessType(businessIdea)
      
      // Lazy load AI services and call external AI through refinement bridge
      const { bridge } = await this.getAIServices()
      if (!bridge) {
        throw new Error('AI Refinement Bridge not available')
      }
      const result = bridge.generateFallbackQuestions()
      
      console.log('🤖 AI Bridge Response:', {
        questionCount: result.questions.length,
        metadata: result.metadata
      })
      
      // Validate the response before using it
      const validation = this.validateAIResponse(result)
      
      if (!validation.isValid) {
        logger.warn('⚠️ AI response validation failed:', validation.errors);
        throw new Error(`AI response validation failed: ${validation.errors.join(', ')}`)
      }
      
      // Apply any necessary fixes to ensure compatibility
      const sanitizedQuestions = this.sanitizeAIQuestions(result.questions)
      
      logger.info('✅ AI questions validated and sanitized successfully');
      
      return {
        questions: sanitizedQuestions,
        metadata: result.metadata
      }
      
    } catch (error) {
      logger.error('❌ AI Refinement Bridge failed:', error);
      throw error
    }
  }

  /**
   * Extract business type from user's business idea
   */
  private extractBusinessType(businessIdea: string): string {
    const idea = businessIdea.toLowerCase()
    
    // Business type detection patterns
    const typePatterns: Record<string, string[]> = {
      'salon': ['salon', 'hair', 'beauty', 'spa', 'barber'],
      'restaurant': ['restaurant', 'cafe', 'food', 'dining', 'kitchen'],
      'ecommerce': ['shop', 'store', 'sell', 'product', 'ecommerce', 'retail'],
      'healthcare': ['doctor', 'clinic', 'medical', 'health', 'therapy'],
      'consulting': ['consulting', 'consultant', 'advisory', 'services'],
      'fitness': ['gym', 'fitness', 'yoga', 'training', 'workout'],
      'education': ['school', 'course', 'learning', 'education', 'training']
    }
    
    // Find matching business type
    for (const [type, patterns] of Object.entries(typePatterns)) {
      if (patterns.some(pattern => idea.includes(pattern))) {
        return type
      }
    }
    
    return 'services' // Default fallback
  }

  /**
   * Validate AI response to ensure it meets our requirements
   */
  private validateAIResponse(response: { questions: MCQQuestion[], metadata: any }): {
    isValid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []
    
    // Check if response has questions
    if (!response.questions || !Array.isArray(response.questions)) {
      errors.push('Response must contain questions array')
      return { isValid: false, errors, warnings }
    }
    
    if (response.questions.length === 0) {
      errors.push('Response must contain at least one question')
      return { isValid: false, errors, warnings }
    }
    
    // Validate each question
    response.questions.forEach((question, index) => {
      const questionErrors = this.validateQuestion(question, index)
      errors.push(...questionErrors)
    })
    
    // Check metadata
    if (!response.metadata) {
      warnings.push('Response missing metadata')
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Validate individual question structure
   */
  private validateQuestion(question: MCQQuestion, index: number): string[] {
    const errors: string[] = []
    const prefix = `Question ${index + 1}`
    
    // Required fields
    if (!question.id) {
      errors.push(`${prefix}: Missing id`)
    }
    
    if (!question.question || typeof question.question !== 'string') {
      errors.push(`${prefix}: Missing or invalid question text`)
    }
    
    if (!question.type) {
      errors.push(`${prefix}: Missing question type`)
    }
    
    if (!question.category) {
      errors.push(`${prefix}: Missing category`)
    }
    
    // Validate options
    if (!question.options || !Array.isArray(question.options)) {
      errors.push(`${prefix}: Missing or invalid options array`)
      return errors
    }
    
    if (question.options.length < 2) {
      errors.push(`${prefix}: Must have at least 2 options`)
    }
    
    if (question.options.length > 8) {
      errors.push(`${prefix}: Should not have more than 8 options`)
    }
    
    // Validate each option
    question.options.forEach((option, optIndex) => {
      const optionErrors = this.validateQuestionOption(option, index, optIndex)
      errors.push(...optionErrors)
    })
    
    return errors
  }

  /**
   * Validate individual question option
   */
  private validateQuestionOption(option: QuestionOption, questionIndex: number, optionIndex: number): string[] {
    const errors: string[] = []
    const prefix = `Question ${questionIndex + 1}, Option ${optionIndex + 1}`
    
    if (!option.id) {
      errors.push(`${prefix}: Missing option id`)
    }
    
    if (!option.text || typeof option.text !== 'string') {
      errors.push(`${prefix}: Missing or invalid option text`)
    }
    
    if (option.text.length > 100) {
      errors.push(`${prefix}: Option text too long (max 100 characters)`)
    }
    
    // Validate preview impact if present
    if (option.previewImpact && !this.isValidPreviewImpact(option.previewImpact)) {
      errors.push(`${prefix}: Invalid preview impact structure`)
    }
    
    return errors
  }

  /**
   * Check if preview impact has valid structure
   */
  private isValidPreviewImpact(impact: any): boolean {
    if (!impact || typeof impact !== 'object') {
      return false
    }
    
    // Must have type
    if (!impact.type || typeof impact.type !== 'string') {
      return false
    }
    
    // Valid impact types
    const validTypes = ['layout_update', 'theme_change', 'feature_addition', 'content_change', 'style_refinement']
    if (!validTypes.includes(impact.type)) {
      return false
    }
    
    return true
  }

  /**
   * Sanitize and fix AI questions to ensure compatibility
   */
  private sanitizeAIQuestions(questions: MCQQuestion[]): MCQQuestion[] {
    return questions.map((question, index) => {
      // Ensure required fields exist
      const sanitized: MCQQuestion = {
        id: question.id || `ai_question_${Date.now()}_${index}`,
        type: question.type || 'single_choice',
        category: question.category || 'business',
        question: question.question || 'What would you prefer?',
        context: question.context,
        options: this.sanitizeQuestionOptions(question.options || []),
        metadata: {
          difficultyLevel: question.metadata?.difficultyLevel || 'beginner',
          businessImpact: question.metadata?.businessImpact || 'medium',
          estimatedTime: question.metadata?.estimatedTime || 30,
          aiReasoning: question.metadata?.aiReasoning || 'AI-generated question'
        },
        followUpLogic: question.followUpLogic || {
          conditions: [],
          nextQuestionId: null
        }
      }
      
      return sanitized
    })
  }

  /**
   * Sanitize question options
   */
  private sanitizeQuestionOptions(options: QuestionOption[]): QuestionOption[] {
    return options.map((option, index) => ({
      id: option.id || `option_${Date.now()}_${index}`,
      text: option.text || `Option ${index + 1}`,
      description: option.description,
      businessImplications: option.businessImplications || [],
      previewImpact: this.sanitizePreviewImpact(option.previewImpact)
    }))
  }

  /**
   * Sanitize preview impact to ensure it's valid
   */
  private sanitizePreviewImpact(impact: any): PreviewImpact {
    if (!impact || !this.isValidPreviewImpact(impact)) {
      // Return safe fallback impact
      return {
        action: 'content_change',
        target: 'status',
        changes: {
          'status-message': 'Choice applied successfully'
        },
        animationDuration: 500
      }
    }
    
    return impact as PreviewImpact
  }

  async generateFollowUpQuestion(
    previousAnswers: Answer[], 
    context: BusinessContext
  ): Promise<MCQQuestion | null> {
    // Return null on client side
    if (typeof window !== 'undefined') {
      return null
    }
    
    // Lazy load AI services
    const { openai } = await this.getAIServices()
    if (!openai) {
      return null
    }
    
    try {
      // Check cache first
      const cacheKey = this.generateFollowUpCacheKey(previousAnswers, context)
      const cached = await this.cacheService.get<MCQQuestion>('followup_question', cacheKey, 'openai')
      if (cached) {
        return cached
      }

      // Dynamic follow-up based on answer patterns
      const prompt = this.buildFollowUpPrompt(previousAnswers, context)
      const response = await openai.generateCompletion(prompt)
      const question = this.parseQuestionResponse(response)

      // Cache the result
      if (question) {
        await this.cacheService.set('followup_question', cacheKey, 'openai', question)
      }

      return question
    } catch (error) {
      logger.error('Error generating follow-up question:', error);
      return null
    }
  }

  private async analyzeBusinessContext(businessIdea: string): Promise<BusinessContext> {
    const prompt = `
Analyze this business idea and extract key context: "${businessIdea}"

Determine:
1. Business type (ecommerce, saas, service, marketplace, content, etc.)
2. Industry category (retail, technology, healthcare, finance, etc.)
3. Complexity level (simple, moderate, complex)
4. Initial target audience insights

Return JSON:
{
  "businessType": "string",
  "industryCategory": "string", 
  "complexity": "simple|moderate|complex",
  "targetAudience": "initial insights or null",
  "keyInsights": ["insight1", "insight2", "insight3"]
}
`

    // Lazy load AI services
    const { anthropic } = await this.getAIServices()
    if (!anthropic) {
      // Fallback to basic context
      return {
        originalIdea: businessIdea,
        complexity: 'moderate',
        previousAnswers: []
      }
    }
    
    try {
      const response = await anthropic.generateCompletion(prompt)
      const analysis = RobustJSONParser.parse<{
        businessType: string
        industryCategory: string
        complexity: 'simple' | 'moderate' | 'complex'
        targetAudience?: string
        keyInsights: string[]
      }>(response)

      return {
        originalIdea: businessIdea,
        businessType: analysis.businessType,
        targetAudience: analysis.targetAudience,
        industryCategory: analysis.industryCategory,
        complexity: analysis.complexity,
        previousAnswers: []
      }
    } catch (error) {
      logger.error('Error analyzing business context:', error);
      // Fallback to basic context
      return {
        originalIdea: businessIdea,
        complexity: 'moderate',
        previousAnswers: []
      }
    }
  }

  private async generateFoundationQuestions(context: BusinessContext): Promise<MCQQuestion[]> {
    const questions: MCQQuestion[] = []

    // Generate business validation question
    const validationQuestion = await this.generateBusinessValidationQuestion(context)
    if (validationQuestion) questions.push(validationQuestion)

    // Generate target audience question
    const audienceQuestion = await this.generateTargetAudienceQuestion(context)
    if (audienceQuestion) questions.push(audienceQuestion)

    // Generate core features question based on business type
    const featuresQuestion = await this.generateCoreFeatureQuestion(context)
    if (featuresQuestion) questions.push(featuresQuestion)

    return questions
  }

  private async generateBusinessValidationQuestion(context: BusinessContext): Promise<MCQQuestion | null> {
    const prompt = `
Based on this business idea: "${context.originalIdea}"

Generate a strategic validation question that helps refine the core concept.

Focus on:
- Market viability and demand
- Unique value proposition  
- Competitive differentiation
- Core problem being solved

Provide 4-6 answer options covering different business angles.

Return JSON:
{
  "question": "string",
  "context": "why this question matters for business success",
  "options": [
    {
      "id": "option1",
      "text": "Option text",
      "description": "Detailed explanation",
      "icon": "💼",
      "businessImplications": ["implication1", "implication2"],
      "previewImpact": {
        "action": "content_change",
        "target": "hero_section", 
        "changes": {"headline": "new headline"},
        "animationDuration": 1000
      }
    }
  ],
  "metadata": {
    "aiReasoning": "Why this question is important",
    "estimatedTime": 60,
    "difficultyLevel": "beginner",
    "businessImpact": "high"
  }
}
`

    // Lazy load AI services
    const { openai } = await this.getAIServices()
    if (!openai) {
      return null
    }
    
    try {
      const response = await openai.generateCompletion(prompt)
      const data = RobustJSONParser.parse<{
        question: string
        context: string
        options: Array<{
          id: string
          text: string
          description?: string
          icon?: string
          businessImplications: string[]
          previewImpact: PreviewImpact
        }>
        metadata: {
          aiReasoning: string
          estimatedTime: number
          difficultyLevel: 'beginner' | 'intermediate' | 'advanced'
          businessImpact: 'high' | 'medium' | 'low'
        }
      }>(response)

      return {
        id: `validation_${Date.now()}`,
        type: 'single_choice',
        category: 'business',
        question: data.question,
        context: data.context,
        options: data.options.map(opt => ({
          ...opt,
          followUpTrigger: 'business_model_question'
        })),
        metadata: data.metadata,
        followUpLogic: {},
        visualHints: {
          showPreviewHighlight: true,
          previewAnimation: 'highlight_value_prop',
          relatedFeatures: ['hero_section', 'value_proposition']
        }
      }
    } catch (error) {
      logger.error('Error generating business validation question:', error);
      return null
    }
  }

  private async generateTargetAudienceQuestion(context: BusinessContext): Promise<MCQQuestion | null> {
    const prompt = `
For business idea: "${context.originalIdea}"
Business type: ${context.businessType || 'unknown'}

Generate a question about target audience that goes deeper than demographics.

Focus on:
- Specific user personas and use cases
- Pain points and motivations  
- Behavioral patterns and preferences
- Decision-making criteria

Options should be specific and actionable, not generic.

Return JSON with same structure as previous example.
`

    // Lazy load AI services  
    const { anthropic } = await this.getAIServices()
    if (!anthropic) {
      return null
    }
    
    try {
      const response = await anthropic.generateCompletion(prompt)
      const data = RobustJSONParser.parse<{
        question: string
        context: string
        options: Array<{
          id: string
          text: string
          description?: string
          icon?: string
          businessImplications: string[]
          previewImpact: PreviewImpact
        }>
        metadata: {
          aiReasoning: string
          estimatedTime: number
          difficultyLevel: 'beginner' | 'intermediate' | 'advanced'
          businessImpact: 'high' | 'medium' | 'low'
        }
      }>(response)

      return {
        id: `audience_${Date.now()}`,
        type: 'single_choice',
        category: 'audience',
        question: data.question,
        context: data.context,
        options: data.options.map(opt => ({
          ...opt,
          followUpTrigger: 'feature_prioritization'
        })),
        metadata: data.metadata,
        followUpLogic: {},
        visualHints: {
          showPreviewHighlight: true,
          previewAnimation: 'update_content_tone',
          relatedFeatures: ['testimonials', 'content_sections', 'imagery']
        }
      }
    } catch (error) {
      logger.error('Error generating target audience question:', error);
      return null
    }
  }

  private async generateCoreFeatureQuestion(context: BusinessContext): Promise<MCQQuestion | null> {
    const businessTypeFeatures = this.getBusinessTypeFeatures(context.businessType)
    
    const prompt = `
For ${context.businessType || 'general'} business: "${context.originalIdea}"

Generate a feature prioritization question using the MoSCoW method.
Present 6-8 potential features specific to this business type.

Suggested features for ${context.businessType}: ${businessTypeFeatures.join(', ')}

Ask user to categorize features as:
- Must Have (core functionality)
- Should Have (important but not critical)  
- Could Have (nice to have)
- Won't Have (out of scope for now)

Return JSON with multiple_choice type and feature options.
`

    // Lazy load AI services
    const { openai } = await this.getAIServices()
    if (!openai) {
      return null
    }
    
    try {
      const response = await openai.generateCompletion(prompt)
      const data = RobustJSONParser.parse<{
        question: string
        context: string
        options: Array<{
          id: string
          text: string
          description?: string
          icon?: string
          businessImplications: string[]
          previewImpact: PreviewImpact
        }>
        metadata: {
          aiReasoning: string
          estimatedTime: number
          difficultyLevel: 'beginner' | 'intermediate' | 'advanced'
          businessImpact: 'high' | 'medium' | 'low'
        }
      }>(response)

      return {
        id: `features_${Date.now()}`,
        type: 'multiple_choice',
        category: 'features',
        question: data.question,
        context: data.context,
        options: data.options,
        metadata: data.metadata,
        followUpLogic: {},
        visualHints: {
          showPreviewHighlight: true,
          previewAnimation: 'add_feature_sections',
          relatedFeatures: ['features_grid', 'navigation', 'cta_buttons']
        }
      }
    } catch (error) {
      logger.error('Error generating core feature question:', error);
      return null
    }
  }

  private buildFollowUpPrompt(answers: Answer[], context: BusinessContext): string {
    const answersText = answers.map(a => `Q: ${a.questionId}\nA: ${a.answer}`).join('\n')
    
    return `
Based on this business idea: "${context.originalIdea}"

Previous answers:
${answersText}

Generate 1 strategic follow-up question that will help us build the perfect solution.

Requirements:
- Be conversational and engaging
- Provide 4-6 specific answer options
- Focus on gaps in our understanding
- Drive toward actionable implementation details

Categories to consider:
- Target audience specifics (if not fully defined)
- Core functionality requirements
- Visual/UX preferences  
- Technical integrations needed
- Business model considerations
- Success metrics and goals

Return JSON:
{
  "question": "string",
  "context": "why this question matters",
  "options": ["option1", "option2", ...],
  "category": "audience|features|design|technical|business",
  "priority": "high|medium|low",
  "followUpLogic": {
    "option1": "next_question_type",
    "option2": "next_question_type"
  }
}
`
  }

  private parseQuestionResponse(response: string): MCQQuestion | null {
    try {
      const data = RobustJSONParser.parse<{
        question: string
        context: string
        options: string[]
        category: 'audience' | 'features' | 'design' | 'technical' | 'business'
        priority: 'high' | 'medium' | 'low'
        followUpLogic: Record<string, string>
      }>(response)

      const options: QuestionOption[] = data.options.map((text, index) => ({
        id: `option_${index}`,
        text,
        businessImplications: [],
        previewImpact: {
          action: 'content_change',
          target: 'preview_section',
          changes: { 'preview-content': text },
          animationDuration: 800
        }
      }))

      return {
        id: `followup_${Date.now()}`,
        type: 'single_choice',
        category: data.category,
        question: data.question,
        context: data.context,
        options,
        metadata: {
          aiReasoning: `Generated based on previous answers to address gaps in ${data.category}`,
          estimatedTime: 45,
          difficultyLevel: 'intermediate',
          businessImpact: data.priority
        },
        followUpLogic: data.followUpLogic
      }
    } catch (error) {
      logger.error('Error parsing question response:', error);
      return null
    }
  }

  private createAdaptiveFlow(questions: MCQQuestion[], context: BusinessContext): QuestionFlow {
    return {
      id: `flow_${Date.now()}`,
      businessContext: context,
      questions,
      currentQuestionIndex: 0,
      completionPercentage: 0,
      engagementScore: 0,
      adaptivePath: ['foundation', 'refinement', 'optimization']
    }
  }

  private getBusinessTypeFeatures(businessType?: string): string[] {
    const featureMap: Record<string, string[]> = {
      ecommerce: ['Shopping Cart', 'Product Catalog', 'Payment Processing', 'Inventory Management', 'Order Tracking', 'Customer Reviews', 'Wish Lists', 'Discount Codes'],
      saas: ['User Dashboard', 'Subscription Management', 'API Integration', 'Analytics Reporting', 'Team Collaboration', 'Data Export', 'Custom Branding', 'SSO Authentication'],
      service: ['Online Booking', 'Service Packages', 'Client Portal', 'Appointment Scheduling', 'Payment Processing', 'Service Gallery', 'Contact Forms', 'Testimonials'],
      marketplace: ['Vendor Registration', 'Product Listings', 'Commission System', 'Search & Filters', 'Rating System', 'Message Center', 'Payment Processing', 'Dispute Resolution'],
      content: ['Content Management', 'Search Functionality', 'Social Sharing', 'Comment System', 'Newsletter Signup', 'Content Categories', 'Author Profiles', 'Archive System']
    }

    return featureMap[businessType || 'general'] || [
      'Contact Forms', 'Social Media Integration', 'Newsletter Signup', 'Analytics Tracking', 
      'SEO Optimization', 'Mobile Optimization', 'Security Features', 'Performance Optimization'
    ]
  }

  private generateFollowUpCacheKey(answers: Answer[], context: BusinessContext): string {
    const answersHash = answers.map(a => `${a.questionId}:${a.answer}`).join('|')
    return `followup:${context.originalIdea.slice(0, 50)}:${answersHash}`.replace(/\s+/g, '_')
  }

  // Fallback for client-side - using lazy-loaded data
  private async generateDefaultQuestionFlow(businessIdea: string): Promise<QuestionFlow> {
    // Lazy load the default questions data
    const { generateDefaultQuestionFlow } = await import('@/data/default-questions')
    return generateDefaultQuestionFlow(businessIdea)
  }
}