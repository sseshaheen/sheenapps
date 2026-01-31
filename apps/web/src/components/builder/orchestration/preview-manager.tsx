'use client'

import React, { useState, useRef, useEffect } from 'react'
import { m } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'




import { EnhancedPreview } from '../enhanced-preview'
import { GeneratedBusinessContent, BusinessAnalysis } from '@/services/ai/types'
import { generateCinematicTemplate, industryThemes } from '../cinematic-templates'
import { logger } from '@/utils/logger'

interface PreviewManagerProps {
  content?: GeneratedBusinessContent | null
  analysis?: BusinessAnalysis | null
  isGenerating: boolean
  buildProgress: number
  onEdit?: (section: string) => void
  onRegenerate?: (section: string) => void
  translations: {
    preview: {
      title: string
      loading: string
    }
  }
}

export function PreviewManager({
  content,
  analysis,
  isGenerating,
  buildProgress,
  onEdit,
  onRegenerate,
  translations
}: PreviewManagerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState('modern')
  const [previewKey, setPreviewKey] = useState(0)
  const previewRef = useRef<HTMLIFrameElement>(null)

  // Generate cinematic preview when content is available
  useEffect(() => {
    if (content && analysis) {
      generatePreview()
    }
  }, [content, analysis])

  const generatePreview = async () => {
    if (!content || !analysis) return

    try {
      // Map AI analysis to industry theme
      const themeMapping: Record<string, string> = {
        'technology': 'tech',
        'healthcare': 'medical',
        'finance': 'financial',
        'retail': 'ecommerce',
        'education': 'education',
        'real estate': 'realestate',
        'food': 'restaurant'
      }

      const industry = analysis.industry?.toLowerCase() || 'general'
      const mappedTheme = themeMapping[industry] || 'modern'
      setSelectedTheme(mappedTheme)

      // Create a GeneratedContent object compatible with generateCinematicTemplate
      const generatedContent = {
        hero: {
          headline: content.names[0]?.name || 'Your Business',
          subheadline: content.taglines[0]?.text || 'Excellence in every detail',
          cta: 'Get Started',
          backgroundConcept: 'gradient'
        },
        navigation: {
          logo: content.names[0]?.name || 'Logo',
          items: [
            { label: 'Home', href: '#home' },
            { label: 'Features', href: '#features' },
            { label: 'Pricing', href: '#pricing' },
            { label: 'Contact', href: '#contact' }
          ]
        },
        about: {
          title: 'About Us',
          story: `We are a leading ${analysis.industry?.toLowerCase() || 'business'} company focused on delivering exceptional results.`,
          mission: content.taglines[0]?.text || 'Excellence in every detail',
          values: ['Quality', 'Innovation', 'Customer Focus']
        },
        features: content.features.slice(0, 6).map((feature, index) => ({
          title: feature.name || `Feature ${index + 1}`,
          description: feature.description || '',
          icon: '⭐',
          benefit: feature.benefits?.[0] || feature.description || ''
        })),
        testimonials: [
          {
            name: 'Sarah Johnson',
            role: 'Customer',
            company: 'Local Business',
            quote: 'Excellent service and outstanding results!',
            rating: 5
          },
          {
            name: 'Mike Chen',
            role: 'Business Owner',
            company: 'Tech Startup',
            quote: 'Highly recommend their professional approach.',
            rating: 5
          }
        ],
        pricing: {
          model: 'subscription' as const,
          tiers: [
            {
              name: 'Starter',
              price: '$29',
              features: ['Basic features', 'Email support'],
              popular: false
            },
            {
              name: 'Pro',
              price: '$99',
              features: ['All features', 'Priority support', 'Advanced analytics'],
              popular: true
            }
          ]
        },
        footer: {
          tagline: `© 2024 ${content.names[0]?.name || 'Your Business'}. All rights reserved.`,
          sections: {
            Company: ['About', 'Team', 'Careers', 'Contact'],
            Services: content.features.slice(0, 3).map(f => f.name || 'Service').filter(Boolean),
            Support: ['Help Center', 'Documentation', 'Contact Us', 'FAQ']
          }
        }
      }

      // Generate cinematic template
      const template = generateCinematicTemplate(generatedContent)

      // Create preview HTML - template already contains full HTML
      const previewHTML = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${content.names[0]?.name || 'Preview'}</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        ${template}
        </html>
      `

      // Update iframe with new content
      if (previewRef.current) {
        const iframe = previewRef.current
        iframe.srcdoc = previewHTML
        setPreviewKey(prev => prev + 1) // Force re-render
      }

    } catch (error) {
      logger.error('Preview generation failed:', error)
    }
  }

  const refreshPreview = () => {
    generatePreview()
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  return (
    <div className={`flex flex-col bg-gray-950 ${isFullscreen ? 'fixed inset-0 z-50' : 'flex-1'}`}>
      {/* Header */}
      <m.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="p-4 border-b border-gray-800 flex items-center justify-between"
      >
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Icon name="globe" className="w-5 h-5 text-blue-400"  />
          {translations.preview.title}
        </h2>
        
        <div className="flex items-center gap-4">
          {/* Build Progress */}
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full text-xs">
            <Icon name="rocket" className="w-3 h-3 text-green-400"  />
            <span className="text-gray-400">
              {buildProgress >= 100 ? 'Complete' : 'Building'}
            </span>
            <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
              <m.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                initial={{ width: 0 }}
                animate={{ width: `${buildProgress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={refreshPreview}
              disabled={isGenerating}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh Preview"
            >
              <Icon name="refresh-cw" className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`}  />
            </button>
            
            <button
              onClick={toggleFullscreen}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Icon name="eye" className="w-4 h-4"  /> : <Icon name="maximize-2" className="w-4 h-4"  />}
            </button>
          </div>
          
          {/* Browser Controls */}
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
        </div>
      </m.div>
      
      {/* Preview Content */}
      <div className="flex-1 p-4">
        <m.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full h-full relative"
        >
          {isGenerating && !content ? (
            // Loading State
            <div className="w-full h-full bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center">
              <div className="text-center">
                <m.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 border-4 border-gray-600 border-t-purple-500 rounded-full mx-auto mb-4"
                />
                <h3 className="text-lg font-semibold text-white mb-2">
                  Generating Preview
                </h3>
                <p className="text-gray-400">
                  {translations.preview.loading}
                </p>
                <div className="mt-4 w-48 h-2 bg-gray-700 rounded-full overflow-hidden mx-auto">
                  <m.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${buildProgress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          ) : content ? (
            // Enhanced Preview with iframe fallback
            <div className="w-full h-full">
              <EnhancedPreview
                content={content}
                analysis={analysis}
                isGenerating={isGenerating}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
              />
              
              {/* Cinematic Preview Iframe */}
              <div className="absolute inset-0 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                <iframe
                  key={previewKey}
                  ref={previewRef}
                  className="w-full h-full border-0"
                  title="Live Preview"
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          ) : (
            // Empty State
            <div className="w-full h-full bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center">
              <div className="text-center">
                <Icon name="globe" className="w-12 h-12 text-gray-600 mx-auto mb-4"  />
                <h3 className="text-lg font-semibold text-white mb-2">
                  Preview Ready
                </h3>
                <p className="text-gray-400">
                  Your live preview will appear here
                </p>
              </div>
            </div>
          )}
        </m.div>
      </div>
      
      {isFullscreen && (
        <div className="absolute top-4 right-4">
          <button
            onClick={toggleFullscreen}
            className="p-3 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
          >
            <Icon name="eye" className="w-5 h-5"  />
          </button>
        </div>
      )}
    </div>
  )
}