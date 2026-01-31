// API Route for lightweight first question with projectId
import { NextRequest, NextResponse } from 'next/server'
import { LIGHTWEIGHT_FIRST_QUESTION } from '@/services/refinement/lightweight-first-question'
import type { MCQQuestion } from '@/types/question-flow'
import { logger } from '@/utils/logger';

interface RouteParams {
  params: Promise<{ projectId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params
    
    logger.info('🚀 API: First question request received for project:', projectId);
    
    // Validate projectId
    if (!projectId || projectId === 'undefined') {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }
    
    // Convert lightweight question to MCQ format
    const mcqQuestion: MCQQuestion = {
      id: LIGHTWEIGHT_FIRST_QUESTION.id,
      type: 'single_choice' as const,
      category: LIGHTWEIGHT_FIRST_QUESTION.category as 'audience' | 'features' | 'design' | 'technical' | 'business',
      question: LIGHTWEIGHT_FIRST_QUESTION.question,
      context: LIGHTWEIGHT_FIRST_QUESTION.context,
      options: LIGHTWEIGHT_FIRST_QUESTION.options.map(opt => ({
        id: opt.id,
        text: opt.title,
        description: opt.description,
        businessImplications: [],
        // Minimal preview impact - triggers lightweight theme change
        previewImpact: {
          type: 'theme_change',
          changes: { 
            theme: opt.id,
            mood: opt.shortDescription 
          }
        },
        // Minimal modular impact marker - signals that full data should be fetched via API
        modularPreviewImpact: {
          type: 'modular-transformation',
          modules: {
            // Minimal placeholder - actual data will be fetched from API
            theme: opt.id,
            mood: opt.shortDescription,
            _placeholder: true // Marker to indicate this is minimal data
          }
        }
      })),
      metadata: {
        difficultyLevel: LIGHTWEIGHT_FIRST_QUESTION.difficulty as 'beginner' | 'intermediate' | 'advanced',
        businessImpact: 'high' as const,
        estimatedTime: 30,
        aiReasoning: LIGHTWEIGHT_FIRST_QUESTION.context
      },
      followUpLogic: {
        conditions: [],
        nextQuestionId: null
      },
      paginationEnabled: LIGHTWEIGHT_FIRST_QUESTION.paginationEnabled,
      optionsPerPage: LIGHTWEIGHT_FIRST_QUESTION.optionsPerPage
    }
    
    logger.info('✅ API: Successfully generated first question with', mcqQuestion.options.length, 'options for project', projectId);
    
    return NextResponse.json({
      success: true,
      projectId,
      question: mcqQuestion,
      metadata: {
        stage: 'initial',
        totalSteps: 1,
        apiProvider: 'lightweight-first-question',
        dataSize: 'minimal'
      }
    })
    
  } catch (error) {
    logger.error('❌ API: First question generation failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to generate first question',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, props: RouteParams) {
  // For backward compatibility, also support POST requests
  return GET(request, props) // ✅ Pass props directly (params is Promise)
}