import { NextRequest } from 'next/server'
import { RealAIService } from '@/services/ai/real-ai-service'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger';

// 🛡️ Protect this API route with authentication and rate limiting
async function handleStream(request: NextRequest, { user }: { user: any }) {
  try {
    const { idea, serviceKey } = await request.json()
    
    if (!idea) {
      return new Response(
        JSON.stringify({ error: 'Business idea is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    logger.info('🌊 Stream analysis request received:', { 
      ideaLength: idea.length, 
      service: serviceKey ? 'configured' : 'default',
      userId: user?.id ? user.id.slice(0, 8) : 'anonymous',
      hasUser: !!user?.id
    })

    const aiService = new RealAIService()
    
    // Create a readable stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const aiStream = aiService.analyzeBusinessIdeaStream(idea, serviceKey)
          
          for await (const chunk of aiStream) {
            const data = `data: ${JSON.stringify(chunk)}\n\n`
            controller.enqueue(encoder.encode(data))
          }
          
          controller.close()
        } catch (error) {
          logger.error('Streaming error:', error)
          const errorChunk = {
            type: 'error',
            content: 'Stream failed, but we can still help you build your business!'
          }
          const data = `data: ${JSON.stringify(errorChunk)}\n\n`
          controller.enqueue(encoder.encode(data))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
    
  } catch (error) {
    logger.error('Stream setup error:', error)
    return new Response(
      JSON.stringify({ error: 'Stream setup failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// 🛡️ Export the protected route with authentication
export const POST = authPresets.authenticated(handleStream)