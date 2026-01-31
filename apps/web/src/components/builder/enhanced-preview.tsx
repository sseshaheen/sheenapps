'use client'

import React, { useState } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon, { IconName } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { GeneratedBusinessContent, BusinessAnalysis } from '@/services/ai/types'
import { useEditingGuidanceStore } from '@/store/editing-guidance-store'

interface EnhancedPreviewProps {
  content: GeneratedBusinessContent | null
  analysis: BusinessAnalysis | null
  isGenerating: boolean
  onEdit?: (section: string) => void
  onRegenerate?: (section: string) => void
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile'

export function EnhancedPreview({ 
  content, 
  analysis, 
  isGenerating, 
  onEdit, 
  onRegenerate 
}: EnhancedPreviewProps) {
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop')
  // const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [showEditOverlay, setShowEditOverlay] = useState(false)

  const viewportSizes = {
    desktop: { width: '100%', height: '100%', scale: 1 },
    tablet: { width: '768px', height: '1024px', scale: 0.7 },
    mobile: { width: '375px', height: '667px', scale: 0.8 }
  }

  const currentSize = viewportSizes[viewportMode]

  if (isGenerating) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 rounded-lg">
        <div className="text-center">
          <m.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 mx-auto mb-4"
          >
            <Icon name="sparkles" className="w-16 h-16 text-purple-400"  />
          </m.div>
          
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            <div className="w-64 h-4 bg-gray-800 rounded-full overflow-hidden mx-auto">
              <m.div
                className="h-full bg-gradient-to-r from-purple-600 to-pink-600"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            </div>
            <p className="text-purple-400 font-medium">Creating your business...</p>
            <p className="text-gray-400 text-sm">AI is generating amazing content for you</p>
          </m.div>
        </div>
      </div>
    )
  }

  if (!content || !analysis) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 rounded-lg">
        <div className="text-center text-gray-400">
          <Icon name="eye" className="w-12 h-12 mx-auto mb-4 opacity-50"  />
          <p>Your business preview will appear here</p>
          <p className="text-sm mt-2">Share your business idea to see the magic happen</p>
        </div>
      </div>
    )
  }

  const selectedName = content.names[0]?.name || 'Your Business'
  const selectedTagline = content.taglines[0]?.text || 'Building something amazing'
  const primaryColor = analysis.brandPersonality.includes('Professional') ? '#3b82f6' : '#8b5cf6'

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 rounded-lg overflow-hidden">
      {/* Preview Controls */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-800 rounded-md p-1">
            {[
              { mode: 'desktop' as ViewportMode, iconName: 'globe' as IconName },
              { mode: 'tablet' as ViewportMode, iconName: 'layout-grid' as IconName },
              { mode: 'mobile' as ViewportMode, iconName: 'menu' as IconName }
            ].map(({ mode, iconName }) => (
              <button
                key={mode}
                onClick={() => setViewportMode(mode)}
                className={cn(
                  'p-2 rounded transition-colors',
                  viewportMode === mode 
                    ? 'bg-purple-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                )}
              >
                <Icon name={iconName} className="w-4 h-4" />
              </button>
            ))}
          </div>
          
          <div className="text-sm text-gray-400">
            {currentSize.width} × {currentSize.height}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditOverlay(!showEditOverlay)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              showEditOverlay 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            )}
          >
            <Icon name="edit" className="w-4 h-4 mr-1.5"  />
            Edit Mode
          </button>
          
          <button
            onClick={() => onRegenerate?.('all')}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded-md text-sm font-medium transition-colors"
          >
            <Icon name="refresh-cw" className="w-4 h-4 mr-1.5"  />
            Regenerate
          </button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 p-6 overflow-auto">
        <m.div
          className="mx-auto transition-all duration-500 ease-out"
          style={{
            width: currentSize.width,
            minHeight: currentSize.height,
            transform: `scale(${currentSize.scale})`,
            transformOrigin: 'top center'
          }}
          layout
        >
          <div className="bg-white rounded-lg shadow-2xl overflow-hidden relative">
            {/* Hero Section */}
            <EditableSection
              id="hero"
              isEditable={showEditOverlay}
              onEdit={() => onEdit?.('hero')}
              onRegenerate={() => onRegenerate?.('hero')}
            >
              <div 
                className="relative px-8 py-16 text-center text-white"
                style={{ 
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)` 
                }}
              >
                <m.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <h1 className="text-4xl font-bold mb-4">{selectedName}</h1>
                  <p className="text-xl opacity-90 mb-6">{selectedTagline}</p>
                  <button className="bg-white text-gray-900 px-8 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors">
                    Get Started
                  </button>
                </m.div>
                
                {/* Floating badges */}
                <m.div
                  className="absolute top-6 right-6 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-sm"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  ✨ AI-Generated
                </m.div>
              </div>
            </EditableSection>

            {/* Features Section */}
            <EditableSection
              id="features"
              isEditable={showEditOverlay}
              onEdit={() => onEdit?.('features')}
              onRegenerate={() => onRegenerate?.('features')}
            >
              <div className="px-8 py-12">
                <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
                  What We Offer
                </h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {content.features.slice(0, 3).map((feature, index) => (
                    <m.div
                      key={feature.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="text-center p-6 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Icon name="check-circle" className="w-6 h-6 text-purple-600"  />
                      </div>
                      <h3 className="font-semibold mb-2 text-gray-800">{feature.name}</h3>
                      <p className="text-gray-600 text-sm">{feature.description}</p>
                    </m.div>
                  ))}
                </div>
              </div>
            </EditableSection>

            {/* Pricing Section */}
            <EditableSection
              id="pricing"
              isEditable={showEditOverlay}
              onEdit={() => onEdit?.('pricing')}
              onRegenerate={() => onRegenerate?.('pricing')}
            >
              <div className="px-8 py-12 bg-gray-50">
                <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
                  Simple Pricing
                </h2>
                <div className="max-w-4xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {content.pricing.tiers.map((tier, index) => (
                    <m.div
                      key={tier.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={cn(
                        'bg-white rounded-lg p-6 shadow-lg border-2 transition-transform hover:scale-105',
                        tier.popular ? 'border-purple-500' : 'border-gray-200'
                      )}
                    >
                      {tier.popular && (
                        <div className="bg-purple-500 text-white text-sm font-medium px-3 py-1 rounded-full text-center mb-4">
                          Most Popular
                        </div>
                      )}
                      <h3 className="font-bold text-xl mb-2 text-gray-800">{tier.name}</h3>
                      <div className="text-3xl font-bold mb-4" style={{ color: primaryColor }}>
                        {tier.price}
                      </div>
                      <p className="text-gray-600 mb-6">{tier.description}</p>
                      <button 
                        className="w-full py-2 rounded-lg font-medium transition-colors"
                        style={{ 
                          backgroundColor: tier.popular ? primaryColor : 'transparent',
                          color: tier.popular ? 'white' : primaryColor,
                          border: `2px solid ${primaryColor}`
                        }}
                      >
                        Choose Plan
                      </button>
                    </m.div>
                  ))}
                </div>
              </div>
            </EditableSection>

            {/* Footer */}
            <div className="px-8 py-6 bg-gray-800 text-white text-center">
              <p className="text-sm opacity-75">
                Built with SheenApps AI Builder • Powered by Real AI
              </p>
            </div>
          </div>
        </m.div>
      </div>
    </div>
  )
}

interface EditableSectionProps {
  id: string
  children: React.ReactNode
  isEditable: boolean
  onEdit?: () => void
  onRegenerate?: () => void
}

function EditableSection({ id, children, isEditable, onEdit, onRegenerate }: EditableSectionProps) {
  const [isHovered, setIsHovered] = useState(false)
  
  // Check if guidance wants to show edit button for hero section
  const shouldShowHeroEditButton = useEditingGuidanceStore(state => state.shouldShowHeroEditButton)
  const isHeroSection = id === 'hero'
  
  // Show edit buttons when hovered OR when guidance requests it for hero
  const shouldShowEditButtons = isHovered || (isHeroSection && shouldShowHeroEditButton)

  if (!isEditable) {
    return <div>{children}</div>
  }

  return (
    <div
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      
      <AnimatePresence>
        {shouldShowEditButtons && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "absolute inset-0 rounded-lg pointer-events-none",
              isHeroSection && shouldShowHeroEditButton && !isHovered
                ? "bg-purple-500/15 border-2 border-purple-500 animate-pulse"  // Special styling for guidance
                : "bg-blue-500/10 border-2 border-blue-500"  // Normal hover styling
            )}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shouldShowEditButtons && (
          <m.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ 
              opacity: 1, 
              scale: 1,
              // Add gentle pulse for guidance
              ...(isHeroSection && shouldShowHeroEditButton && !isHovered && {
                scale: [1, 1.05, 1],
                transition: {
                  scale: {
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }
                }
              })
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-4 right-4 flex gap-2"
          >
            <button
              onClick={onEdit}
              className={cn(
                "text-white p-2 rounded-lg shadow-lg transition-colors",
                isHeroSection && shouldShowHeroEditButton && !isHovered
                  ? "bg-purple-600 hover:bg-purple-700 ring-2 ring-purple-300 ring-opacity-50"  // Special styling for guidance
                  : "bg-blue-600 hover:bg-blue-700"  // Normal styling
              )}
            >
              <Icon name="edit" className="w-4 h-4"  />
            </button>
            <button
              onClick={onRegenerate}
              className="bg-purple-600 text-white p-2 rounded-lg shadow-lg hover:bg-purple-700 transition-colors"
            >
              <Icon name="sparkles" className="w-4 h-4"  />
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}