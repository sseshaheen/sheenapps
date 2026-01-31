import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Create Supabase client with auth header for private sites (least-privilege principle)
function createSupabaseClient(req: Request) {
  const authHeader = req.headers.get('Authorization')

  // Use service role only for public sites, otherwise use user JWT
  const key = authHeader?.startsWith('Bearer ')
    ? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    key,
    authHeader ? {
      global: { headers: { Authorization: authHeader } }
    } : {}
  )
}

serve(async (req: Request) => {
  const url = new URL(req.url)
  const subdomain = url.hostname.split('.')[0]

  // Security: reject dangerous paths
  if (url.pathname.includes('..') || url.pathname.includes('~')) {
    return new Response('Invalid path', { status: 400 })
  }

  try {
    const supabase = createSupabaseClient(req)

    // 1. Get published project
    const { data: project } = await supabase
      .from('projects')
      .select(`
        id,
        branches!inner(
          head_id,
          commits!inner(tree_hash)
        )
      `)
      .eq('subdomain', subdomain)
      .eq('branches.name', 'main')
      .eq('branches.is_published', true)
      .single()

    if (!project) {
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Site Not Found</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: system-ui; text-align: center; padding: 2rem;">
            <h1>🔍 Site Not Found</h1>
            <p>The site "${subdomain}" could not be found.</p>
            <p><a href="https://www.sheenapps.com">Create your site with SheenApps</a></p>
          </body>
        </html>
      `, {
        status: 404,
        headers: { 'Content-Type': 'text/html' }
      })
    }

    const commitId = project.branches[0].head_id
    const buildPath = `builds/${project.id}/${commitId}.zip`

    // 2. Check if pre-extracted build exists (for sites > 3MB to keep P95 TTFB sub-200ms)
    const extractedPath = `builds/${project.id}/${commitId}/`
    const requestedFile = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)

    const { data: extractedFile } = await supabase.storage
      .from('builds')
      .download(`${extractedPath}${requestedFile}`)
      .catch(() => ({ data: null }))

    if (extractedFile) {
      // Serve pre-extracted file
      const content = await extractedFile.text()
      const mimeType = getMimeType(requestedFile)

      return new Response(content, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600'
        }
      })
    }

    // 3. Fallback: stream from zip (for smaller sites)
    const { data: buildData } = await supabase.storage
      .from('builds')
      .download(buildPath)

    if (!buildData) {
      return new Response('Build not found', { status: 404 })
    }

    // Note: JSZip adds ~400KB cold-start; consider native Deno.readZip or pre-extraction for large sites
    const zip = new JSZip()
    const contents = await zip.loadAsync(buildData)
    const file = contents.files[requestedFile]

    if (!file) {
      return new Response('File not found', { status: 404 })
    }

    const content = await file.async('text')
    const mimeType = getMimeType(requestedFile)

    return new Response(content, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600'
      }
    })

  } catch (error) {
    console.error('Site router error:', error)
    return new Response('Internal server error', { status: 500 })
  }
})

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon'
  }
  return mimeTypes[ext || ''] || 'text/plain'
}
