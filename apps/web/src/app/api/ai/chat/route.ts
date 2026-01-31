import { NextRequest, NextResponse } from 'next/server'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger'

interface ChatRequest {
  message: string
  projectId?: string
  context?: {
    businessType?: string
    currentSection?: string
  }
}

async function handleChat(request: NextRequest, { user }: { user: any }) {
  try {
    const body: ChatRequest = await request.json()
    const { message, projectId, context: chatContext } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Log the chat request
    logger.info('AI Chat request', {
      userId: user?.id?.slice(0, 8),
      projectId,
      messageLength: message.length,
      hasContext: !!chatContext,
      quotaConsumed: 0, // TODO: Replace when quota system is ready
      quotaRemaining: 0 // TODO: Replace when quota system is ready
    })

    // Generate contextual AI responses based on the message
    const responses = generateContextualResponse(message, chatContext)
    
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 800))

    return NextResponse.json({
      success: true,
      response: responses.primary,
      suggestions: responses.suggestions,
      metadata: {
        remaining: 0, // TODO: Replace when quota system is ready
        limit: 0 // TODO: Replace when quota system is ready
      }
    })

  } catch (error) {
    logger.error('AI chat error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process chat message',
        code: 'CHAT_ERROR'
      },
      { status: 500 }
    )
  }
}

function generateContextualResponse(message: string, context?: any) {
  const lowerMessage = message.toLowerCase()
  
  // Business analysis responses
  if (lowerMessage.includes('business') || lowerMessage.includes('app') || lowerMessage.includes('idea')) {
    return {
      primary: "I can help you develop your business app idea! Based on your message, I recommend starting with defining your core value proposition. What specific problem does your business solve for customers?",
      suggestions: [
        "Tell me about your target customers",
        "What features are most important?",
        "How will you differentiate from competitors?"
      ]
    }
  }

  // Feature-related responses
  if (lowerMessage.includes('feature') || lowerMessage.includes('add') || lowerMessage.includes('implement')) {
    return {
      primary: "That's a great feature idea! I can help you implement that. Let me break down the best approach for adding this to your app. We'll need to consider user experience, technical feasibility, and business value.",
      suggestions: [
        "Show me how users will interact with this",
        "What's the expected impact on conversions?",
        "Can you help with the technical implementation?"
      ]
    }
  }

  // Design-related responses
  if (lowerMessage.includes('design') || lowerMessage.includes('style') || lowerMessage.includes('color') || lowerMessage.includes('layout')) {
    return {
      primary: "I'll help you create a compelling design! Good design is crucial for user engagement. Based on current best practices, I suggest focusing on clarity, consistency, and mobile responsiveness.",
      suggestions: [
        "Suggest a color scheme for my brand",
        "Help me improve the layout",
        "What design trends should I consider?"
      ]
    }
  }

  // Technical/code responses
  if (lowerMessage.includes('code') || lowerMessage.includes('export') || lowerMessage.includes('technical')) {
    return {
      primary: "I can help with the technical aspects! Your app will be built with modern, production-ready code. We use Next.js, TypeScript, and Tailwind CSS to ensure high performance and maintainability.",
      suggestions: [
        "Show me the code structure",
        "How do I export and deploy?",
        "What technologies are being used?"
      ]
    }
  }

  // Pricing/upgrade responses
  if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('upgrade') || lowerMessage.includes('plan')) {
    return {
      primary: "I'd be happy to explain our pricing plans! We offer flexible options from free to scale. Each plan includes different amounts of AI generations, features, and support levels. Would you like me to help you choose the best plan for your needs?",
      suggestions: [
        "Compare pricing plans",
        "What's included in each plan?",
        "How do I upgrade my account?"
      ]
    }
  }

  // Default helpful response
  return {
    primary: "I'm here to help you build your business app! I can assist with ideation, design, features, technical implementation, and more. What aspect would you like to focus on?",
    suggestions: [
      "Help me refine my business idea",
      "Suggest features for my app",
      "Guide me through the building process"
    ]
  }
}

export const POST = authPresets.authenticated(handleChat)