/**
 * Easy Mode Project Service
 *
 * Shared server-side service for Easy Mode project operations.
 * Used by both /api/projects and /api/inhouse routes to avoid
 * self-fetch issues (cookies not forwarded).
 *
 * EXPERT FIX: Extracted from /api/projects to fix session auth in prod
 */

import { callWorker } from '@/lib/api/worker-helpers'
import { logger } from '@/utils/logger'
import type { ApiResponse, CreateProjectResponse } from '@/types/inhouse-api'

export interface CreateEasyModeProjectParams {
  userId: string
  projectName: string
  subdomain?: string
  tier?: 'free' | 'starter' | 'growth' | 'enterprise'
  /** ISO 4217 currency code (e.g., USD, SAR, EGP). Defaults to USD. */
  currencyCode?: string
  template?: {
    id: string
    version: number
    tier: string
    category: string
    tags?: string[]
  }
  /** Starter content from template (content types + sample entries for CMS) */
  starterContent?: {
    contentTypes: Array<{
      name: string
      slug: string
      fields: Array<{
        name: string
        type: 'text' | 'number' | 'email' | 'url' | 'date' | 'select' | 'image' | 'boolean' | 'richtext' | 'json'
        required?: boolean
        options?: string[]
      }>
    }>
    entries: Array<{
      contentType: string
      data: Record<string, unknown>
      status?: 'draft' | 'published'
    }>
  }
}

export interface EasyModeProjectResult {
  projectId: string
  subdomain: string
  url: string
  schemaName: string
  /** Public API key for the project, or null if not provisioned yet */
  publicApiKey: string | null
  tier: string
}

/**
 * Create an Easy Mode project by calling the worker directly.
 * This avoids the self-fetch cookie issue.
 */
export async function createEasyModeProject(
  params: CreateEasyModeProjectParams
): Promise<ApiResponse<EasyModeProjectResult>> {
  const { userId, projectName, subdomain, tier = 'free', template, currencyCode, starterContent } = params

  logger.info('Creating Easy Mode project (server service)', {
    userId: userId.slice(0, 8),
    projectName,
    tier,
    hasSubdomain: !!subdomain,
    hasStarterContent: !!starterContent
  })

  const result = await callWorker({
    method: 'POST',
    path: '/v1/inhouse/projects',
    body: {
      userId,
      name: projectName,
      subdomain: subdomain || undefined,
      template: template || undefined,
      ...(currencyCode ? { currencyCode } : {}),
      ...(starterContent ? { starterContent } : {}),
    }
  })

  if (!result.ok) {
    logger.error('Easy Mode project creation failed (worker)', {
      code: result.error?.code,
      message: result.error?.message,
      status: result.status,
      userId: userId.slice(0, 8)
    })

    return {
      ok: false,
      error: {
        code: result.error?.code || 'EASY_MODE_ERROR',
        message: result.error?.message || 'Failed to create Easy Mode project'
      }
    }
  }

  logger.info('Easy Mode project created successfully (server service)', {
    projectId: result.data.projectId?.slice(0, 8),
    subdomain: result.data.subdomain,
    userId: userId.slice(0, 8)
  })

  return {
    ok: true,
    data: {
      projectId: result.data.projectId,
      subdomain: result.data.subdomain,
      url: result.data.previewUrl || `https://${result.data.subdomain}.sheenapps.com`,
      schemaName: result.data.schemaName,
      publicApiKey: result.data.apiKey?.publicKey ?? null,
      tier
    }
  }
}
