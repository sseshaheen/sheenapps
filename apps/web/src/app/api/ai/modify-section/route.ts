import { NextRequest, NextResponse } from 'next/server'
import { mockAIService } from '@/services/ai/mock-ai-service'
import { logger } from '@/utils/logger';

export async function POST(request: NextRequest) {
  try {
    logger.info('🌐 API: Section modification request received')
    
    const body = await request.json()
    const { action, sectionType, userInput, businessContext, currentContent } = body
    
    // Simulate network delay for realistic behavior
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Use the existing mock AI service
    const response = await mockAIService.modifySection({
      action,
      sectionType, 
      userInput,
      businessContext,
      currentContent
    })
    
    logger.info('🌐 API: Section modification completed')
    
    return NextResponse.json({
      success: true,
      data: response
    })
    
  } catch (error) {
    logger.error('🌐 API: Section modification failed:', error)
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'MODIFICATION_FAILED',
        message: 'Failed to modify section',
        details: error.message
      }
    }, { status: 500 })
  }
}