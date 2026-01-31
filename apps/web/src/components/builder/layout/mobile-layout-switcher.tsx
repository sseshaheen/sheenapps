'use client'

import { Button } from '@/components/ui/button'
import { MobileSheet } from '@/components/ui/mobile-sheet'
import { cn } from '@/lib/utils'
import { PREVIEW_IMPACTS } from '@/services/mock/preview-impacts'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { useEffect, useState } from 'react'
import { logger } from '@/utils/logger';
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { useBuilderStore, type SectionState } from '@/store/builder-store'

interface LayoutOption {
  id: string
  choiceId: keyof typeof PREVIEW_IMPACTS
  name: string
  description: string
  preview: string
  category: 'modern' | 'classic' | 'minimal' | 'creative'
  tags: string[]
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  // Primary 4 layouts (shown by default)
  {
    id: 'luxury-premium',
    choiceId: 'luxury-premium',
    name: 'Luxury Premium',
    description: 'Elegant and sophisticated design with premium aesthetics',
    preview: '/layouts/luxury-premium.jpg',
    category: 'modern',
    tags: ['Elegant', 'Premium']
  },
  {
    id: 'modern-minimal',
    choiceId: 'modern-minimal',
    name: 'Modern Minimal',
    description: 'Clean lines and minimalist approach for contemporary brands',
    preview: '/layouts/modern-minimal.jpg',
    category: 'minimal',
    tags: ['Clean', 'Modern']
  },
  {
    id: 'creative-bold',
    choiceId: 'bold-vibrant',
    name: 'Creative Bold',
    description: 'Vibrant and expressive design for creative businesses',
    preview: '/layouts/creative-bold.jpg',
    category: 'creative',
    tags: ['Bold', 'Vibrant']
  },
  {
    id: 'classic-professional',
    choiceId: 'classic-timeless',
    name: 'Classic Professional',
    description: 'Timeless and trustworthy design for established businesses',
    preview: '/layouts/classic-professional.jpg',
    category: 'classic',
    tags: ['Professional', 'Timeless']
  },
  // Additional 7 layouts (shown after "Show More")
  {
    id: 'warm-approachable',
    choiceId: 'warm-approachable',
    name: 'Warm & Friendly',
    description: 'Welcoming design that builds trust and connection',
    preview: '/layouts/warm-approachable.jpg',
    category: 'modern',
    tags: ['Friendly', 'Welcoming']
  },
  {
    id: 'boutique-exclusive',
    choiceId: 'boutique-exclusive',
    name: 'Boutique Elite',
    description: 'Exclusive and intimate design for premium brands',
    preview: '/layouts/boutique-exclusive.jpg',
    category: 'modern',
    tags: ['Exclusive', 'Intimate']
  },
  {
    id: 'eco-natural',
    choiceId: 'eco-natural',
    name: 'Eco Natural',
    description: 'Sustainable and organic design aesthetic',
    preview: '/layouts/eco-natural.jpg',
    category: 'minimal',
    tags: ['Eco', 'Natural']
  },
  {
    id: 'tech-modern',
    choiceId: 'tech-modern',
    name: 'Tech Forward',
    description: 'Cutting-edge design for tech-savvy businesses',
    preview: '/layouts/tech-modern.jpg',
    category: 'creative',
    tags: ['Tech', 'Modern']
  },
  {
    id: 'families-children',
    choiceId: 'families-children',
    name: 'Family Friendly',
    description: 'Playful and welcoming design for family services',
    preview: '/layouts/families-children.jpg',
    category: 'creative',
    tags: ['Family', 'Playful']
  },
  {
    id: 'young-professionals',
    choiceId: 'young-professionals',
    name: 'Professional Edge',
    description: 'Contemporary design for modern professionals',
    preview: '/layouts/young-professionals.jpg',
    category: 'modern',
    tags: ['Professional', 'Edge']
  },
  {
    id: 'trendy-youth',
    choiceId: 'trendy-youth',
    name: 'Trendy Youth',
    description: 'Fresh and energetic design for young audiences',
    preview: '/layouts/trendy-youth.jpg',
    category: 'creative',
    tags: ['Trendy', 'Fresh']
  }
]

interface MobileLayoutSwitcherProps {
  currentLayoutId: string
  onLayoutChange: (layoutId: string) => void
  previewEngine?: any
  projectId?: string
  className?: string
}

/**
 * Mobile-optimized layout switcher with floating action button and sheet
 * Provides easy access to try different layouts on mobile devices
 */
export function MobileLayoutSwitcher({
  currentLayoutId,
  onLayoutChange,
  previewEngine,
  projectId,
  className
}: MobileLayoutSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedLayout, setSelectedLayout] = useState(currentLayoutId)
  const [showTooltip, setShowTooltip] = useState(false)
  const [hasShownTooltip, setHasShownTooltip] = useState(false)
  const [showAllLayouts, setShowAllLayouts] = useState(false)

  // Add React Preview support
  const { addSection, resetState } = useBuilderStore()
  const useReactPreview = FEATURE_FLAGS.ENABLE_REACT_PREVIEW

  const currentLayout = LAYOUT_OPTIONS.find(l => l.id === currentLayoutId)

  // Sync selected layout when current layout changes
  useEffect(() => {
    setSelectedLayout(currentLayoutId)
  }, [currentLayoutId])

  // Creative tooltip animation sequence
  useEffect(() => {
    if (hasShownTooltip) return

    // Elegant entrance sequence
    const showSequence = async () => {
      // Wait for FAB to fully appear first
      await new Promise(resolve => setTimeout(resolve, 1200))

      // Show tooltip with bounce
      setShowTooltip(true)

      // Hold for reading time
      await new Promise(resolve => setTimeout(resolve, 3500))

      // Gentle fadeout
      setShowTooltip(false)
      setHasShownTooltip(true)
    }

    showSequence()
  }, [hasShownTooltip])

  // Show tooltip temporarily on hover/touch (after initial sequence)
  const handleFABInteraction = () => {
    if (hasShownTooltip && !showTooltip && !isOpen) {
      setShowTooltip(true)
      setTimeout(() => setShowTooltip(false), 2000)
    }
  }

  // Apply React Preview impact for mobile layout switching
  const applyReactPreviewImpact = async (impact: any, layoutName: string) => {
    try {
      logger.info('📱🎨 Mobile Layout Switcher: Applying React Preview impact for:', layoutName);
      
      // Check if there are existing sections with option-specific content
      // If so, this might be from question interface and we should not override
      const currentSections = useBuilderStore.getState().layouts[useBuilderStore.getState().ui.currentLayoutId]?.sections || {}
      const existingSections = Object.values(currentSections)
      
      // Check if we have sections with titles that suggest they came from question selection
      const hasQuestionGeneratedContent = existingSections.some((section: any) => {
        const title = section.content?.props?.title
        return title && title.startsWith('Welcome to ') && title !== 'Welcome to Our Service'
      })
      
      if (hasQuestionGeneratedContent && (impact.type === 'theme_change' || impact.type === 'layout_update')) {
        logger.info('📱🚫 Mobile Layout Switcher: Skipping impact - question interface content detected');
        return
      }
      
      if (impact.type === 'modular-transformation' && impact.modules) {
        logger.info('📱📦 Mobile Layout Switcher: Processing modular transformation');
        
        // Clear existing sections first for clean layout switch
        const { clearSections } = useBuilderStore.getState()
        clearSections()
        logger.info('📱🗑️ Mobile Layout Switcher: Cleared existing sections for layout switch');
        
        // Convert each module to a SectionState and add to store
        Object.entries(impact.modules).forEach(([moduleKey, moduleData]: [string, any]) => {
          // Skip non-section modules (colorScheme, typography, animations, customCSS)
          const sectionTypes = ['hero', 'features', 'pricing', 'testimonials', 'cta', 'footer']
          if (!sectionTypes.includes(moduleKey) || !moduleData.component || !moduleData.props) {
            return
          }
          
          const sectionId = `${moduleKey}-${Date.now()}`
          const section: SectionState = {
            id: sectionId,
            type: moduleKey as SectionState['type'],
            content: {
              html: '', // Will be rendered by React
              props: moduleData.props
            },
            styles: {
              css: '',
              variables: {
                '--primary-color': '#3b82f6',
                '--text-color': '#1f2937',
                '--bg-color': '#ffffff'
              }
            },
            metadata: {
              lastModified: Date.now(),
              userAction: `Mobile Layout Switch: ${layoutName}`,
              aiGenerated: true
            }
          }
          
          addSection(section)
        })
        
        logger.info('✅ Mobile Layout Switcher: Applied modular impact to unified store');
      } else if (impact.type === 'theme_change' || impact.type === 'layout_update') {
        logger.info('📱🎨 Mobile Layout Switcher: Processing theme_change/layout_update');
        
        // Clear existing sections first for clean layout switch
        const { clearSections } = useBuilderStore.getState()
        clearSections()
        logger.info('📱🗑️ Mobile Layout Switcher: Cleared existing sections for layout switch');
        
        // Create a basic set of sections for the new layout
        const timestamp = Date.now()
        const defaultSections = [
          {
            id: `hero-${timestamp}`,
            type: 'hero' as const,
            props: {
              title: 'Your Business Title',
              subtitle: 'Professional subtitle here',
              description: 'Engaging description of your business and services',
              ctaText: 'Get Started',
              ctaSecondaryText: 'Learn More'
            }
          },
          {
            id: `features-${timestamp + 1}`, 
            type: 'features' as const,
            props: {
              title: 'Key Features',
              features: [
                { title: 'Feature 1', description: 'Description of feature 1' },
                { title: 'Feature 2', description: 'Description of feature 2' },
                { title: 'Feature 3', description: 'Description of feature 3' }
              ]
            }
          }
        ]
        
        defaultSections.forEach((sectionData) => {
          const section: SectionState = {
            id: sectionData.id,
            type: sectionData.type,
            content: {
              html: '',
              props: sectionData.props
            },
            styles: {
              css: '',
              variables: {
                '--primary-color': '#3b82f6',
                '--text-color': '#1f2937',
                '--bg-color': '#ffffff'
              }
            },
            metadata: {
              lastModified: Date.now(),
              userAction: `Mobile Layout Switch: ${layoutName}`,
              aiGenerated: true
            }
          }
          
          addSection(section)
        })
        
        logger.info('✅ Mobile Layout Switcher: Applied theme_change impact with default sections');
      } else {
        logger.warn('📱⚠️ Mobile Layout Switcher: Unsupported impact type for React Preview:', impact.type);
      }
    } catch (error) {
      logger.error('📱❌ Mobile Layout Switcher: Failed to apply React Preview impact:', error);
    }
  }

  const handleLayoutSelect = async (layoutId: string) => {
    setSelectedLayout(layoutId)
    onLayoutChange(layoutId)

    // Close sheet after selection with slight delay for feedback
    setTimeout(() => {
      setIsOpen(false)
    }, 300)

    // Find the layout option and get its choice ID
    const layoutOption = LAYOUT_OPTIONS.find(l => l.id === layoutId)
    if (!layoutOption) {
      logger.error('❌ Mobile Layout Switcher: Layout option not found:', layoutId);
      return
    }

    // Get the proper preview impact for this layout
    const previewImpact = PREVIEW_IMPACTS[layoutOption.choiceId]
    if (!previewImpact) {
      logger.error('❌ Mobile Layout Switcher: Preview impact not found for choice:', layoutOption.choiceId);
      return
    }

    logger.info('🎨 Mobile Layout Switcher: Using preview impact for choice:', layoutOption.choiceId);

    // Apply layout change based on preview system
    if (useReactPreview) {
      // Use React Preview directly with store
      logger.info('📱 Mobile Layout Switcher: Using React Preview for layout switch');
      await applyReactPreviewImpact(previewImpact, layoutOption.name)
    } else if (previewEngine && projectId) {
      // Use legacy preview engine
      try {
        logger.info('🎨 Mobile Layout Switcher: Generating preview for layout:', layoutId);

        // Use AI generation for better layout switching
        if (previewEngine.applyPreviewImpactWithAI) {
          await previewEngine.applyPreviewImpactWithAI(
            previewImpact,
            `Switch to ${layoutOption.name} layout`,
            layoutOption.choiceId,
            projectId
          )
        } else if (previewEngine.applyPreviewImpact) {
          await previewEngine.applyPreviewImpact(previewImpact)
        }

        logger.info('✅ Mobile Layout Switcher: Layout preview generated successfully');
      } catch (error) {
        logger.error('❌ Mobile Layout Switcher: Failed to generate preview for layout:', layoutId, error);
      }
    } else {
      logger.warn('📱 Mobile Layout Switcher: No preview system available');
    }
  }

  return (
    <>
      {/* Floating Action Button */}
      <m.div
        className={cn(
          "fixed bottom-20 right-4 z-40",
          className
        )}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, duration: 0.3, type: 'spring' }}
      >
        <Button
          onClick={() => setIsOpen(true)}
          onMouseEnter={handleFABInteraction}
          onTouchStart={handleFABInteraction}
          size="lg"
          className="h-14 w-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 border-0 relative overflow-hidden"
        >
          <m.div
            animate={{
              scale: showTooltip ? 1.1 : 1,
              rotate: showTooltip ? 5 : 0
            }}
            transition={{
              duration: showTooltip ? 0.6 : 0.2,
              type: showTooltip ? "tween" : "spring",
              ease: showTooltip ? "easeInOut" : "easeOut",
              repeat: showTooltip ? 3 : 0,
              repeatType: showTooltip ? "reverse" : undefined
            }}
          >
            <Icon name="layout-grid" className="w-6 h-6"  />
          </m.div>

          {/* Ripple effect when tooltip shows */}
          <AnimatePresence>
            {showTooltip && !hasShownTooltip && (
              <m.div
                initial={{ scale: 0, opacity: 0.5 }}
                animate={{ scale: 2, opacity: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute inset-0 bg-white rounded-full"
              />
            )}
          </AnimatePresence>
        </Button>

        {/* Enhanced animated tooltip */}
        <AnimatePresence>
          {showTooltip && (
            <m.div
              initial={{
                opacity: 0,
                x: 20,
                scale: 0.8,
                rotateY: -15
              }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                rotateY: 0
              }}
              exit={{
                opacity: 0,
                x: 10,
                scale: 0.9,
                rotateY: 15
              }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 25,
                duration: 0.4
              }}
              className="absolute right-16 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <m.div
                animate={{
                  scale: !hasShownTooltip ? 1.02 : 1,
                }}
                transition={{
                  duration: 2,
                  repeat: !hasShownTooltip ? Infinity : 0,
                  repeatType: !hasShownTooltip ? "reverse" : undefined,
                  ease: "easeInOut"
                }}
                className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap font-medium relative overflow-hidden"
              >
                ✨ Try different layouts
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-0 h-0 border-l-4 border-l-purple-600 border-y-4 border-y-transparent" />

                {/* Shimmer effect only on first appearance */}
                {!hasShownTooltip && (
                  <m.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "200%" }}
                    transition={{
                      duration: 1.5,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatDelay: 1
                    }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transform -skew-x-12"
                  />
                )}
              </m.div>
            </m.div>
          )}
        </AnimatePresence>
      </m.div>

      {/* Layout Selection Sheet */}
      <MobileSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Layout Styles"
        snapPoints={showAllLayouts ? [0.7, 0.95] : [0.55, 0.8]}
        initialSnap={0}
        enableInternalScroll={false}
      >
        <div className={cn(
          "px-4 space-y-2",
          showAllLayouts ? "pb-6" : "pb-4"
        )}>
          {/* Current Layout - Minimal Display */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
              <span className="text-xs text-gray-300">Current</span>
              <span className="text-xs font-medium text-white">{currentLayout?.name}</span>
            </div>
          </div>

          {/* Main Layouts Grid - Always visible (4 options) */}
          <div className="grid grid-cols-4 gap-1.5">
            {LAYOUT_OPTIONS.slice(0, 4).map((layout, index) => {
              const isSelected = layout.id === selectedLayout
              const isCurrent = layout.id === currentLayoutId

              return (
                <m.button
                  key={layout.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => handleLayoutSelect(layout.id)}
                  className={cn(
                    "relative p-1.5 rounded-md border transition-all duration-150",
                    "group overflow-hidden text-center",
                    isSelected
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-gray-600 bg-gray-800/30 hover:border-gray-500 active:scale-95"
                  )}
                >
                  {/* Tiny Visual Preview */}
                  <div className="w-full aspect-square rounded mb-1 overflow-hidden relative">
                    <div className={cn(
                      "w-full h-full relative",
                      layout.category === 'modern' && "bg-gradient-to-br from-blue-500 to-purple-500",
                      layout.category === 'minimal' && "bg-gradient-to-br from-gray-400 to-gray-600",
                      layout.category === 'creative' && "bg-gradient-to-br from-pink-500 to-orange-500",
                      layout.category === 'classic' && "bg-gradient-to-br from-emerald-500 to-teal-500"
                    )}>
                      {/* Super minimal layout preview */}
                      <div className="absolute inset-0.5 bg-white/6 rounded-sm">
                        <div className="h-0.5 bg-white/20 rounded mt-0.5 mx-0.5"></div>
                        <div className="h-1 bg-white/25 rounded mt-0.5 mx-0.5"></div>
                      </div>

                      {/* Status indicators */}
                      {isSelected && (
                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-purple-500 rounded-full flex items-center justify-center">
                          <Icon name="check" className="w-1.5 h-1.5 text-white"  />
                        </div>
                      )}

                      {isCurrent && (
                        <div className="absolute -top-0.5 -left-0.5 w-1 h-1 bg-green-500 rounded-full"></div>
                      )}
                    </div>
                  </div>

                  {/* Minimal Info */}
                  <div>
                    <h3 className="text-[10px] font-medium text-white leading-tight">
                      {layout.name}
                    </h3>
                  </div>
                </m.button>
              )
            })}
          </div>

          {/* Show More Button - More Prominent */}
          <m.button
            onClick={() => setShowAllLayouts(!showAllLayouts)}
            className="w-full py-3 px-4 text-center text-sm font-medium text-white bg-gray-700/50 hover:bg-gray-700 rounded-lg border border-gray-600 transition-all duration-150 flex items-center justify-center gap-2 min-h-[44px]"
          >
            <span>{showAllLayouts ? 'Show Less Styles' : 'Show More Styles'}</span>
            <m.span
              animate={{ rotate: showAllLayouts ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-gray-400"
            >
              ▼
            </m.span>
          </m.button>

          {/* Additional Layouts - Expandable */}
          <AnimatePresence>
            {showAllLayouts && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-4 gap-1.5 pt-2">
                  {LAYOUT_OPTIONS.slice(4).map((layout, index) => {
                    const isSelected = layout.id === selectedLayout
                    const isCurrent = layout.id === currentLayoutId

                    return (
                      <m.button
                        key={layout.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => handleLayoutSelect(layout.id)}
                        className={cn(
                          "relative p-1.5 rounded-md border transition-all duration-150",
                          "group overflow-hidden text-center",
                          isSelected
                            ? "border-purple-500 bg-purple-500/10"
                            : "border-gray-600 bg-gray-800/30 hover:border-gray-500 active:scale-95"
                        )}
                      >
                        {/* Same tiny design as main layouts */}
                        <div className="w-full aspect-square rounded mb-1 overflow-hidden relative">
                          <div className={cn(
                            "w-full h-full relative",
                            layout.category === 'modern' && "bg-gradient-to-br from-blue-500 to-purple-500",
                            layout.category === 'minimal' && "bg-gradient-to-br from-gray-400 to-gray-600",
                            layout.category === 'creative' && "bg-gradient-to-br from-pink-500 to-orange-500",
                            layout.category === 'classic' && "bg-gradient-to-br from-emerald-500 to-teal-500"
                          )}>
                            {/* Super minimal layout preview */}
                            <div className="absolute inset-0.5 bg-white/6 rounded-sm">
                              <div className="h-0.5 bg-white/20 rounded mt-0.5 mx-0.5"></div>
                              <div className="h-1 bg-white/25 rounded mt-0.5 mx-0.5"></div>
                            </div>

                            {isSelected && (
                              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-purple-500 rounded-full flex items-center justify-center">
                                <Icon name="check" className="w-1.5 h-1.5 text-white"  />
                              </div>
                            )}

                            {isCurrent && (
                              <div className="absolute -top-0.5 -left-0.5 w-1 h-1 bg-green-500 rounded-full"></div>
                            )}
                          </div>
                        </div>

                        <div>
                          <h3 className="text-[10px] font-medium text-white leading-tight">
                            {layout.name}
                          </h3>
                        </div>
                      </m.button>
                    )
                  })}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </MobileSheet>
    </>
  )
}
