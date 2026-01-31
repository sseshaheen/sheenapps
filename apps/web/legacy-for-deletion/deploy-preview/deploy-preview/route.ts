import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { LocalPreviewServer } from '@/services/local-preview-server'
import { promises as fs } from 'fs'
import path from 'path'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const templateData = await req.json()
    
    logger.info(`🚀 Starting preview deployment for project: ${projectId}`)
    logger.info(`📋 Template data keys:`, Object.keys(templateData))
    logger.info(`📁 Files count:`, templateData.files?.length || templateData.templateFiles?.length || 0)
    
    // Log first few files to debug
    if (templateData.files?.length > 0) {
      logger.info(`📄 First file in 'files':`, templateData.files[0])
    }
    if (templateData.templateFiles?.length > 0) {
      logger.info(`📄 First file in 'templateFiles':`, templateData.templateFiles[0])
    }
    
    if (process.env.NODE_ENV === 'development') {
      // Set building status
      buildStatusMap.set(projectId, { status: 'building', timestamp: Date.now() });
      
      try {
        // Development: use local preview server
        const previewUrl = await LocalPreviewServer.buildAndServePreview(projectId, templateData)
        
        // Set ready status
        buildStatusMap.set(projectId, { status: 'ready', timestamp: Date.now() });
        
        return NextResponse.json({
          success: true,
          previewUrl,
          status: 'ready',
          message: 'Local preview built and ready',
          environment: 'development'
        })
      } catch (buildError) {
        // Set error status
        buildStatusMap.set(projectId, { status: 'error', timestamp: Date.now() });
        throw buildError;
      }
    } else {
      // Production: use hosted preview (mock for now)
      const previewUrl = `https://preview--${projectId}.sheenapps.com`
      
      // Simulate build process
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      return NextResponse.json({
        success: true,
        previewUrl,
        status: 'building',
        message: 'Preview deployment initiated',
        environment: 'production'
      })
    }
    
  } catch (error) {
    logger.error('Preview deployment failed:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Preview deployment failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Simple in-memory store for build status (in production, use Redis or database)
const buildStatusMap = new Map<string, { status: string; timestamp: number }>();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    
    // Check if we have a build status
    const buildStatus = buildStatusMap.get(projectId);
    const now = Date.now();
    
    // If build is older than 5 minutes, assume it's ready
    if (buildStatus && (now - buildStatus.timestamp) < 5 * 60 * 1000) {
      return NextResponse.json({
        success: true,
        status: buildStatus.status,
        previewUrl: LocalPreviewServer.getPreviewUrl(projectId),
        lastBuilt: new Date(buildStatus.timestamp).toISOString(),
        environment: process.env.NODE_ENV
      })
    }
    
    // Check if the preview actually exists
    const previewsDir = path.join(process.cwd(), 'tmp', 'previews', projectId, 'dist', 'index.html');
    const previewExists = await fs.access(previewsDir).then(() => true).catch(() => false);
    
    return NextResponse.json({
      success: true,
      status: previewExists ? 'ready' : 'not_found',
      previewUrl: LocalPreviewServer.getPreviewUrl(projectId),
      lastBuilt: new Date().toISOString(),
      environment: process.env.NODE_ENV
    })
    
  } catch (error) {
    logger.error('Preview status check failed:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Status check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}