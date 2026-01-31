import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { logger } from '@/utils/logger'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Local preview only available in development' }, { status: 403 })
  }

  try {
    const { path: pathSegments } = await params
    
    // First segment is the project ID, rest is the file path
    const projectId = pathSegments[0]
    const filePath = pathSegments.length > 1 
      ? '/' + pathSegments.slice(1).join('/') 
      : '/index.html'
    
    logger.info(`Local preview request: projectId=${projectId}, filePath=${filePath}`)
    
    // Build the full path to the built file
    const previewsDir = path.join(process.cwd(), 'tmp', 'previews')
    const projectDir = path.join(previewsDir, projectId)
    const distDir = path.join(projectDir, 'dist')
    const requestedFile = path.join(distDir, filePath)
    
    // Security check: ensure the file is within the project directory
    if (!requestedFile.startsWith(distDir)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }
    
    // Check if the file exists
    try {
      await fs.access(requestedFile)
    } catch {
      // If index.html doesn't exist, return a helpful message
      if (filePath === '/index.html') {
        return new NextResponse(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Preview Building</title>
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  background: #f9fafb;
                }
                .container { text-align: center; }
                .spinner { 
                  width: 50px; 
                  height: 50px; 
                  border: 3px solid #e5e7eb;
                  border-top: 3px solid #3b82f6;
                  border-radius: 50%;
                  animation: spin 1s linear infinite;
                  margin: 0 auto 20px;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="spinner"></div>
                <h2>Building Preview...</h2>
                <p>Project: ${projectId}</p>
                <p>This may take a moment while we compile your template.</p>
              </div>
            </body>
          </html>
        `, { 
          headers: { 'Content-Type': 'text/html' }
        })
      }
      
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    
    // Read the file
    let fileContent = await fs.readFile(requestedFile)
    
    // Determine content type based on file extension
    const ext = path.extname(requestedFile).toLowerCase()
    const contentTypeMap: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    }
    
    const contentType = contentTypeMap[ext] || 'application/octet-stream'
    
    // For HTML files, rewrite asset paths to include the API route prefix
    if (ext === '.html') {
      const htmlContent = fileContent.toString('utf-8')
      const rewrittenContent = htmlContent
        .replace(/src="\/assets\//g, `src="/api/local-preview/${projectId}/assets/`)
        .replace(/href="\/assets\//g, `href="/api/local-preview/${projectId}/assets/`)
        .replace(/href="\/vite\.svg"/g, `href="/api/local-preview/${projectId}/vite.svg"`)
      fileContent = Buffer.from(rewrittenContent)
    }
    
    return new NextResponse(fileContent as any, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
    
  } catch (error) {
    logger.error('Local preview serve error:', error)
    return NextResponse.json({ error: 'Failed to serve preview' }, { status: 500 })
  }
}