/**
 * In-House AI Routes
 *
 * HTTP endpoints for Easy Mode project AI operations.
 *
 * Routes:
 * - POST /v1/inhouse/ai/chat - Chat completion
 * - POST /v1/inhouse/ai/embed - Generate embeddings
 * - POST /v1/inhouse/ai/image - Generate images
 * - GET  /v1/inhouse/ai/usage - Get usage statistics
 *
 * Part of EASY_MODE_SDK_PLAN.md - Phase 3C
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getInhouseAIService, ChatStreamChunk } from '../services/inhouse/InhouseAIService'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'

// =============================================================================
// LIMITS (DoS Protection)
// =============================================================================

/**
 * Maximum messages in a chat request
 */
const MAX_MESSAGES = 100

/**
 * Maximum message content length (64KB)
 */
const MAX_MESSAGE_LENGTH = 64 * 1024

/**
 * Maximum texts in an embed request
 */
const MAX_EMBED_TEXTS = 100

/**
 * Maximum text length per embedding (8KB)
 */
const MAX_TEXT_LENGTH = 8 * 1024

/**
 * Maximum prompt length for image generation (4KB)
 */
const MAX_IMAGE_PROMPT_LENGTH = 4 * 1024

/**
 * Body limit for requests (256KB)
 */
const BODY_LIMIT = 256 * 1024

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ChatBody {
  projectId: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
    name?: string
  }>
  model?: string
  stream?: boolean
  maxTokens?: number
  temperature?: number
  topP?: number
  stop?: string[]
  requestId?: string
  userId?: string
}

interface EmbedBody {
  projectId: string
  text: string | string[]
  model?: string
  dimensions?: number
  userId?: string
}

interface ImageBody {
  projectId: string
  prompt: string
  model?: string
  n?: number
  size?: string
  quality?: 'standard' | 'hd'
  style?: 'natural' | 'vivid'
  userId?: string
}

interface UsageQuery {
  projectId: string
  startDate?: string
  endDate?: string
  userId?: string
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateMessages(messages: unknown): { valid: boolean; error?: string } {
  if (!messages || !Array.isArray(messages)) {
    return { valid: false, error: 'messages must be an array' }
  }

  if (messages.length === 0) {
    return { valid: false, error: 'at least one message is required' }
  }

  if (messages.length > MAX_MESSAGES) {
    return { valid: false, error: `maximum ${MAX_MESSAGES} messages per request` }
  }

  const validRoles = ['system', 'user', 'assistant']

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as Record<string, unknown>

    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: `messages[${i}] must be an object` }
    }

    if (!validRoles.includes(msg.role as string)) {
      return { valid: false, error: `messages[${i}].role must be one of: ${validRoles.join(', ')}` }
    }

    if (typeof msg.content !== 'string') {
      return { valid: false, error: `messages[${i}].content must be a string` }
    }

    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      return { valid: false, error: `messages[${i}].content exceeds maximum length (${MAX_MESSAGE_LENGTH} chars)` }
    }
  }

  return { valid: true }
}

function validateTexts(text: unknown): { valid: boolean; error?: string; normalized?: string[] } {
  if (!text) {
    return { valid: false, error: 'text is required' }
  }

  const texts: string[] = Array.isArray(text) ? text : [text as string]

  if (texts.length === 0) {
    return { valid: false, error: 'at least one text is required' }
  }

  if (texts.length > MAX_EMBED_TEXTS) {
    return { valid: false, error: `maximum ${MAX_EMBED_TEXTS} texts per request` }
  }

  for (let i = 0; i < texts.length; i++) {
    const item = texts[i]
    if (typeof item !== 'string') {
      return { valid: false, error: `text[${i}] must be a string` }
    }

    if (item.length === 0) {
      return { valid: false, error: `text[${i}] cannot be empty` }
    }

    if (item.length > MAX_TEXT_LENGTH) {
      return { valid: false, error: `text[${i}] exceeds maximum length (${MAX_TEXT_LENGTH} chars)` }
    }
  }

  return { valid: true, normalized: texts }
}

// =============================================================================
// SSE STREAMING HELPER
// =============================================================================

async function streamSSE(
  reply: FastifyReply,
  generator: AsyncGenerator<ChatStreamChunk>,
  projectId: string,
  model: string,
  requestId?: string,
  userId?: string,
  abortController?: AbortController
): Promise<void> {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  })

  // Track if client disconnected
  let clientDisconnected = false

  // Abort streaming when client disconnects
  const onClose = () => {
    clientDisconnected = true
    abortController?.abort()
  }
  reply.raw.on('close', onClose)

  try {
    for await (const chunk of generator) {
      // Stop processing if client disconnected
      if (clientDisconnected) {
        break
      }

      const data = JSON.stringify(chunk)
      reply.raw.write(`data: ${data}\n\n`)

      if (chunk.done) {
        reply.raw.write('data: [DONE]\n\n')
        break
      }
    }
  } catch (error) {
    // Don't log abort errors as they're expected on client disconnect
    if (!clientDisconnected && (error as Error)?.name !== 'AbortError') {
      console.error('[AI Routes] Stream error:', error)
      const errorChunk = JSON.stringify({
        id: '',
        model,
        content: '',
        finishReason: null,
        done: true,
      })
      reply.raw.write(`data: ${errorChunk}\n\n`)
      reply.raw.write('data: [DONE]\n\n')
    }
  } finally {
    reply.raw.off('close', onClose)
    reply.raw.end()

    // Log activity (fire-and-forget)
    logActivity({
      projectId,
      service: 'ai',
      action: 'chat_stream',
      actorType: userId ? 'user' : 'system',
      actorId: userId,
      resourceType: 'chat',
      resourceId: requestId,
      metadata: {
        model,
        stream: true,
        clientDisconnected,
      },
    })
  }
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseAIRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  // ===========================================================================
  // POST /v1/inhouse/ai/chat - Chat completion
  // ===========================================================================
  fastify.post<{
    Body: ChatBody
  }>('/v1/inhouse/ai/chat', {
    preHandler: hmacMiddleware as any,
    bodyLimit: BODY_LIMIT,
  }, async (request, reply) => {
    const {
      projectId,
      messages,
      model,
      stream,
      maxTokens,
      temperature,
      topP,
      stop,
      requestId,
      userId,
    } = request.body

    // Validate projectId
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    // userId is required for billable AI operations
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId is required for AI operations',
        },
      })
    }

    // Authorize project access
    await assertProjectAccess(projectId, userId)

    // Validate messages
    const messagesValidation = validateMessages(messages)
    if (!messagesValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: messagesValidation.error,
        },
      })
    }

    // Validate temperature if provided
    if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'temperature must be between 0 and 2',
        },
      })
    }

    // Validate topP if provided
    if (topP !== undefined && (topP < 0 || topP > 1)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'topP must be between 0 and 1',
        },
      })
    }

    // Validate maxTokens if provided
    if (maxTokens !== undefined && (maxTokens < 1 || maxTokens > 128000)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'maxTokens must be between 1 and 128000',
        },
      })
    }

    const aiService = getInhouseAIService(projectId)

    // Handle streaming
    if (stream) {
      // Create abort controller to cancel upstream requests on client disconnect
      const abortController = new AbortController()

      const generator = aiService.streamChat({
        messages,
        model,
        maxTokens,
        temperature,
        topP,
        stop,
        requestId,
        signal: abortController.signal,
      })

      return streamSSE(reply, generator, projectId, model || 'gpt-4o', requestId, userId, abortController)
    }

    // Non-streaming request
    try {
      const result = await aiService.chat({
        messages,
        model,
        maxTokens,
        temperature,
        topP,
        stop,
        requestId,
      })

      // Log activity (fire-and-forget)
      logActivity({
        projectId,
        service: 'ai',
        action: 'chat',
        status: result.ok ? 'success' : 'error',
        actorType: 'user',
        actorId: userId,
        resourceType: 'chat',
        resourceId: result.data?.id || requestId,
        metadata: {
          model: result.data?.model || model,
          promptTokens: result.data?.usage?.promptTokens,
          completionTokens: result.data?.usage?.completionTokens,
          totalTokens: result.data?.usage?.totalTokens,
        },
        errorCode: result.error?.code,
      })

      if (!result.ok) {
        const statusCode = getStatusCode(result.error?.code)
        return reply.code(statusCode).send({
          ok: false,
          error: result.error,
        })
      }

      return reply.send({
        ok: true,
        data: result.data,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/ai/embed - Generate embeddings
  // ===========================================================================
  fastify.post<{
    Body: EmbedBody
  }>('/v1/inhouse/ai/embed', {
    preHandler: hmacMiddleware as any,
    bodyLimit: BODY_LIMIT,
  }, async (request, reply) => {
    const {
      projectId,
      text,
      model,
      dimensions,
      userId,
    } = request.body

    // Validate projectId
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    // userId is required for billable AI operations
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId is required for AI operations',
        },
      })
    }

    // Authorize project access
    await assertProjectAccess(projectId, userId)

    // Validate texts
    const textValidation = validateTexts(text)
    if (!textValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: textValidation.error,
        },
      })
    }

    // Validate dimensions if provided
    if (dimensions !== undefined && (dimensions < 1 || dimensions > 3072)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'dimensions must be between 1 and 3072',
        },
      })
    }

    try {
      const aiService = getInhouseAIService(projectId)
      const result = await aiService.embed({
        text: textValidation.normalized!,
        model,
        dimensions,
      })

      // Log activity (fire-and-forget)
      logActivity({
        projectId,
        service: 'ai',
        action: 'embed',
        status: result.ok ? 'success' : 'error',
        actorType: 'user',
        actorId: userId,
        resourceType: 'embedding',
        metadata: {
          model: result.data?.model || model,
          textCount: textValidation.normalized!.length,
          dimensions: result.data?.embeddings?.[0]?.length,
        },
        errorCode: result.error?.code,
      })

      if (!result.ok) {
        const statusCode = getStatusCode(result.error?.code)
        return reply.code(statusCode).send({
          ok: false,
          error: result.error,
        })
      }

      return reply.send({
        ok: true,
        data: result.data,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/ai/image - Generate images
  // ===========================================================================
  fastify.post<{
    Body: ImageBody
  }>('/v1/inhouse/ai/image', {
    preHandler: hmacMiddleware as any,
    bodyLimit: BODY_LIMIT,
  }, async (request, reply) => {
    const {
      projectId,
      prompt,
      model,
      n,
      size,
      quality,
      style,
      userId,
    } = request.body

    // Validate projectId
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    // userId is required for billable AI operations
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId is required for AI operations',
        },
      })
    }

    // Authorize project access
    await assertProjectAccess(projectId, userId)

    // Validate prompt
    if (!prompt || typeof prompt !== 'string') {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'prompt is required and must be a string',
        },
      })
    }

    if (prompt.length > MAX_IMAGE_PROMPT_LENGTH) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `prompt exceeds maximum length (${MAX_IMAGE_PROMPT_LENGTH} chars)`,
        },
      })
    }

    // Validate n if provided
    if (n !== undefined && (n < 1 || n > 10)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'n must be between 1 and 10',
        },
      })
    }

    // Validate size if provided
    const validSizes = ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792']
    if (size && !validSizes.includes(size)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `size must be one of: ${validSizes.join(', ')}`,
        },
      })
    }

    // Validate quality if provided
    if (quality && !['standard', 'hd'].includes(quality)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'quality must be "standard" or "hd"',
        },
      })
    }

    // Validate style if provided
    if (style && !['natural', 'vivid'].includes(style)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'style must be "natural" or "vivid"',
        },
      })
    }

    try {
      const aiService = getInhouseAIService(projectId)
      const result = await aiService.generateImage({
        prompt,
        model,
        n,
        size,
        quality,
        style,
      })

      // Log activity (fire-and-forget)
      logActivity({
        projectId,
        service: 'ai',
        action: 'generate_image',
        status: result.ok ? 'success' : 'error',
        actorType: 'user',
        actorId: userId,
        resourceType: 'image',
        metadata: {
          model: result.data?.model || model,
          imageCount: result.data?.images?.length || n || 1,
          size,
          quality,
          style,
        },
        errorCode: result.error?.code,
      })

      if (!result.ok) {
        const statusCode = getStatusCode(result.error?.code)
        return reply.code(statusCode).send({
          ok: false,
          error: result.error,
        })
      }

      return reply.send({
        ok: true,
        data: result.data,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/ai/usage - Get usage statistics
  // ===========================================================================
  fastify.get<{
    Querystring: UsageQuery
  }>('/v1/inhouse/ai/usage', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, startDate, endDate, userId } = request.query

    // Validate projectId
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    // userId is required for AI operations
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId is required for AI operations',
        },
      })
    }

    // Authorize project access
    await assertProjectAccess(projectId, userId)

    // Validate dates if provided
    if (startDate) {
      const date = new Date(startDate)
      if (isNaN(date.getTime())) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'startDate must be a valid date',
          },
        })
      }
    }

    if (endDate) {
      const date = new Date(endDate)
      if (isNaN(date.getTime())) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'endDate must be a valid date',
          },
        })
      }
    }

    try {
      const aiService = getInhouseAIService(projectId)
      const result = await aiService.getUsage({ startDate, endDate })

      if (!result.ok) {
        return reply.code(500).send({
          ok: false,
          error: result.error,
        })
      }

      return reply.send({
        ok: true,
        data: result.data,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })
}

// =============================================================================
// HELPERS
// =============================================================================

function getStatusCode(errorCode?: string): number {
  switch (errorCode) {
    case 'VALIDATION_ERROR':
    case 'INVALID_MODEL':
      return 400
    case 'API_KEY_MISSING':
    case 'API_KEY_INVALID':
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
      return 403
    case 'QUOTA_EXCEEDED':
    case 'RATE_LIMITED':
      return 429
    case 'TIMEOUT':
      return 504
    case 'PROVIDER_ERROR':
    case 'PROVIDER_UNAVAILABLE':
    case 'INTERNAL_ERROR':
    default:
      return 500
  }
}
