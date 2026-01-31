/**
 * Mode Badge Component
 * Shows the AI-detected intent mode with appropriate styling
 * Used to indicate what type of response the AI is providing
 */

'use client'

import { Badge } from '@/components/ui/badge'
import { type ChatMode } from '@/types/chat-plan'
import { 
  MessageCircleQuestion, 
  Plus, 
  Wrench, 
  Search, 
  MessageCircle, 
  Hammer 
} from 'lucide-react'

interface ModeBadgeProps {
  mode: ChatMode
  className?: string
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'secondary'
  translations?: Record<string, string>
}

const defaultTranslations: Record<ChatMode, string> = {
  question: 'Question',
  feature: 'Feature Request',
  fix: 'Bug Fix',
  analysis: 'Code Analysis',
  build: 'Build Process',
  general: 'General'
}

const modeStyles: Record<ChatMode, string> = {
  question: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  feature: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  fix: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  analysis: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  build: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  general: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
}

const modeIcons: Record<ChatMode, React.ComponentType<{ className?: string }>> = {
  question: MessageCircleQuestion,
  feature: Plus,
  fix: Wrench,
  analysis: Search,
  build: Hammer,
  general: MessageCircle
}

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5'
}

export function ModeBadge({ 
  mode, 
  className = '', 
  showIcon = true,
  size = 'md',
  variant = 'default',
  translations = defaultTranslations
}: ModeBadgeProps) {
  const IconComponent = modeIcons[mode]
  const modeLabel = translations[mode] || defaultTranslations[mode]
  
  // Use custom styles for default variant, otherwise let Badge handle it
  const customStyles = variant === 'default' ? modeStyles[mode] : ''
  
  return (
    <Badge 
      variant={variant === 'default' ? 'secondary' : variant}
      className={`
        inline-flex items-center gap-1.5 font-medium transition-all
        ${customStyles}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {showIcon && IconComponent && (
        <IconComponent className={`
          ${size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'}
        `} />
      )}
      <span>{modeLabel}</span>
    </Badge>
  )
}

/**
 * Animated mode badge that highlights when mode changes
 */
export function AnimatedModeBadge({ mode, ...props }: ModeBadgeProps) {
  return (
    <div className="relative">
      <ModeBadge mode={mode} {...props} />
      <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse pointer-events-none" />
    </div>
  )
}

/**
 * Mode badge with confidence indicator
 */
interface ModeWithConfidenceBadgeProps extends ModeBadgeProps {
  confidence?: number
}

export function ModeWithConfidenceBadge({ 
  mode, 
  confidence, 
  ...props 
}: ModeWithConfidenceBadgeProps) {
  const confidenceColor = confidence && confidence > 0.8 
    ? 'text-green-600' 
    : confidence && confidence > 0.6 
    ? 'text-yellow-600' 
    : 'text-red-600'

  return (
    <div className="flex items-center gap-2">
      <ModeBadge mode={mode} {...props} />
      {confidence && (
        <span className={`text-xs font-mono ${confidenceColor}`}>
          {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  )
}

/**
 * Compact mode indicator for small spaces
 */
export function CompactModeIndicator({ mode, className = '' }: Pick<ModeBadgeProps, 'mode' | 'className'>) {
  const IconComponent = modeIcons[mode]
  const colorClass = modeStyles[mode].split(' ').find(c => c.startsWith('text-')) || 'text-gray-600'
  
  return (
    <div className={`flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 ${className}`}>
      {IconComponent && (
        <IconComponent className={`w-3 h-3 ${colorClass}`} />
      )}
    </div>
  )
}

/**
 * Mode badge with tooltip showing more details
 */
interface ModeTooltipBadgeProps extends ModeBadgeProps {
  description?: string
  examples?: string[]
}

export function ModeTooltipBadge({ 
  mode, 
  description, 
  examples,
  ...props 
}: ModeTooltipBadgeProps) {
  // This would typically use a tooltip library like Radix UI Tooltip
  // For now, just render the basic badge with title attribute
  
  const tooltipContent = [
    description,
    examples && examples.length > 0 && `Examples: ${examples.join(', ')}`
  ].filter(Boolean).join('\n\n')

  return (
    <div title={tooltipContent}>
      <ModeBadge mode={mode} {...props} />
    </div>
  )
}

// Export mode-related utilities
export { modeStyles, modeIcons, defaultTranslations as modeTranslations }