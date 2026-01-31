/**
 * Business Context Service
 * Handles all business context building logic
 */

import { useQuestionFlowStore } from '@/store/question-flow-store'
import { getBusinessNameForLayout } from '@/config/business-mappings'
import type { QuestionOption } from '@/types/question-flow'

export interface BusinessContext {
  type: string
  businessName: string
  originalIdea: string
  targetAudience: string[]
  industryCategory?: string
  selectedPersonality: string
  layout: string | null
  personality: string
  style: string
  previousAnswers: any[]
  complexity: string
}

export class BusinessContextService {
  /**
   * Build business context for AI section editing
   */
  static buildBusinessContext(
    currentPreview: string | null,
    currentLayoutId: string,
    currentQuestionOptions?: QuestionOption[]
  ): BusinessContext {
    const questionFlowState = useQuestionFlowStore.getState()
    const selectedChoiceId = currentPreview
    const selectedChoice = currentQuestionOptions?.find(opt => opt.id === selectedChoiceId)

    // Check if this is a salon business
    const isSalon = this.isSalonBusiness(questionFlowState.businessContext)

    // Get appropriate business name
    const businessName = getBusinessNameForLayout(
      selectedChoiceId || currentLayoutId,
      isSalon
    )

    return {
      type: isSalon ? 'salon' : (questionFlowState.businessContext?.businessType || 'general_business'),
      businessName,
      originalIdea: questionFlowState.businessContext?.originalIdea || '',
      targetAudience: questionFlowState.businessContext?.targetAudience 
        ? [questionFlowState.businessContext.targetAudience] 
        : [],
      industryCategory: questionFlowState.businessContext?.industryCategory,
      selectedPersonality: selectedChoice?.text || '',
      layout: selectedChoiceId,
      personality: selectedChoice?.text || selectedChoiceId || '',
      style: selectedChoice?.description || '',
      previousAnswers: questionFlowState.businessContext?.previousAnswers || [],
      complexity: questionFlowState.businessContext?.complexity || 'moderate'
    }
  }

  /**
   * Check if the business is a salon
   */
  private static isSalonBusiness(businessContext: any): boolean {
    return businessContext?.originalIdea?.toLowerCase().includes('salon') ||
           businessContext?.businessType === 'salon'
  }
}