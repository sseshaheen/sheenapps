'use client'

import React, { useState } from 'react'
import { m } from '@/components/ui/motion-provider'
import { cn } from '@/lib/utils'
import Icon from '@/components/ui/icon'
import type { QuestionOption as QuestionOptionType } from '@/types/question-flow'

interface QuestionOptionProps {
  option: QuestionOptionType
  selected: boolean
  onSelect: () => void
  disabled: boolean
}

export function QuestionOption({ option, selected, onSelect, disabled }: QuestionOptionProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const handleMouseEnter = () => {
    setIsHovered(true)
    if (option.previewImpact) {
      setShowPreview(true)
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    setShowPreview(false)
  }

  return (
    <m.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={onSelect}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative w-full text-left p-4 rounded-lg border-2 transition-all duration-200 overflow-hidden",
        selected 
          ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20" 
          : "border-gray-600 bg-gray-700/50 hover:border-gray-500 hover:bg-gray-700",
        disabled && "opacity-50 cursor-not-allowed",
        isHovered && !disabled && "shadow-md"
      )}
    >
      {/* Selection Indicator */}
      {selected && (
        <m.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="absolute top-3 right-3"
        >
          <Icon name="check-circle" className="w-5 h-5 text-purple-400"  />
        </m.div>
      )}

      {/* Preview Impact Indicator */}
      {option.previewImpact && showPreview && (
        <m.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute top-3 right-3"
        >
          <div className="flex items-center gap-1 text-purple-400">
            <Icon name="eye" className="w-4 h-4"  />
            <span className="text-xs">Preview</span>
          </div>
        </m.div>
      )}

      <div className="flex items-start gap-3 pr-8">
        {/* Icon */}
        {option.icon && (
          <div className="flex-shrink-0">
            <span className="text-2xl">{option.icon}</span>
          </div>
        )}
        
        <div className="flex-1 space-y-2">
          {/* Main Text */}
          <div className="font-medium text-white">
            {option.text}
          </div>
          
          {/* Description */}
          {option.description && (
            <div className="text-sm text-gray-400">
              {option.description}
            </div>
          )}
          
          {/* Business Implications */}
          {option.businessImplications && option.businessImplications.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 font-medium">
                Business Impact:
              </div>
              <div className="flex flex-wrap gap-1">
                {option.businessImplications.map((implication, index) => (
                  <m.span
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="text-xs px-2 py-1 bg-gray-600 text-gray-300 rounded-full"
                  >
                    {implication}
                  </m.span>
                ))}
              </div>
            </div>
          )}
          
          {/* Preview Impact Details */}
          {option.previewImpact && isHovered && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
              className="mt-3 p-2 bg-purple-500/10 border border-purple-500/20 rounded"
            >
              <div className="flex items-center gap-2 text-xs text-purple-300">
                <Icon name="sparkles" className="w-3 h-3"  />
                <span>This will update your preview instantly</span>
                <Icon name="arrow-right" className="w-3 h-3"  />
              </div>
            </m.div>
          )}
        </div>
      </div>

      {/* Hover Effect */}
      {isHovered && !disabled && (
        <m.div
          layoutId="option-hover"
          className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 rounded-lg"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}

      {/* Selection Effect */}
      {selected && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg"
        />
      )}
    </m.button>
  )
}