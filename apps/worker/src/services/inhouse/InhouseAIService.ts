/**
 * In-House AI Service
 *
 * LLM operations for Easy Mode projects.
 * Supports OpenAI (GPT-4, embeddings, DALL-E) and Anthropic (Claude).
 *
 * Part of EASY_MODE_SDK_PLAN.md - Phase 3C
 */

import { randomUUID } from 'crypto'
import { getPool } from '../databaseWrapper'
import { getInhouseMeteringService } from './InhouseMeteringService'
import { getInhouseSecretsService } from './InhouseSecretsService'

// =============================================================================
// CONSTANTS
// =============================================================================

const OPENAI_API_URL = 'https://api.openai.com/v1'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1'

const DEFAULT_CHAT_MODEL = 'gpt-4o'
const DEFAULT_EMBED_MODEL = 'text-embedding-3-small'
const DEFAULT_IMAGE_MODEL = 'dall-e-3'

const DEFAULT_TIMEOUT = 60000 // 60s for LLM calls
const IMAGE_TIMEOUT = 120000 // 2 minutes for image generation

// Model to provider mapping
const MODEL_PROVIDERS: Record<string, 'openai' | 'anthropic'> = {
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-3.5-turbo': 'openai',
  'claude-3-opus': 'anthropic',
  'claude-3-sonnet': 'anthropic',
  'claude-3-haiku': 'anthropic',
  'claude-3-5-sonnet': 'anthropic',
}

// Anthropic model IDs (their API uses different naming)
const ANTHROPIC_MODEL_IDS: Record<string, string> = {
  'claude-3-opus': 'claude-3-opus-20240229',
  'claude-3-sonnet': 'claude-3-sonnet-20240229',
  'claude-3-haiku': 'claude-3-haiku-20240307',
  'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
}

// =============================================================================
// TYPES
// =============================================================================

export type AIProvider = 'openai' | 'anthropic'

export type MessageRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: MessageRole
  content: string
  name?: string
}

export interface ChatOptions {
  messages: ChatMessage[]
  model?: string
  stream?: boolean
  maxTokens?: number
  temperature?: number
  topP?: number
  stop?: string[]
  requestId?: string
  signal?: AbortSignal  // For canceling streaming on client disconnect
}

export interface ChatResponse {
  id: string
  model: string
  content: string
  finishReason: 'stop' | 'length' | 'content_filter' | null
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface ChatStreamChunk {
  id: string
  model: string
  content: string
  finishReason: 'stop' | 'length' | 'content_filter' | null
  done: boolean
}

export interface EmbedOptions {
  text: string | string[]
  model?: string
  dimensions?: number
}

export interface EmbedResponse {
  model: string
  embeddings: number[][]
  usage: {
    promptTokens: number
    totalTokens: number
  }
}

export interface ImageSize {
  width: number
  height: number
}

export type ImageQuality = 'standard' | 'hd'
export type ImageStyle = 'natural' | 'vivid'

export interface ImageOptions {
  prompt: string
  model?: string
  n?: number
  size?: string
  quality?: ImageQuality
  style?: ImageStyle
}

export interface GeneratedImage {
  url: string
  revisedPrompt?: string
}

export interface ImageResponse {
  model: string
  images: GeneratedImage[]
}

export interface AIUsageStats {
  period: {
    start: string
    end: string
  }
  totals: {
    requests: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostCents: number
  }
  byModel: Record<string, {
    requests: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }>
}

export interface AIUsageOptions {
  startDate?: string
  endDate?: string
}

export interface AIResult<T> {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
    retryable?: boolean
    details?: Record<string, unknown>
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function getProvider(model: string): AIProvider | null {
  // Check explicit mapping first
  const mapped = MODEL_PROVIDERS[model]
  if (mapped) {
    return mapped
  }
  // Infer from prefix
  if (model.startsWith('gpt-') || model.startsWith('text-embedding-') || model.startsWith('dall-e')) {
    return 'openai'
  }
  if (model.startsWith('claude-')) {
    return 'anthropic'
  }
  return null
}

function getAnthropicModelId(model: string): string {
  return ANTHROPIC_MODEL_IDS[model] || model
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseAIService {
  private projectId: string
  private apiKeys: { openai?: string; anthropic?: string } = {}
  private keysLoaded = false

  constructor(projectId: string) {
    this.projectId = projectId
  }

  /**
   * Load API keys from project secrets
   */
  private async loadApiKeys(): Promise<void> {
    if (this.keysLoaded) return

    const secretsService = getInhouseSecretsService(this.projectId)
    const secrets = await secretsService.decryptSecrets([
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
    ])

    this.apiKeys = {
      openai: secrets['OPENAI_API_KEY'],
      anthropic: secrets['ANTHROPIC_API_KEY'],
    }
    this.keysLoaded = true
  }

  /**
   * Get API key for a provider
   */
  private async getApiKey(provider: AIProvider): Promise<string | null> {
    await this.loadApiKeys()
    return this.apiKeys[provider] || null
  }

  /**
   * Make a request with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = DEFAULT_TIMEOUT,
    externalSignal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    // Link external signal to abort the request
    const onExternalAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onExternalAbort)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      return response
    } finally {
      clearTimeout(timeoutId)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }
  }

  /**
   * Reserve quota before an AI operation
   */
  private async reserveQuota(): Promise<{
    allowed: boolean
    used: number
    limit: number
  }> {
    const meteringService = getInhouseMeteringService()
    return meteringService.reserveProjectQuota(this.projectId, 'ai_operations', 1)
  }

  /**
   * Release quota reservation on failure
   */
  private async releaseQuota(): Promise<void> {
    const meteringService = getInhouseMeteringService()
    await meteringService.releaseProjectQuota(this.projectId, 'ai_operations', 1)
  }

  /**
   * Log AI usage to database
   */
  private async logUsage(params: {
    model: string
    operation: 'chat' | 'embed' | 'image'
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    success: boolean
    errorCode?: string
    requestId?: string
  }): Promise<void> {
    try {
      await getPool().query(
        `INSERT INTO inhouse_ai_usage
         (id, project_id, model, operation, prompt_tokens, completion_tokens, total_tokens, success, error_code, request_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          randomUUID(),
          this.projectId,
          params.model,
          params.operation,
          params.promptTokens || 0,
          params.completionTokens || 0,
          params.totalTokens || 0,
          params.success,
          params.errorCode || null,
          params.requestId || null,
        ]
      )
    } catch (err) {
      console.error('[InhouseAIService] Failed to log usage:', err)
      // Don't fail the request if logging fails
    }
  }

  // ===========================================================================
  // CHAT COMPLETION
  // ===========================================================================

  /**
   * Generate a chat completion (non-streaming)
   */
  async chat(options: ChatOptions): Promise<AIResult<ChatResponse>> {
    const model = options.model || DEFAULT_CHAT_MODEL
    const provider = getProvider(model)

    if (!provider) {
      return {
        ok: false,
        error: {
          code: 'INVALID_MODEL',
          message: `Unsupported model: ${model}`,
          retryable: false,
        },
      }
    }

    // Check quota
    const quota = await this.reserveQuota()
    if (!quota.allowed) {
      return {
        ok: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `AI operations quota exceeded: ${quota.used}/${quota.limit}`,
          retryable: false,
          details: { used: quota.used, limit: quota.limit },
        },
      }
    }

    // Get API key
    const apiKey = await this.getApiKey(provider)
    if (!apiKey) {
      await this.releaseQuota()
      return {
        ok: false,
        error: {
          code: 'API_KEY_MISSING',
          message: `${provider.toUpperCase()}_API_KEY not found in project secrets`,
          retryable: false,
        },
      }
    }

    try {
      if (provider === 'openai') {
        return await this.chatOpenAI(options, model, apiKey)
      } else {
        return await this.chatAnthropic(options, model, apiKey)
      }
    } catch (err) {
      await this.releaseQuota()
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const isTimeout = err instanceof Error && err.name === 'AbortError'

      await this.logUsage({
        model,
        operation: 'chat',
        success: false,
        errorCode: isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
        requestId: options.requestId,
      })

      return {
        ok: false,
        error: {
          code: isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
          message: errorMessage,
          retryable: isTimeout,
        },
      }
    }
  }

  /**
   * OpenAI chat completion
   */
  private async chatOpenAI(
    options: ChatOptions,
    model: string,
    apiKey: string
  ): Promise<AIResult<ChatResponse>> {
    const response = await this.fetchWithTimeout(
      `${OPENAI_API_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          top_p: options.topP,
          stop: options.stop,
          stream: false,
        }),
      }
    )

    const data = await response.json() as Record<string, unknown>

    if (!response.ok) {
      await this.releaseQuota()
      const errorData = data as { error?: { message?: string; code?: string; type?: string } }
      const errorCode = this.mapOpenAIError(response.status, errorData.error?.type)

      await this.logUsage({
        model,
        operation: 'chat',
        success: false,
        errorCode,
        requestId: options.requestId,
      })

      return {
        ok: false,
        error: {
          code: errorCode,
          message: errorData.error?.message || `OpenAI API error: ${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        },
      }
    }

    const responseData = data as {
      id: string
      model: string
      choices: Array<{
        message: { content: string }
        finish_reason: string
      }>
      usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
      }
    }

    const result: ChatResponse = {
      id: responseData.id,
      model: responseData.model,
      content: responseData.choices[0]?.message?.content || '',
      finishReason: this.mapFinishReason(responseData.choices[0]?.finish_reason),
      usage: {
        promptTokens: responseData.usage?.prompt_tokens || 0,
        completionTokens: responseData.usage?.completion_tokens || 0,
        totalTokens: responseData.usage?.total_tokens || 0,
      },
    }

    await this.logUsage({
      model,
      operation: 'chat',
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      success: true,
      requestId: options.requestId,
    })

    return { ok: true, data: result }
  }

  /**
   * Anthropic chat completion
   */
  private async chatAnthropic(
    options: ChatOptions,
    model: string,
    apiKey: string
  ): Promise<AIResult<ChatResponse>> {
    // Convert messages format for Anthropic
    const systemMessage = options.messages.find(m => m.role === 'system')
    const messages = options.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    const response = await this.fetchWithTimeout(
      `${ANTHROPIC_API_URL}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: getAnthropicModelId(model),
          messages,
          system: systemMessage?.content,
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature,
          top_p: options.topP,
          stop_sequences: options.stop,
        }),
      }
    )

    const data = await response.json() as Record<string, unknown>

    if (!response.ok) {
      await this.releaseQuota()
      const errorData = data as { error?: { message?: string; type?: string } }
      const errorCode = this.mapAnthropicError(response.status, errorData.error?.type)

      await this.logUsage({
        model,
        operation: 'chat',
        success: false,
        errorCode,
        requestId: options.requestId,
      })

      return {
        ok: false,
        error: {
          code: errorCode,
          message: errorData.error?.message || `Anthropic API error: ${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        },
      }
    }

    const responseData = data as {
      id: string
      model: string
      content: Array<{ type: string; text: string }>
      stop_reason: string
      usage: {
        input_tokens: number
        output_tokens: number
      }
    }

    const textContent = responseData.content.find(c => c.type === 'text')

    const result: ChatResponse = {
      id: responseData.id,
      model: responseData.model,
      content: textContent?.text || '',
      finishReason: this.mapAnthropicStopReason(responseData.stop_reason),
      usage: {
        promptTokens: responseData.usage?.input_tokens || 0,
        completionTokens: responseData.usage?.output_tokens || 0,
        totalTokens: (responseData.usage?.input_tokens || 0) + (responseData.usage?.output_tokens || 0),
      },
    }

    await this.logUsage({
      model,
      operation: 'chat',
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      success: true,
      requestId: options.requestId,
    })

    return { ok: true, data: result }
  }

  // ===========================================================================
  // STREAMING
  // ===========================================================================

  /**
   * Stream a chat completion
   */
  async *streamChat(options: ChatOptions): AsyncGenerator<ChatStreamChunk> {
    const model = options.model || DEFAULT_CHAT_MODEL
    const provider = getProvider(model)

    if (!provider) {
      yield {
        id: '',
        model,
        content: '',
        finishReason: null,
        done: true,
      }
      return
    }

    // Check quota
    const quota = await this.reserveQuota()
    if (!quota.allowed) {
      yield {
        id: '',
        model,
        content: '',
        finishReason: null,
        done: true,
      }
      return
    }

    // Get API key
    const apiKey = await this.getApiKey(provider)
    if (!apiKey) {
      await this.releaseQuota()
      yield {
        id: '',
        model,
        content: '',
        finishReason: null,
        done: true,
      }
      return
    }

    try {
      if (provider === 'openai') {
        yield* this.streamOpenAI(options, model, apiKey, options.signal)
      } else {
        yield* this.streamAnthropic(options, model, apiKey, options.signal)
      }
    } catch (err) {
      await this.releaseQuota()
      // Don't log abort errors as they're expected on client disconnect
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[InhouseAIService] Stream error:', err)
      }
      yield {
        id: '',
        model,
        content: '',
        finishReason: null,
        done: true,
      }
    }
  }

  /**
   * OpenAI streaming
   */
  private async *streamOpenAI(
    options: ChatOptions,
    model: string,
    apiKey: string,
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamChunk> {
    const response = await this.fetchWithTimeout(
      `${OPENAI_API_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          top_p: options.topP,
          stop: options.stop,
          stream: true,
        }),
      },
      DEFAULT_TIMEOUT,
      signal
    )

    if (!response.ok) {
      await this.releaseQuota()
      yield {
        id: '',
        model,
        content: '',
        finishReason: null,
        done: true,
      }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      await this.releaseQuota()
      yield {
        id: '',
        model,
        content: '',
        finishReason: null,
        done: true,
      }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let responseId = ''

    try {
      while (true) {
        // Check if client disconnected
        if (signal?.aborted) {
          await this.logUsage({
            model,
            operation: 'chat',
            success: false,
            errorCode: 'CLIENT_DISCONNECTED',
            requestId: options.requestId,
          })
          return
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              await this.logUsage({
                model,
                operation: 'chat',
                success: true,
                requestId: options.requestId,
              })
              yield {
                id: responseId,
                model,
                content: '',
                finishReason: 'stop',
                done: true,
              }
              return
            }

            try {
              const parsed = JSON.parse(data) as {
                id: string
                model: string
                choices: Array<{
                  delta: { content?: string }
                  finish_reason: string | null
                }>
              }

              responseId = parsed.id
              const choice = parsed.choices[0]
              const content = choice?.delta?.content || ''

              yield {
                id: parsed.id,
                model: parsed.model,
                content,
                finishReason: this.mapFinishReason(choice?.finish_reason),
                done: choice?.finish_reason !== null,
              }

              if (choice?.finish_reason) {
                await this.logUsage({
                  model,
                  operation: 'chat',
                  success: true,
                  requestId: options.requestId,
                })
                return
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Anthropic streaming
   */
  private async *streamAnthropic(
    options: ChatOptions,
    model: string,
    apiKey: string,
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamChunk> {
    // Convert messages format for Anthropic
    const systemMessage = options.messages.find(m => m.role === 'system')
    const messages = options.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    const response = await this.fetchWithTimeout(
      `${ANTHROPIC_API_URL}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: getAnthropicModelId(model),
          messages,
          system: systemMessage?.content,
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature,
          top_p: options.topP,
          stop_sequences: options.stop,
          stream: true,
        }),
      },
      DEFAULT_TIMEOUT,
      signal
    )

    if (!response.ok) {
      await this.releaseQuota()
      yield {
        id: '',
        model,
        content: '',
        finishReason: null,
        done: true,
      }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      await this.releaseQuota()
      yield {
        id: '',
        model,
        content: '',
        finishReason: null,
        done: true,
      }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let messageId = ''

    try {
      while (true) {
        // Check if client disconnected
        if (signal?.aborted) {
          await this.logUsage({
            model,
            operation: 'chat',
            success: false,
            errorCode: 'CLIENT_DISCONNECTED',
            requestId: options.requestId,
          })
          return
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6)) as {
                type: string
                message?: { id: string }
                delta?: { text?: string; stop_reason?: string }
                index?: number
              }

              if (parsed.type === 'message_start' && parsed.message) {
                messageId = parsed.message.id
              } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                yield {
                  id: messageId,
                  model,
                  content: parsed.delta.text,
                  finishReason: null,
                  done: false,
                }
              } else if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
                await this.logUsage({
                  model,
                  operation: 'chat',
                  success: true,
                  requestId: options.requestId,
                })
                yield {
                  id: messageId,
                  model,
                  content: '',
                  finishReason: this.mapAnthropicStopReason(parsed.delta.stop_reason),
                  done: true,
                }
                return
              } else if (parsed.type === 'message_stop') {
                await this.logUsage({
                  model,
                  operation: 'chat',
                  success: true,
                  requestId: options.requestId,
                })
                yield {
                  id: messageId,
                  model,
                  content: '',
                  finishReason: 'stop',
                  done: true,
                }
                return
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  // ===========================================================================
  // EMBEDDINGS
  // ===========================================================================

  /**
   * Generate embeddings
   */
  async embed(options: EmbedOptions): Promise<AIResult<EmbedResponse>> {
    const model = options.model || DEFAULT_EMBED_MODEL

    // Embeddings are OpenAI only
    if (!model.startsWith('text-embedding-')) {
      return {
        ok: false,
        error: {
          code: 'INVALID_MODEL',
          message: `Unsupported embedding model: ${model}`,
          retryable: false,
        },
      }
    }

    // Check quota
    const quota = await this.reserveQuota()
    if (!quota.allowed) {
      return {
        ok: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `AI operations quota exceeded: ${quota.used}/${quota.limit}`,
          retryable: false,
          details: { used: quota.used, limit: quota.limit },
        },
      }
    }

    // Get API key
    const apiKey = await this.getApiKey('openai')
    if (!apiKey) {
      await this.releaseQuota()
      return {
        ok: false,
        error: {
          code: 'API_KEY_MISSING',
          message: 'OPENAI_API_KEY not found in project secrets',
          retryable: false,
        },
      }
    }

    const texts = Array.isArray(options.text) ? options.text : [options.text]

    try {
      const response = await this.fetchWithTimeout(
        `${OPENAI_API_URL}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: texts,
            dimensions: options.dimensions,
          }),
        }
      )

      const data = await response.json() as Record<string, unknown>

      if (!response.ok) {
        await this.releaseQuota()
        const errorData = data as { error?: { message?: string; type?: string } }
        const errorCode = this.mapOpenAIError(response.status, errorData.error?.type)

        await this.logUsage({
          model,
          operation: 'embed',
          success: false,
          errorCode,
        })

        return {
          ok: false,
          error: {
            code: errorCode,
            message: errorData.error?.message || `OpenAI API error: ${response.status}`,
            retryable: response.status >= 500 || response.status === 429,
          },
        }
      }

      const responseData = data as {
        model: string
        data: Array<{ embedding: number[]; index: number }>
        usage: { prompt_tokens: number; total_tokens: number }
      }

      // Sort by index to maintain order
      const sortedData = responseData.data.sort((a, b) => a.index - b.index)

      const result: EmbedResponse = {
        model: responseData.model,
        embeddings: sortedData.map(d => d.embedding),
        usage: {
          promptTokens: responseData.usage?.prompt_tokens || 0,
          totalTokens: responseData.usage?.total_tokens || 0,
        },
      }

      await this.logUsage({
        model,
        operation: 'embed',
        promptTokens: result.usage.promptTokens,
        totalTokens: result.usage.totalTokens,
        success: true,
      })

      return { ok: true, data: result }
    } catch (err) {
      await this.releaseQuota()
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const isTimeout = err instanceof Error && err.name === 'AbortError'

      await this.logUsage({
        model,
        operation: 'embed',
        success: false,
        errorCode: isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
      })

      return {
        ok: false,
        error: {
          code: isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
          message: errorMessage,
          retryable: isTimeout,
        },
      }
    }
  }

  // ===========================================================================
  // IMAGE GENERATION
  // ===========================================================================

  /**
   * Generate an image
   */
  async generateImage(options: ImageOptions): Promise<AIResult<ImageResponse>> {
    const model = options.model || DEFAULT_IMAGE_MODEL

    // Image generation is OpenAI only (DALL-E)
    if (!model.startsWith('dall-e')) {
      return {
        ok: false,
        error: {
          code: 'INVALID_MODEL',
          message: `Unsupported image model: ${model}`,
          retryable: false,
        },
      }
    }

    // Check quota
    const quota = await this.reserveQuota()
    if (!quota.allowed) {
      return {
        ok: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `AI operations quota exceeded: ${quota.used}/${quota.limit}`,
          retryable: false,
          details: { used: quota.used, limit: quota.limit },
        },
      }
    }

    // Get API key
    const apiKey = await this.getApiKey('openai')
    if (!apiKey) {
      await this.releaseQuota()
      return {
        ok: false,
        error: {
          code: 'API_KEY_MISSING',
          message: 'OPENAI_API_KEY not found in project secrets',
          retryable: false,
        },
      }
    }

    try {
      const response = await this.fetchWithTimeout(
        `${OPENAI_API_URL}/images/generations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            prompt: options.prompt,
            n: options.n || 1,
            size: options.size || '1024x1024',
            quality: options.quality,
            style: options.style,
          }),
        },
        IMAGE_TIMEOUT
      )

      const data = await response.json() as Record<string, unknown>

      if (!response.ok) {
        await this.releaseQuota()
        const errorData = data as { error?: { message?: string; type?: string } }
        const errorCode = this.mapOpenAIError(response.status, errorData.error?.type)

        await this.logUsage({
          model,
          operation: 'image',
          success: false,
          errorCode,
        })

        return {
          ok: false,
          error: {
            code: errorCode,
            message: errorData.error?.message || `OpenAI API error: ${response.status}`,
            retryable: response.status >= 500 || response.status === 429,
          },
        }
      }

      const responseData = data as {
        data: Array<{ url: string; revised_prompt?: string }>
      }

      const result: ImageResponse = {
        model,
        images: responseData.data.map(img => ({
          url: img.url,
          revisedPrompt: img.revised_prompt,
        })),
      }

      await this.logUsage({
        model,
        operation: 'image',
        success: true,
      })

      return { ok: true, data: result }
    } catch (err) {
      await this.releaseQuota()
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const isTimeout = err instanceof Error && err.name === 'AbortError'

      await this.logUsage({
        model,
        operation: 'image',
        success: false,
        errorCode: isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
      })

      return {
        ok: false,
        error: {
          code: isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
          message: errorMessage,
          retryable: isTimeout,
        },
      }
    }
  }

  // ===========================================================================
  // USAGE STATISTICS
  // ===========================================================================

  /**
   * Get usage statistics
   */
  async getUsage(options?: AIUsageOptions): Promise<AIResult<AIUsageStats>> {
    try {
      // Default to current month
      const now = new Date()
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!
      const defaultEnd = now.toISOString().split('T')[0]!
      const startDate: string = options?.startDate || defaultStart
      const endDate: string = options?.endDate || defaultEnd

      // Get totals
      const totalsResult = await getPool().query(
        `SELECT
           COUNT(*) as requests,
           COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) as completion_tokens,
           COALESCE(SUM(total_tokens), 0) as total_tokens
         FROM inhouse_ai_usage
         WHERE project_id = $1
           AND created_at >= $2::date
           AND created_at < ($3::date + interval '1 day')
           AND success = true`,
        [this.projectId, startDate, endDate]
      )

      // Get by model
      const byModelResult = await getPool().query(
        `SELECT
           model,
           COUNT(*) as requests,
           COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) as completion_tokens,
           COALESCE(SUM(total_tokens), 0) as total_tokens
         FROM inhouse_ai_usage
         WHERE project_id = $1
           AND created_at >= $2::date
           AND created_at < ($3::date + interval '1 day')
           AND success = true
         GROUP BY model`,
        [this.projectId, startDate, endDate]
      )

      const totals = totalsResult.rows[0]
      const byModel: Record<string, {
        requests: number
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }> = {}

      for (const row of byModelResult.rows) {
        byModel[row.model] = {
          requests: parseInt(row.requests, 10),
          promptTokens: parseInt(row.prompt_tokens, 10),
          completionTokens: parseInt(row.completion_tokens, 10),
          totalTokens: parseInt(row.total_tokens, 10),
        }
      }

      // Estimate cost (rough approximation - actual pricing varies by model)
      const totalTokens = parseInt(totals.total_tokens, 10)
      const estimatedCostCents = Math.round(totalTokens * 0.001) // ~$0.01 per 1K tokens average

      const result: AIUsageStats = {
        period: {
          start: startDate,
          end: endDate,
        },
        totals: {
          requests: parseInt(totals.requests, 10),
          promptTokens: parseInt(totals.prompt_tokens, 10),
          completionTokens: parseInt(totals.completion_tokens, 10),
          totalTokens,
          estimatedCostCents,
        },
        byModel,
      }

      return { ok: true, data: result }
    } catch (err) {
      console.error('[InhouseAIService] Failed to get usage:', err)
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve usage statistics',
          retryable: true,
        },
      }
    }
  }

  // ===========================================================================
  // ERROR MAPPING
  // ===========================================================================

  private mapOpenAIError(status: number, errorType?: string): string {
    if (status === 401) return 'API_KEY_INVALID'
    if (status === 403) return 'FORBIDDEN'
    if (status === 429) return 'RATE_LIMITED'
    if (status === 400 && errorType === 'context_length_exceeded') return 'CONTEXT_LENGTH_EXCEEDED'
    if (status === 400 && errorType === 'invalid_model') return 'INVALID_MODEL'
    if (status === 400) return 'VALIDATION_ERROR'
    if (status >= 500) return 'PROVIDER_ERROR'
    return 'UNKNOWN_ERROR'
  }

  private mapAnthropicError(status: number, errorType?: string): string {
    if (status === 401) return 'API_KEY_INVALID'
    if (status === 403) return 'FORBIDDEN'
    if (status === 429) return 'RATE_LIMITED'
    if (errorType === 'invalid_request_error' && status === 400) return 'VALIDATION_ERROR'
    if (status >= 500) return 'PROVIDER_ERROR'
    return 'UNKNOWN_ERROR'
  }

  private mapFinishReason(reason: string | null | undefined): ChatResponse['finishReason'] {
    if (!reason) return null
    if (reason === 'stop') return 'stop'
    if (reason === 'length') return 'length'
    if (reason === 'content_filter') return 'content_filter'
    return null
  }

  private mapAnthropicStopReason(reason: string): ChatResponse['finishReason'] {
    if (reason === 'end_turn') return 'stop'
    if (reason === 'max_tokens') return 'length'
    if (reason === 'stop_sequence') return 'stop'
    return null
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

const SERVICE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_SIZE = 100
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  service: InhouseAIService
  createdAt: number
}

const serviceCache = new Map<string, CacheEntry>()

function cleanupServiceCache(): void {
  const now = Date.now()

  // Remove entries older than TTL
  for (const [key, entry] of serviceCache) {
    if (now - entry.createdAt > SERVICE_TTL_MS) {
      serviceCache.delete(key)
    }
  }

  // Enforce max size by removing oldest entries
  if (serviceCache.size > MAX_CACHE_SIZE) {
    const entries = [...serviceCache.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE)
    for (const [key] of toDelete) {
      serviceCache.delete(key)
    }
  }
}

export function getInhouseAIService(projectId: string): InhouseAIService {
  const cached = serviceCache.get(projectId)
  const now = Date.now()

  // Return cached if exists and not expired
  if (cached && now - cached.createdAt < SERVICE_TTL_MS) {
    return cached.service
  }

  // Create new service instance
  const service = new InhouseAIService(projectId)
  serviceCache.set(projectId, { service, createdAt: now })
  return service
}

// Run cleanup periodically
setInterval(cleanupServiceCache, CLEANUP_INTERVAL_MS)
