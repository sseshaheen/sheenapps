import { NextRequest, NextResponse } from 'next/server'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

async function handleExport(request: NextRequest, { user }: { user: any }) {
  try {
    const { projectId, format } = await request.json()
    
    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    if (!format || !['html', 'json', 'zip'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid export format. Must be html, json, or zip' },
        { status: 400 }
      )
    }

    logger.info('📤 Export request', {
      userId: user?.id?.slice(0, 8),
      projectId: projectId.slice(0, 8),
      format,
      quotaConsumed: 0, // TODO: Replace when quota system is ready
      quotaRemaining: 0 // TODO: Replace when quota system is ready
    })

    const supabase = await createServerSupabaseClientNew()
    
    // Validate project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('owner_id', user.id)
      .single()

    if (projectError || !project) {
      logger.error('Project not found or access denied', {
        projectId,
        userId: user.id,
        error: projectError
      })
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      )
    }

    // Track export in database
    const { error: trackingError } = await supabase
      .from('export_logs')
      .insert({
        project_id: projectId,
        user_id: user.id,
        format,
        exported_at: new Date().toISOString()
      })

    if (trackingError) {
      logger.error('Failed to track export', trackingError)
      // Continue with export even if tracking fails
    }

    // Generate export data based on format
    let exportData
    let contentType
    let fileName

    switch (format) {
      case 'html':
        exportData = generateHTMLExport(project)
        contentType = 'text/html'
        fileName = `${(project as any).name.replace(/[^a-z0-9]/gi, '-')}.html`
        break
      case 'json':
        exportData = JSON.stringify(project, null, 2)
        contentType = 'application/json'
        fileName = `${(project as any).name.replace(/[^a-z0-9]/gi, '-')}.json`
        break
      case 'zip':
        // For zip, we'd typically generate a zip file with all assets
        // For now, return a placeholder response
        return NextResponse.json({
          success: true,
          message: 'ZIP export coming soon',
          format: 'zip'
        })
      default:
        return NextResponse.json(
          { error: 'Unsupported format' },
          { status: 400 }
        )
    }

    // Return the export data
    return new NextResponse(exportData, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Quota-Remaining': String(0) // TODO: Replace when quota system is ready
      }
    })

  } catch (error) {
    logger.error('Export error:', error)
    return NextResponse.json(
      { error: 'Failed to export project' },
      { status: 500 }
    )
  }
}

function generateHTMLExport(project: any): string {
  // Simple HTML template for export
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 { color: #2563eb; }
        .metadata {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .content {
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <h1>${project.name}</h1>
    <div class="metadata">
        <p><strong>Project ID:</strong> ${project.id}</p>
        <p><strong>Created:</strong> ${new Date(project.created_at).toLocaleDateString()}</p>
        <p><strong>Last Updated:</strong> ${new Date(project.updated_at).toLocaleDateString()}</p>
    </div>
    <div class="content">
        ${project.config ? `<pre>${JSON.stringify(project.config, null, 2)}</pre>` : '<p>No configuration data</p>'}
    </div>
    <footer>
        <p>Exported from SheenApps.ai on ${new Date().toLocaleDateString()}</p>
    </footer>
</body>
</html>`
}

export const POST = authPresets.authenticated(handleExport)