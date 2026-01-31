'use client'

import { useState, useEffect } from 'react'
import { GeneratedTemplatePreview } from './preview/generated-template-preview'
import { useBuilderStore, selectors } from '@/store/builder-store'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { logger } from '@/utils/logger'

interface TemplateIntegrationProps {
  project: {
    id: string
    name: string
    templateData?: any
    hasTemplate?: boolean
  }
  onTemplateImported?: () => void
}

export function TemplateIntegration({ project, onTemplateImported }: TemplateIntegrationProps) {
  const [isImported, setIsImported] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const currentSections = useBuilderStore(selectors.currentSections)
  const loadProjectData = useBuilderStore(state => state.loadProjectData)

  // Check if template is already imported by looking at builder store
  useEffect(() => {
    if (Object.keys(currentSections).length > 0) {
      setIsImported(true)
    }
  }, [currentSections])

  // Auto-show preview if project has template data and nothing is imported yet
  useEffect(() => {
    if (project.hasTemplate && project.templateData && !isImported && Object.keys(currentSections).length === 0) {
      setShowPreview(true)
      logger.info('🎨 Showing template preview for project', {
        projectId: project.id.slice(0, 8),
        hasTemplate: project.hasTemplate
      })
    }
  }, [project.hasTemplate, project.templateData, isImported, currentSections, project.id])

  const handleAutoImport = () => {
    if (!project.templateData) return

    try {
      // Automatically import template to builder
      logger.info('🚀 Auto-importing template to builder', {
        projectId: project.id.slice(0, 8)
      })

      // This will trigger the conversion process in GeneratedTemplatePreview
      setShowPreview(true)
    } catch (error) {
      logger.error('Failed to auto-import template', error)
    }
  }

  const handleTemplateImported = () => {
    setIsImported(true)
    setShowPreview(false)
    onTemplateImported?.()
    logger.info('✅ Template imported successfully', {
      projectId: project.id.slice(0, 8)
    })
  }

  // Don't show anything if no template data
  if (!project.hasTemplate || !project.templateData) {
    return null
  }

  // If already imported, show a simple status
  if (isImported && Object.keys(currentSections).length > 0) {
    return (
      <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center">
          <Icon name="check-circle" className="w-5 h-5 text-green-600 mr-2" />
          <div>
            <p className="text-sm font-medium text-green-800">Template Loaded</p>
            <p className="text-xs text-green-600">Your AI-generated template is now active in the builder</p>
          </div>
        </div>
      </div>
    )
  }

  // Show template preview/import interface
  return (
    <div className="mb-6">
      {!showPreview ? (
        // Template available banner
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Icon name="sparkles" className="w-5 h-5 text-blue-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-blue-800">AI Template Ready</p>
                <p className="text-xs text-blue-600">Your custom template is ready to import</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(true)}
              >
                Preview Template
              </Button>
              <Button
                size="sm"
                onClick={handleAutoImport}
              >
                Import Now
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // Full template preview
        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Template Preview</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(false)}
              >
                <Icon name="x" className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="p-6">
            <GeneratedTemplatePreview
              templateData={project.templateData}
              onImportToBuilder={handleTemplateImported}
            />
          </div>
        </div>
      )}
    </div>
  )
}