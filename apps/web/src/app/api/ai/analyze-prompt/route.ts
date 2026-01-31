// API Endpoint - Prompt Analysis & Choice Generation
// Combines prompt analysis and intelligent choice generation in one call

import { NextRequest, NextResponse } from 'next/server'
import { hybridPromptAnalyzer } from '@/services/ai/hybrid-prompt-analyzer'
import { choiceGenerator } from '@/services/ai/choice-generator'
import { logger } from '@/utils/logger';
import { normalizeLocale } from '@/services/ai/locale-aware-prompts';
import { authPresets } from '@/lib/auth-middleware'

// Max prompt length to prevent token abuse (5000 chars ≈ ~1250 tokens)
const MAX_PROMPT_LENGTH = 5000

export interface PromptAnalysisRequest {
  prompt: string                      // User's business idea prompt
  options?: {
    numberOfChoices?: number          // How many choices to generate (default: 3)
    includeCustomOption?: boolean     // Include custom prompt option (default: true)
  }
}

export interface PromptAnalysisResponse {
  success: boolean
  
  // Prompt analysis results
  analysis: {
    businessType: string
    businessName?: string
    confidence: number
    analysisQuality: 'basic' | 'good' | 'detailed'
    extractedInfo: {
      services: string[]
      personality: string[]
      targetAudience: string[]
      functionalRequirements: string[]
    }
    missingInformation: string[]
  }
  
  // Generated choices
  choices: Array<{
    id: string
    title: string
    description: string
    tags: string[]
    preview: {
      colorScheme: string
      example: string
    }
    confidence: number
    targetAudience: string[]
  }>
  
  // Custom option
  customOption?: {
    id: 'custom'
    title: string
    description: string
    promptTemplate: string
    examples: string[]
  }
  
  // Follow-up and guidance
  followUpQuestions: string[]
  suggestions: {
    nextSteps: string[]
    improvementTips: string[]
  }
  
  // Metadata
  processingTime: number
  requestId: string
}

async function handleAnalyzePrompt(request: NextRequest, { user }: { user: any }) {
  const startTime = Date.now()
  const requestId = `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

  // Parse JSON with proper error handling
  let body: PromptAnalysisRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON',
          retryable: false
        }
      },
      { status: 400 }
    )
  }

  try {
    // Validate request - prompt exists
    if (!body.prompt || body.prompt.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PROMPT',
            message: 'Prompt cannot be empty',
            retryable: false
          }
        },
        { status: 400 }
      )
    }

    const prompt = body.prompt.trim()

    // Validate prompt length to prevent token abuse
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PROMPT_TOO_LONG',
            message: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
            retryable: false
          }
        },
        { status: 400 }
      )
    }

    const options = body.options || {}

    // Extract and normalize locale at route boundary for consistent downstream handling
    const rawLocale = request.headers.get('x-sheen-locale')
    const locale = rawLocale ? normalizeLocale(rawLocale) : undefined

    // Log without user content (privacy)
    logger.info('[AnalyzePrompt] Request received', {
      requestId,
      promptLength: prompt.length,
      locale: locale || 'default',
      userId: user?.id?.slice(0, 8) || 'unknown'
    })

    // Step 1: Analyze the prompt (uses LLM for non-English, keyword for English)
    logger.info('📊 Analyzing user prompt...');
    const promptAnalysis = await hybridPromptAnalyzer.analyzePrompt(prompt, locale)

    // Step 2: Generate choices based on analysis
    logger.info('🎯 Generating intelligent choices...');
    // Clamp numberOfChoices to reasonable range (1-6) to prevent abuse
    const clampedNumberOfChoices = Math.max(1, Math.min(6, options.numberOfChoices || 3))
    const choiceGenerationResult = await choiceGenerator.generateChoices({
      promptAnalysis,
      numberOfChoices: clampedNumberOfChoices,
      includeCustomOption: options.includeCustomOption ?? true
    })

    // Step 3: Build response
    const processingTime = Date.now() - startTime

    const response: PromptAnalysisResponse = {
      success: true,
      
      analysis: {
        businessType: promptAnalysis.businessType,
        businessName: promptAnalysis.businessName,
        confidence: promptAnalysis.confidence,
        analysisQuality: promptAnalysis.analysisQuality,
        extractedInfo: {
          services: promptAnalysis.services,
          personality: promptAnalysis.personality,
          targetAudience: promptAnalysis.targetAudience,
          functionalRequirements: promptAnalysis.functionalRequirements
        },
        missingInformation: promptAnalysis.missingInformation
      },
      
      choices: choiceGenerationResult.choices.map(choice => ({
        id: choice.id,
        title: choice.title,
        description: choice.description,
        tags: choice.tags,
        preview: choice.preview,
        confidence: choice.confidence,
        targetAudience: choice.targetAudience
      })),
      
      customOption: choiceGenerationResult.customOption,
      
      followUpQuestions: choiceGenerationResult.followUpQuestions,
      
      suggestions: {
        nextSteps: generateNextSteps(promptAnalysis, choiceGenerationResult),
        improvementTips: generateImprovementTips(promptAnalysis)
      },
      
      processingTime,
      requestId
    }

    // Log without user content (privacy)
    logger.info('[AnalyzePrompt] Response generated', {
      requestId,
      businessType: promptAnalysis.businessType,
      analysisQuality: promptAnalysis.analysisQuality,
      choicesGenerated: response.choices.length,
      confidence: promptAnalysis.confidence,
      processingTime
    })

    return NextResponse.json(response)

  } catch (error) {
    logger.error('[AnalyzePrompt] Error:', error);

    const processingTime = Date.now() - startTime

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ANALYSIS_ERROR',
          message: 'Failed to analyze prompt and generate choices',
          details: process.env.NODE_ENV === 'development'
            ? (error instanceof Error ? error.message : String(error))
            : undefined,
          retryable: true
        },
        processingTime,
        requestId
      },
      { status: 500 }
    )
  }
}

// Export authenticated POST handler
export const POST = authPresets.authenticated(handleAnalyzePrompt)

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    switch (action) {
      case 'examples':
        return NextResponse.json({
          examples: [
            {
              prompt: "I need a booking app for my salon",
              expectedAnalysis: {
                businessType: "salon",
                services: ["booking"],
                analysisQuality: "basic"
              }
            },
            {
              prompt: "I want to create a luxury spa website called 'Serenity Wellness' that offers premium massage therapy, facials, and wellness treatments for high-end clients who value relaxation and self-care",
              expectedAnalysis: {
                businessType: "spa",
                businessName: "Serenity Wellness",
                services: ["massage therapy", "facials", "wellness treatments"],
                personality: ["luxury"],
                targetAudience: ["luxury_seekers"],
                analysisQuality: "detailed"
              }
            },
            {
              prompt: "Family restaurant in downtown area serving comfort food with takeout and delivery options",
              expectedAnalysis: {
                businessType: "restaurant",
                services: ["takeout", "delivery"],
                targetAudience: ["families"],
                location: { specific: "downtown" },
                analysisQuality: "good"
              }
            }
          ]
        })

      case 'test':
        // Gate LLM-calling test endpoint to development only
        if (process.env.NODE_ENV !== 'development') {
          return NextResponse.json(
            { error: 'Test endpoint is only available in development' },
            { status: 403 }
          )
        }

        const testPrompt = url.searchParams.get('prompt')
        const testLocale = url.searchParams.get('locale') || undefined
        if (!testPrompt) {
          return NextResponse.json({ error: 'Prompt parameter required for testing' }, { status: 400 })
        }

        // Also enforce length limit on test endpoint
        if (testPrompt.length > MAX_PROMPT_LENGTH) {
          return NextResponse.json(
            { error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` },
            { status: 400 }
          )
        }

        const testAnalysis = await hybridPromptAnalyzer.analyzePrompt(testPrompt, testLocale)
        return NextResponse.json({
          prompt: testPrompt,
          locale: testLocale || 'auto-detected',
          analysis: testAnalysis,
          timestamp: new Date().toISOString()
        })

      default:
        return NextResponse.json({
          endpoint: '/api/ai/analyze-prompt',
          description: 'Analyzes user prompts and generates intelligent choices',
          methods: {
            'POST': 'Analyze prompt and generate choices (requires auth)',
            'GET ?action=examples': 'Get example prompts and expected analysis',
            'GET ?action=test&prompt=...': 'Test prompt analysis (dev only)'
          },
          exampleRequest: {
            prompt: "I need a booking app for my luxury hair salon that serves busy professionals",
            options: {
              numberOfChoices: 3,
              includeCustomOption: true
            }
          },
          limits: {
            maxPromptLength: MAX_PROMPT_LENGTH,
            maxChoices: 6
          }
        })
    }
  } catch (error) {
    logger.error('❌ Prompt Analysis API: GET error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}

// Helper functions
function generateNextSteps(analysis: any, choiceResult: any): string[] {
  const steps = []

  if (choiceResult.choices.length > 0) {
    steps.push('Review the generated options and select the one that best matches your vision')
  }

  if (analysis.missingInformation.length > 0) {
    steps.push('Consider providing more details about your business to get more personalized options')
  }

  if (analysis.analysisQuality === 'basic') {
    steps.push('Try describing your target audience and desired business personality for better results')
  }

  steps.push('You can customize any option or use the custom option to describe exactly what you want')

  return steps
}

function generateImprovementTips(analysis: any): string[] {
  const tips = []

  if (analysis.services.length === 0) {
    tips.push('Mention specific services you offer (e.g., "haircuts and coloring" instead of just "salon")')
  }

  if (analysis.personality.length === 0) {
    tips.push('Describe the personality you want (e.g., "luxury," "friendly," "modern," "professional")')
  }

  if (analysis.targetAudience.length === 0) {
    tips.push('Specify your target audience (e.g., "busy professionals," "families," "luxury seekers")')
  }

  if (analysis.analysisQuality === 'basic') {
    tips.push('Add more details about your vision - the more context, the better the results')
  }

  return tips
}