import { z } from 'zod'

// =============================================================================
// DEPLOYMENT
// =============================================================================

export const DeploymentAssetSchema = z.object({
  path: z.string().min(1),
  content: z.string(), // Base64-encoded
  contentType: z.string(),
})

export type DeploymentAsset = z.infer<typeof DeploymentAssetSchema>

export const ServerBundleSchema = z.object({
  code: z.string(),
  entryPoint: z.string(),
})

export type ServerBundle = z.infer<typeof ServerBundleSchema>

export const DeployBuildRequestSchema = z.object({
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  buildId: z.string().uuid(),
  assets: z.array(DeploymentAssetSchema).min(1),
  serverBundle: ServerBundleSchema.optional(),
})

export type DeployBuildRequest = z.infer<typeof DeployBuildRequestSchema>

export const DeploymentStatusSchema = z.enum([
  'uploading',
  'deploying',
  'deployed',
  'failed',
])

export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>

export const DeploymentHistoryItemSchema = z.object({
  id: z.string().uuid(),
  buildId: z.string().uuid(),
  status: DeploymentStatusSchema,
  deployedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  isCurrentlyActive: z.boolean(),
  metadata: z.object({
    assetCount: z.number().int().min(0),
    totalSizeBytes: z.number().int().min(0),
    durationMs: z.number().int().min(0),
  }),
  createdAt: z.string(),
})

export type DeploymentHistoryItem = z.infer<typeof DeploymentHistoryItemSchema>
