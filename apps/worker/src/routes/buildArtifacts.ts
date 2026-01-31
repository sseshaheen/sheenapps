/**
 * Build Artifacts Routes
 *
 * Returns build artifacts (staticAssets, serverBundle, envVars) for deployment.
 * Used by DeployDialog to retrieve build outputs before manual deployment.
 *
 * Route:
 * - GET /v1/builds/:buildId/artifacts - Get build artifacts for deployment
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { downloadArtifactFromR2 } from '../services/cloudflareR2'
import { getVersionByBuildId, pool } from '../services/database'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { spawn } from 'child_process'

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_ARTIFACT_SIZE_BYTES = 100 * 1024 * 1024 // 100 MB max artifact
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB max single file
const EXTRACTION_TIMEOUT_MS = 30000 // 30 seconds

// Default Easy Mode worker code (serves static files from R2)
const EASY_MODE_WORKER_CODE = `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const buildId = await env.PROJECT_BUILDS.get(env.PROJECT_ID);
    if (!buildId) {
      return new Response('Build not found', { status: 404 });
    }

    const pathname = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const normalizedPath = pathname.startsWith('/') ? pathname : '/' + pathname;
    const assetKey = \`builds/\${env.PROJECT_ID}/\${buildId}\${normalizedPath}\`;

    let asset = await env.ASSETS.get(assetKey);
    if (!asset) {
      const indexKey = \`builds/\${env.PROJECT_ID}/\${buildId}/index.html\`;
      asset = await env.ASSETS.get(indexKey);
    }

    if (!asset) {
      return new Response('Not found', { status: 404 });
    }

    const contentType = asset.httpMetadata?.contentType || 'text/html; charset=utf-8';
    return new Response(asset.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=0, must-revalidate'
      }
    });
  }
};
`

const EASY_MODE_WORKER_ENTRY = 'index.js'

// Content type mapping
const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  map: 'application/json',
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getContentTypeForPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return CONTENT_TYPES[ext] || 'application/octet-stream'
}

/**
 * Validate that a resolved path stays within the base directory
 */
function isPathWithinBase(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath) + path.sep
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget.startsWith(resolvedBase) || resolvedTarget === path.resolve(basePath)
}

/**
 * Extract a tar.gz file to a directory with timeout
 */
async function extractTarGz(tarGzPath: string, targetDir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tar = spawn('tar', ['-xzf', tarGzPath, '-C', targetDir])

    const timeout = setTimeout(() => {
      tar.kill('SIGTERM')
      resolve(false)
    }, EXTRACTION_TIMEOUT_MS)

    tar.on('close', (code) => {
      clearTimeout(timeout)
      resolve(code === 0)
    })

    tar.on('error', () => {
      clearTimeout(timeout)
      resolve(false)
    })
  })
}

interface StaticAsset {
  path: string
  content: string // base64 encoded
  contentType: string
  size: number
}

/**
 * Collect static assets from an extracted directory
 * Returns files as base64-encoded content for deployment
 */
async function collectStaticAssets(
  rootDir: string,
  relativePath: string = '',
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<StaticAsset[]> {
  if (currentDepth > maxDepth) {
    return []
  }

  const assets: StaticAsset[] = []
  const currentDir = path.join(rootDir, relativePath)

  // Security: verify we're still within rootDir
  if (!isPathWithinBase(rootDir, currentDir)) {
    console.warn(`[BuildArtifacts] Path traversal attempt detected: ${currentDir}`)
    return []
  }

  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      // Skip hidden files, node_modules, and symlinks
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue
      }

      if (entry.isSymbolicLink()) {
        console.warn(`[BuildArtifacts] Skipping symlink: ${entry.name}`)
        continue
      }

      const itemRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name

      if (entry.isDirectory()) {
        const subAssets = await collectStaticAssets(
          rootDir,
          itemRelativePath,
          maxDepth,
          currentDepth + 1
        )
        assets.push(...subAssets)
      } else if (entry.isFile()) {
        const fullPath = path.join(currentDir, entry.name)

        // Security: verify path is within base
        if (!isPathWithinBase(rootDir, fullPath)) {
          continue
        }

        const stats = await fs.stat(fullPath)

        // Skip files that are too large
        if (stats.size > MAX_FILE_SIZE_BYTES) {
          console.warn(`[BuildArtifacts] Skipping large file: ${itemRelativePath} (${stats.size} bytes)`)
          continue
        }

        // Security: ensure it's a regular file
        if (!stats.isFile()) {
          continue
        }

        const content = await fs.readFile(fullPath)
        const assetPath = `/${itemRelativePath}` // Prefix with /

        assets.push({
          path: assetPath,
          content: content.toString('base64'),
          contentType: getContentTypeForPath(fullPath),
          size: stats.size,
        })
      }
    }
  } catch (error) {
    console.warn(`[BuildArtifacts] Error collecting assets from ${currentDir}:`, error)
  }

  return assets
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function buildArtifactsRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  /**
   * GET /v1/builds/:buildId/artifacts
   *
   * Returns build artifacts for deployment:
   * - staticAssets: Array of { path, content (base64), contentType, size }
   * - serverBundle: { code, entryPoint }
   * - envVars: Project environment variables (if any)
   */
  fastify.get<{
    Params: { buildId: string }
    Querystring: { userId?: string }
    Headers: { 'x-user-id'?: string }
  }>(
    '/builds/:buildId/artifacts',
    {
      schema: {
        params: {
          type: 'object',
          required: ['buildId'],
          properties: {
            buildId: {
              type: 'string',
              minLength: 26,
              description: 'Full build ID (ULID format)',
            },
          },
        },
      },
      preHandler: hmacMiddleware as any,
    },
    async (request: FastifyRequest<{
      Params: { buildId: string }
      Querystring: { userId?: string }
      Headers: { 'x-user-id'?: string }
    }>, reply: FastifyReply) => {
      const { buildId } = request.params
      const userId = request.query.userId || request.headers['x-user-id']

      console.log(`[BuildArtifacts] Request for buildId: ${buildId}, userId: ${userId}`)

      // Validate buildId format
      if (buildId.length < 26) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_BUILD_ID',
            message: 'buildId must be full ID (26+ characters)',
          },
        })
      }

      if (!userId) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'userId is required',
          },
        })
      }

      // Look up version by buildId
      const version = await getVersionByBuildId(buildId)
      if (!version) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'BUILD_NOT_FOUND',
            message: `No build found with ID: ${buildId}`,
          },
        })
      }

      // Authorization check
      if (version.userId !== userId) {
        console.error(`[BuildArtifacts] Authorization failed: version.userId (${version.userId}) !== userId (${userId})`)
        return reply.code(403).send({
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authorized to access this build',
          },
        })
      }

      const { projectId, versionId } = version

      // Create temp directory for extraction
      const tempDir = path.join(os.tmpdir(), `build-artifacts-${buildId}-${Date.now()}`)
      const artifactPath = path.join(tempDir, 'artifact.tar.gz')
      const extractDir = path.join(tempDir, 'extracted')

      try {
        console.log(`[BuildArtifacts] Downloading artifact for versionId: ${versionId}`)

        await fs.mkdir(tempDir, { recursive: true })
        await fs.mkdir(extractDir, { recursive: true })

        // Download artifact from R2
        await downloadArtifactFromR2(userId, projectId, versionId, artifactPath)

        // Check artifact size
        const artifactStats = await fs.stat(artifactPath)
        if (artifactStats.size > MAX_ARTIFACT_SIZE_BYTES) {
          console.error(`[BuildArtifacts] Artifact too large: ${artifactStats.size} bytes`)
          return reply.code(413).send({
            ok: false,
            error: {
              code: 'ARTIFACT_TOO_LARGE',
              message: `Artifact exceeds maximum size (${Math.round(artifactStats.size / 1024 / 1024)}MB)`,
            },
          })
        }

        console.log(`[BuildArtifacts] Downloaded artifact (${artifactStats.size} bytes)`)

        // Extract the tar.gz
        const extractSuccess = await extractTarGz(artifactPath, extractDir)
        if (!extractSuccess) {
          console.error(`[BuildArtifacts] Failed to extract artifact`)
          return reply.code(500).send({
            ok: false,
            error: {
              code: 'EXTRACTION_FAILED',
              message: 'Failed to extract build artifact',
            },
          })
        }

        console.log(`[BuildArtifacts] Extracted artifact to ${extractDir}`)

        // Collect static assets
        const staticAssets = await collectStaticAssets(extractDir)
        console.log(`[BuildArtifacts] Collected ${staticAssets.length} static assets`)

        // Get project environment variables (if any)
        let envVars: Record<string, string> = {}
        if (pool) {
          try {
            const { rows } = await pool.query(
              'SELECT env_vars FROM projects WHERE id = $1',
              [projectId]
            )
            if (rows[0]?.env_vars) {
              envVars = rows[0].env_vars
            }
          } catch (error) {
            console.warn(`[BuildArtifacts] Could not fetch env vars:`, error)
          }
        }

        // Build response
        const response = {
          staticAssets,
          serverBundle: {
            code: EASY_MODE_WORKER_CODE,
            entryPoint: EASY_MODE_WORKER_ENTRY,
          },
          envVars,
          metadata: {
            buildId,
            versionId,
            projectId,
            assetCount: staticAssets.length,
            totalSize: staticAssets.reduce((sum, a) => sum + a.size, 0),
          },
        }

        return reply.send(response)

      } catch (error: any) {
        console.error(`[BuildArtifacts] Error retrieving artifacts:`, error)

        if (error.message?.includes('not found') || error.message?.includes('NoSuchKey')) {
          return reply.code(404).send({
            ok: false,
            error: {
              code: 'ARTIFACT_NOT_FOUND',
              message: 'Build artifact not found in storage',
            },
          })
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve build artifacts',
          },
        })
      } finally {
        // Clean up temp directory
        try {
          await fs.rm(tempDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  )
}
