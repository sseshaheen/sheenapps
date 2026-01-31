/**
 * SheenApps Dispatch Worker
 *
 * This is the routing worker for Easy Mode projects.
 * It handles incoming requests to *.sheenapps.com and routes them to:
 *
 * 1. Static assets (served directly from R2)
 * 2. User project Workers (via Workers for Platforms dispatch namespace)
 *
 * Architecture:
 * ```
 * Request to myblog.sheenapps.com
 *     │
 *     ▼
 * Dispatch Worker (this file)
 *     │
 *     ├─── Static asset? (/static/*, /_next/*, favicon.ico, etc.)
 *     │    └── Serve from R2: /builds/{projectId}/{buildId}/...
 *     │
 *     └─── Dynamic route?
 *          └── Dispatch to user Worker in namespace
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

interface Env {
  // KV for hostname → projectId mapping
  HOSTNAME_MAP: KVNamespace

  // KV for projectId → buildId mapping
  PROJECT_BUILDS: KVNamespace

  // R2 bucket for static assets
  ASSETS: R2Bucket

  // Workers for Platforms dispatch namespace
  DISPATCH_NAMESPACE?: {
    get(name: string): { fetch(request: Request): Promise<Response> }
  }

  // Environment variables
  ENVIRONMENT: string
  DEFAULT_DOMAIN: string
  WFP_ENABLED?: string
  FALLBACK_ORIGIN?: string
  FALLBACK_AUTH_HEADER?: string
  FALLBACK_AUTH_TOKEN?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Static asset patterns (served from R2)
const STATIC_PATTERNS = [
  /^\/_next\/static\//,     // Next.js static files (content-hashed)
  /^\/static\//,            // Generic static folder
  /^\/public\//,            // Public folder
  /^\/assets\//,            // Assets folder
  /^\/images\//,            // Images folder
  /^\/fonts\//,             // Fonts folder
  /^\/favicon\.ico$/,       // Favicon
  /^\/robots\.txt$/,        // Robots.txt
  /^\/sitemap\.xml$/,       // Sitemap
  /^\/manifest\.json$/,     // PWA manifest
  /^\/sw\.js$/,             // Service worker
  /\.(css|js|map|json|xml|txt|ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/i,
]

// Cache control headers for static assets
const ASSET_CACHE_CONTROL = [
  // Immutable assets (content-hashed)
  { test: (p: string) => p.startsWith('/_next/static/'), value: 'public, max-age=31536000, immutable' },
  // HTML should not be cached
  { test: (p: string) => p.endsWith('.html'), value: 'public, max-age=0, must-revalidate' },
  // Non-hashed assets should revalidate quickly to prevent stale builds
  { test: (_p: string) => true, value: 'public, max-age=0, must-revalidate' },
]

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a path matches static asset patterns
 */
function isStaticAsset(pathname: string): boolean {
  return STATIC_PATTERNS.some(pattern => pattern.test(pathname))
}

/**
 * Get appropriate cache control header for an asset
 */
function getCacheControl(pathname: string): string {
  return ASSET_CACHE_CONTROL.find(rule => rule.test(pathname))!.value
}

/**
 * Get content type for a file based on extension
 */
function getContentType(pathname: string): string {
  const ext = pathname.split('.').pop()?.toLowerCase() || ''
  const contentTypes: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
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
  return contentTypes[ext] || 'application/octet-stream'
}

function buildUpstreamHeaders(original: Headers, additions: Record<string, string>): Headers {
  const headers = new Headers(original)
  for (const [key] of headers) {
    if (key.toLowerCase().startsWith('x-sheenapps-')) headers.delete(key)
  }
  headers.delete('host')
  for (const [key, value] of Object.entries(additions)) {
    headers.set(key, value)
  }
  return headers
}

function withAssetHeaders(
  asset: R2ObjectBody,
  pathname: string,
  projectId: string,
  buildId: string
): Headers {
  const headers = new Headers()
  asset.writeHttpMetadata(headers)
  if (asset.httpEtag) headers.set('ETag', asset.httpEtag)
  headers.set('Content-Type', getContentType(pathname))
  headers.set('Cache-Control', getCacheControl(pathname))
  headers.set('X-SheenApps-Project', projectId)
  headers.set('X-SheenApps-Build', buildId)
  return headers
}

function isNotModified(request: Request, asset: R2ObjectBody): boolean {
  const inm = request.headers.get('If-None-Match')
  return !!inm && !!asset.httpEtag && inm === asset.httpEtag
}

/**
 * Create a JSON error response
 */
function errorResponse(
  status: number,
  code: string,
  message: string
): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-SheenApps-Error': code,
      },
    }
  )
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const hostname = url.hostname
    const pathname = url.pathname
    const reqForWfp = request.clone()
    const reqForFallback = request.clone()

    // ---------------------------------------------------------------------
    // 1. Look up project from hostname
    // ---------------------------------------------------------------------

    const projectId = await env.HOSTNAME_MAP.get(hostname)

    if (!projectId) {
      // Check if this is the main domain (not a project subdomain)
      if (hostname === env.DEFAULT_DOMAIN || hostname === `www.${env.DEFAULT_DOMAIN}`) {
        // Redirect to marketing site or return info page
        return new Response('SheenApps - Build apps with AI', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      }

      return errorResponse(404, 'PROJECT_NOT_FOUND', `No project found for hostname: ${hostname}`)
    }

    // ---------------------------------------------------------------------
    // 2. Get current build ID for the project
    // ---------------------------------------------------------------------

    const buildId = await env.PROJECT_BUILDS.get(projectId)

    if (!buildId) {
      return errorResponse(404, 'BUILD_NOT_FOUND', 'No deployed build found for this project')
    }

    // ---------------------------------------------------------------------
    // 3. Check if this is a static asset request
    // ---------------------------------------------------------------------

    if (isStaticAsset(pathname)) {
      // Construct the R2 key: builds/{projectId}/{buildId}{pathname}
      const assetKey = `builds/${projectId}/${buildId}${pathname}`

      try {
        const asset = await env.ASSETS.get(assetKey)

        if (!asset) {
          // Try index.html for directory requests
          if (!pathname.includes('.') && !pathname.endsWith('/')) {
            const indexKey = `builds/${projectId}/${buildId}${pathname}/index.html`
            const indexAsset = await env.ASSETS.get(indexKey)
            if (indexAsset) {
              if (isNotModified(request, indexAsset)) {
                return new Response(null, { status: 304 })
              }
              const headers = withAssetHeaders(indexAsset, '/index.html', projectId, buildId)
              return new Response(request.method === 'HEAD' ? null : indexAsset.body, { headers })
            }
          }

          return errorResponse(404, 'ASSET_NOT_FOUND', `Asset not found: ${pathname}`)
        }

        if (isNotModified(request, asset)) {
          return new Response(null, { status: 304 })
        }
        const headers = withAssetHeaders(asset, pathname, projectId, buildId)
        return new Response(request.method === 'HEAD' ? null : asset.body, { headers })
      } catch (error) {
        console.error('R2 error:', error)
        return errorResponse(500, 'STORAGE_ERROR', 'Failed to fetch asset from storage')
      }
    }

    // ---------------------------------------------------------------------
    // 4. Dynamic route - dispatch to user Worker
    // ---------------------------------------------------------------------

    try {
      const wfpEnabled = env.WFP_ENABLED === 'true' && !!env.DISPATCH_NAMESPACE

      if (wfpEnabled) {
        // Get the user's Worker from the dispatch namespace
        const userWorker = env.DISPATCH_NAMESPACE.get(projectId)
        const wfpHeaders = buildUpstreamHeaders(request.headers, {
          'X-SheenApps-Project-Id': projectId,
          'X-SheenApps-Build-Id': buildId,
          'X-SheenApps-Original-Host': hostname,
          'X-SheenApps-Dispatch-Mode': 'wfp',
        })

        const wfpRequest = new Request(reqForWfp, { headers: wfpHeaders })

        try {
          const response = await userWorker.fetch(wfpRequest)
          if (response.status < 500) {
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: new Headers({
                ...Object.fromEntries(response.headers),
                'X-SheenApps-Project': projectId,
                'X-SheenApps-Build': buildId,
                'X-SheenApps-Dispatch-Mode': 'wfp',
              }),
            })
          }
        } catch {
          // Fall through to fallback
        }
      }

      if (!env.FALLBACK_ORIGIN) {
        return errorResponse(
          501,
          'DISPATCH_UNAVAILABLE',
          'Dispatch namespace not available and no fallback origin configured'
        )
      }

      const fallbackBase = new URL(env.FALLBACK_ORIGIN)
      const targetUrl = new URL(request.url)
      const basePath = fallbackBase.pathname.replace(/\/$/, '')
      targetUrl.protocol = fallbackBase.protocol
      targetUrl.host = fallbackBase.host
      targetUrl.pathname = `${basePath}${targetUrl.pathname}`

      const proxyHeaders = buildUpstreamHeaders(reqForFallback.headers, {
        'X-SheenApps-Project-Id': projectId,
        'X-SheenApps-Build-Id': buildId,
        'X-SheenApps-Original-Host': hostname,
        'X-SheenApps-Dispatch-Mode': 'fallback',
      })

      if (env.FALLBACK_AUTH_TOKEN) {
        proxyHeaders.set(
          env.FALLBACK_AUTH_HEADER || 'X-SheenApps-Dispatch-Secret',
          env.FALLBACK_AUTH_TOKEN
        )
      }

      const proxyRequest = new Request(targetUrl.toString(), {
        method: reqForFallback.method,
        headers: proxyHeaders,
        body: reqForFallback.body,
        redirect: reqForFallback.redirect,
      })

      const response = await fetch(proxyRequest)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers({
          ...Object.fromEntries(response.headers),
          'X-SheenApps-Project': projectId,
          'X-SheenApps-Build': buildId,
          'X-SheenApps-Dispatch-Mode': 'fallback',
        }),
      })
    } catch (error) {
      console.error('Dispatch error:', error)

      // Check if it's a "Worker not found" error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return errorResponse(404, 'WORKER_NOT_FOUND', 'Project Worker not deployed')
      }

      return errorResponse(502, 'DISPATCH_ERROR', 'Failed to dispatch request to project Worker')
    }
  },
}
