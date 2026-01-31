'use client'

import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'

interface ExpandableFeaturesProps {
  features: string[]
  isExpanded: boolean
  onToggle: () => void
  translations?: {
    expand?: string
    collapse?: string
  }
  maxVisibleFeatures?: number
  className?: string
}

export function ExpandableFeatures({
  features,
  isExpanded,
  onToggle,
  translations = {},
  maxVisibleFeatures = 4,
  className
}: ExpandableFeaturesProps) {
  const visibleFeatures = isExpanded ? features : features.slice(0, maxVisibleFeatures)
  const hasMoreFeatures = features.length > maxVisibleFeatures
  
  const expandText = translations.expand || 'View all features'
  const collapseText = translations.collapse || 'Show less'

  return (
    <div className={cn("space-y-3", className)}>
      {/* Always visible features */}
      <div className="space-y-3">
        {visibleFeatures.map((feature, index) => (
          <m.div
            key={`feature-${index}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-start gap-3"
          >
            <Icon 
              name="check" 
              className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" 
            />
            <span className="text-sm text-gray-300 leading-relaxed">
              {feature}
            </span>
          </m.div>
        ))}
      </div>

      {/* Expandable additional features */}
      <AnimatePresence>
        {isExpanded && hasMoreFeatures && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="space-y-3 overflow-hidden"
          >
            {features.slice(maxVisibleFeatures).map((feature, index) => (
              <m.div
                key={`extra-feature-${index}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-start gap-3"
              >
                <Icon 
                  name="check" 
                  className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" 
                />
                <span className="text-sm text-gray-300 leading-relaxed">
                  {feature}
                </span>
              </m.div>
            ))}
          </m.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      {hasMoreFeatures && (
        <Button
          onClick={onToggle}
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white p-0 h-auto font-normal text-sm hover:bg-transparent"
          data-testid="expand-features-toggle"
        >
          <span>{isExpanded ? collapseText : expandText}</span>
          <Icon 
            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
            className={cn(
              "w-4 h-4 ml-1 transition-transform duration-200",
              isExpanded && "rotate-180"
            )} 
          />
        </Button>
      )}

      {/* Feature count indicator */}
      {hasMoreFeatures && !isExpanded && (
        <div className="text-xs text-gray-500 mt-2">
          {features.length - maxVisibleFeatures} more feature{features.length - maxVisibleFeatures !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}