'use client'

import { useEffect, useState, useRef } from 'react'
import { useComponentMap } from '@/hooks/use-component-map'
import { abTestingService } from '@/services/analytics/ab-testing'
import { getStyleWithTokens } from '@/utils/tokens-to-css-vars'
import { useBuilderStore } from '@/store/builder-store'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { templateRenderer } from '@/services/template-renderer'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { processGA4Event } from '@/config/analytics-config'
import { ErrorBoundary } from '@/components/ui/error-boundary'
// Import analytics when available
const analytics = {
  track: (event: string, data: any) => {
    // eslint-disable-next-line no-restricted-globals
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics] ${event}:`, data)
    }

    // ✅ BACKEND CONFIRMED: Connect to existing analytics provider
    try {
      // Use existing analytics configuration
      processGA4Event(event, data)
    } catch (error) {
      console.error('Analytics tracking failed:', error)
    }
  }
}

interface GeneratedTemplatePreviewProps {
  templateData: any
  onImportToBuilder?: () => void
}

function GeneratedTemplatePreviewInternal({ 
  templateData, 
  onImportToBuilder 
}: GeneratedTemplatePreviewProps) {
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const renderStartTime = useRef<number>(Date.now())
  const { getSectionType, isLoading: isMappingLoading, hasABOverrides } = useComponentMap(templateData?.metadata?.industry_tags?.[0])
  const { loadProjectData } = useBuilderStore()

  // Apply design tokens as CSS variables
  const styleWithTokens = getStyleWithTokens(templateData?.metadata?.design_tokens)

  // Performance monitoring
  useEffect(() => {
    performance.mark('preview-start')
    
    return () => {
      performance.mark('preview-end')
      try {
        performance.measure('preview-generation', 'preview-start', 'preview-end')
        const measure = performance.getEntriesByName('preview-generation')[0]
        const duration = measure?.duration || (Date.now() - renderStartTime.current)
        
        // Console warning for slow renders
        if (duration > 500) {
          console.warn(`⚠️ Slow preview render: ${duration.toFixed(2)}ms`)
        }
        
        // Analytics tracking
        analytics.track('preview_success', {
          duration_ms: Math.round(duration),
          template_id: templateData?.id || 'unknown',
          component_count: Object.keys(templateData?.metadata?.components || {}).length,
          has_design_tokens: !!templateData?.metadata?.design_tokens,
          has_ab_overrides: hasABOverrides
        })
        
        // Clean up performance marks
        performance.clearMarks('preview-start')
        performance.clearMarks('preview-end')
        performance.clearMeasures('preview-generation')
      } catch (err) {
        console.error('Performance measurement error:', err)
      }
    }
  }, [templateData])

  const handleImportToBuilder = async () => {
    try {
      setIsConverting(true)
      setError(null)

      // Use secure renderer if feature flag is enabled
      let processedTemplate = templateData
      if (FEATURE_FLAGS.ENABLE_PREVIEW_V2) {
        console.log('Using secure template renderer...')
        const renderResult = await templateRenderer.renderTemplate(templateData)
        
        if (!renderResult.success) {
          throw new Error(renderResult.error?.message || 'Failed to render template securely')
        }
        
        processedTemplate = renderResult.data
      }

      // Validate template data
      if (!processedTemplate?.metadata?.components) {
        throw new Error('No components found in template data')
      }

      // Convert template components to builder sections
      const sectionsArray = Object.entries(processedTemplate.metadata.components).map(([componentName, componentData]: [string, any]) => {
        const sectionType = getSectionType(componentName)
        
        // Generate unique ID for section
        const sectionId = `${sectionType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        return {
          id: sectionId,
          type: sectionType as 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'footer',
          content: {
            html: '', // Let builder render from props
            props: componentData.propsSchema || {}
          },
          styles: {
            css: '',
            variables: templateData.metadata.design_tokens ? 
              Object.entries(getStyleWithTokens(templateData.metadata.design_tokens))
                .reduce((acc, [key, value]) => {
                  acc[key] = String(value)
                  return acc
                }, {} as Record<string, string>) : {}
          },
          metadata: {
            lastModified: Date.now(),
            userAction: 'AI Generated',
            aiGenerated: true,
            originalComponent: componentName
          }
        }
      })

      // Convert sections array to object keyed by section ID for loadProjectData
      const sections = sectionsArray.reduce((acc, section) => {
        acc[section.id] = section
        return acc
      }, {} as Record<string, any>)

      // Load sections into builder store
      loadProjectData({ sections })

      // Record A/B test conversion if applicable
      if (hasABOverrides) {
        // This is a significant conversion event - user imported AI template to builder
        abTestingService.recordResult(
          'hero_component_mapping', // Test ID - should match active test
          '', // Variant ID - will be resolved by service
          getSessionId(), // Session ID helper
          'conversion',
          {
            template_id: templateData?.id,
            component_count: sectionsArray.length,
            sections_imported: sectionsArray.map(s => s.type),
            action: 'import_to_builder'
          }
        ).catch(err => {
          console.warn('Failed to record A/B test conversion:', err)
        })
      }

      // Call parent callback if provided
      if (onImportToBuilder) {
        onImportToBuilder()
      }
    } catch (err) {
      console.error('Failed to import template:', err)
      setError(err instanceof Error ? err.message : 'Failed to import template')
      
      // Track error in analytics
      analytics.track('preview_error', {
        error_message: err instanceof Error ? err.message : String(err),
        template_id: templateData?.id || 'unknown',
        component_count: Object.keys(templateData?.metadata?.components || {}).length,
        has_ab_overrides: hasABOverrides
      })

      // Record A/B test error if applicable
      if (hasABOverrides) {
        abTestingService.recordResult(
          'hero_component_mapping',
          '',
          getSessionId(),
          'error',
          {
            template_id: templateData?.id,
            error_message: err instanceof Error ? err.message : String(err),
            action: 'import_to_builder_failed'
          }
        ).catch(recordErr => {
          console.warn('Failed to record A/B test error:', recordErr)
        })
      }
    } finally {
      setIsConverting(false)
    }
  }

  // Preview rendering of components
  const renderComponentPreview = (componentName: string, propsSchema: any) => {
    const sectionType = getSectionType(componentName)
    
    return (
      <div key={componentName} className="border rounded-lg p-4 mb-4 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-lg">{componentName}</h3>
          <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
            → {sectionType}
          </span>
        </div>
        
        {/* Show key props */}
        <div className="text-sm text-gray-600 space-y-1">
          {propsSchema.title && (
            <p><span className="font-medium">Title:</span> {propsSchema.title}</p>
          )}
          {propsSchema.subtitle && (
            <p><span className="font-medium">Subtitle:</span> {propsSchema.subtitle}</p>
          )}
          {propsSchema.features && Array.isArray(propsSchema.features) && (
            <p><span className="font-medium">Features:</span> {propsSchema.features.length} items</p>
          )}
          {propsSchema.plans && Array.isArray(propsSchema.plans) && (
            <p><span className="font-medium">Plans:</span> {propsSchema.plans.length} tiers</p>
          )}
          {propsSchema.testimonials && Array.isArray(propsSchema.testimonials) && (
            <p><span className="font-medium">Testimonials:</span> {propsSchema.testimonials.length} reviews</p>
          )}
        </div>
      </div>
    )
  }

  if (isMappingLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Icon name="loader-2" className="w-6 h-6 animate-spin mr-2" />
        <span>Loading component mappings...</span>
      </div>
    )
  }

  return (
    <div className="generated-template-preview" style={styleWithTokens}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Generated Template Preview</h2>
        <p className="text-gray-600">
          Your AI-generated template is ready. Review the components below and import them to the builder.
        </p>
      </div>

      {/* Design Tokens Preview */}
      {templateData?.metadata?.design_tokens && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">Design System</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {templateData.metadata.design_tokens.colors && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Colors</p>
                <div className="flex gap-2">
                  {Object.entries(templateData.metadata.design_tokens.colors).slice(0, 3).map(([name, color]) => (
                    <div
                      key={name}
                      className="w-8 h-8 rounded border"
                      style={{ backgroundColor: color as string }}
                      title={`${name}: ${color}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {templateData.metadata.design_tokens.fonts?.heading && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Heading Font</p>
                <p className="font-medium" style={{ fontFamily: templateData.metadata.design_tokens.fonts.heading }}>
                  {templateData.metadata.design_tokens.fonts.heading}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Components Preview */}
      <div className="mb-6">
        <h3 className="font-semibold mb-3">Components to Import</h3>
        {templateData?.metadata?.components ? (
          <div className="space-y-3">
            {Object.entries(templateData.metadata.components).map(([name, data]: [string, any]) => 
              renderComponentPreview(name, data.propsSchema || {})
            )}
          </div>
        ) : (
          <p className="text-gray-500">No components found in template</p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <Icon name="alert-circle" className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Import Error</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Import Action */}
      <div className="flex justify-end">
        <Button
          onClick={handleImportToBuilder}
          disabled={isConverting || !templateData?.metadata?.components}
          size="lg"
          className="min-w-[200px]"
        >
          {isConverting ? (
            <>
              <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
              Converting...
            </>
          ) : (
            <>
              Import to Builder
              <Icon name="arrow-right" className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// Helper function to get session ID
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'
  
  let sessionId = sessionStorage.getItem('ab-session-id')
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem('ab-session-id', sessionId)
  }
  return sessionId
}

// Export component wrapped with error boundary
export function GeneratedTemplatePreview(props: GeneratedTemplatePreviewProps) {
  return (
    <ErrorBoundary 
      context="GeneratedTemplatePreview"
      onError={(error, errorInfo) => {
        // Custom error handling for template preview
        analytics.track('template_preview_error', {
          error: error.message,
          stack: error.stack,
          templateId: props.templateData?.id || 'unknown',
          componentCount: Object.keys(props.templateData?.metadata?.components || {}).length,
          errorBoundary: true
        })
      }}
    >
      <GeneratedTemplatePreviewInternal {...props} />
    </ErrorBoundary>
  )
}
