/**
 * Accessible Status Badge Component
 * Inclusive design with color + text + icons for all status indicators
 * Supports screen readers and follows WCAG accessibility guidelines
 */

'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/types/version-management'

interface AccessibleStatusBadgeProps {
  status: ProjectStatus | 'published' | 'unpublished' | 'draft'
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  showText?: boolean
  className?: string
  onClick?: () => void
  ariaLabel?: string
}

// Status configuration with accessibility in mind
const statusConfig = {
  building: {
    variant: 'default' as const,
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: 'loader-2' as const,
    text: 'Building',
    description: 'Project is currently building',
    spinning: true,
    ariaLabel: 'Building status: Project is currently being built'
  },
  rollingBack: {
    variant: 'default' as const,
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: 'rotate-ccw' as const,
    text: 'Rolling back',
    description: 'Rolling back to previous version',
    spinning: true,
    ariaLabel: 'Rolling back status: Project is being rolled back to a previous version'
  },
  queued: {
    variant: 'default' as const,
    className: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: 'clock' as const,
    text: 'Queued',
    description: 'Build queued for processing',
    ariaLabel: 'Queued status: Build is waiting in queue for processing'
  },
  deployed: {
    variant: 'default' as const,
    className: 'bg-green-100 text-green-800 border-green-200',
    icon: 'check-circle' as const,
    text: 'Deployed',
    description: 'Successfully deployed',
    ariaLabel: 'Deployed status: Project has been successfully deployed'
  },
  published: {
    variant: 'default' as const,
    className: 'bg-green-100 text-green-800 border-green-200',
    icon: 'globe' as const,
    text: 'Live',
    description: 'Published and live',
    ariaLabel: 'Live status: Project is published and accessible to the public'
  },
  unpublished: {
    variant: 'secondary' as const,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: 'eye-off' as const,
    text: 'Draft',
    description: 'Not published',
    ariaLabel: 'Draft status: Project is not published and only visible to you'
  },
  draft: {
    variant: 'secondary' as const,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: 'edit' as const,
    text: 'Draft',
    description: 'Draft mode',
    ariaLabel: 'Draft status: Project is in draft mode'
  },
  failed: {
    variant: 'destructive' as const,
    className: 'bg-red-100 text-red-800 border-red-200',
    icon: 'alert-circle' as const,
    text: 'Failed',
    description: 'Build failed',
    ariaLabel: 'Failed status: Project build has failed and needs attention'
  },
  rollbackFailed: {
    variant: 'destructive' as const,
    className: 'bg-red-100 text-red-800 border-red-200',
    icon: 'alert-triangle' as const,
    text: 'Rollback failed',
    description: 'Rollback operation failed',
    ariaLabel: 'Rollback failed status: Rollback operation has failed and needs attention'
  }
} as const

export function AccessibleStatusBadge({
  status,
  size = 'md',
  showIcon = true,
  showText = true,
  className,
  onClick,
  ariaLabel
}: AccessibleStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft
  
  // Size configurations
  const sizeClasses = {
    sm: {
      badge: 'px-2 py-0.5 text-xs',
      icon: 'w-2.5 h-2.5',
      gap: 'gap-1'
    },
    md: {
      badge: 'px-2 py-1 text-sm',
      icon: 'w-3 h-3',
      gap: 'gap-1.5'
    },
    lg: {
      badge: 'px-3 py-1.5 text-base',
      icon: 'w-4 h-4',
      gap: 'gap-2'
    }
  }[size]

  const badgeContent = (
    <>
      {showIcon && (
        <Icon 
          name={config.icon} 
          className={cn(
            sizeClasses.icon,
            'spinning' in config && config.spinning && "animate-spin"
          )}
          aria-hidden="true" // Icon is decorative, text provides the meaning
        />
      )}
      {showText && (
        <span className="font-medium">
          {config.text}
        </span>
      )}
      {/* Screen reader only description */}
      <span className="sr-only">
        {config.description}
      </span>
    </>
  )

  const badgeProps = {
    variant: config.variant,
    className: cn(
      "flex items-center font-medium border",
      sizeClasses.badge,
      sizeClasses.gap,
      config.className,
      onClick && "cursor-pointer hover:opacity-80 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
      className
    ),
    onClick,
    'aria-label': ariaLabel || config.ariaLabel,
    role: onClick ? 'button' : 'status',
    tabIndex: onClick ? 0 : undefined,
    onKeyDown: onClick ? (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    } : undefined
  }

  return (
    <Badge {...badgeProps}>
      {badgeContent}
    </Badge>
  )
}

/**
 * Status Badge with Tooltip - Enhanced version with detailed information
 */
export function StatusBadgeWithTooltip({
  status,
  additionalInfo,
  ...props
}: AccessibleStatusBadgeProps & {
  additionalInfo?: {
    lastUpdated?: Date
    progress?: number
    details?: string
  }
}) {
  const config = statusConfig[status] || statusConfig.draft
  
  // Generate detailed tooltip content
  const tooltipContent = [
    config.description,
    additionalInfo?.details,
    additionalInfo?.lastUpdated && `Updated: ${additionalInfo.lastUpdated.toLocaleString()}`,
    additionalInfo?.progress !== undefined && `Progress: ${additionalInfo.progress}%`
  ].filter(Boolean).join('\n')

  return (
    <div className="relative group">
      <AccessibleStatusBadge
        status={status}
        {...props}
        ariaLabel={`${config.ariaLabel}${additionalInfo?.details ? `. ${additionalInfo.details}` : ''}`}
      />
      
      {/* Tooltip */}
      <div 
        className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-pre-line z-50"
        role="tooltip"
        aria-hidden="true"
      >
        {tooltipContent}
        {/* Tooltip arrow */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  )
}

/**
 * Status Timeline Component - Shows status progression
 */
export function StatusTimeline({
  statuses,
  currentStatus,
  className
}: {
  statuses: Array<{
    status: ProjectStatus | 'published' | 'unpublished' | 'draft'
    timestamp: Date
    details?: string
  }>
  currentStatus: ProjectStatus | 'published' | 'unpublished' | 'draft'
  className?: string
}) {
  return (
    <div className={cn("space-y-3", className)} role="log" aria-label="Status timeline">
      {statuses.map((item, index) => {
        const isCurrent = item.status === currentStatus
        const isLatest = index === statuses.length - 1
        
        return (
          <div
            key={index}
            className={cn(
              "flex items-center gap-3 p-2 rounded-lg transition-colors",
              isCurrent && "bg-blue-50 border border-blue-200",
              !isCurrent && isLatest && "opacity-60"
            )}
          >
            <AccessibleStatusBadge
              status={item.status}
              size="sm"
              className={!isCurrent && !isLatest ? "opacity-60" : ""}
            />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-sm",
                  isCurrent && "font-medium text-gray-900",
                  !isCurrent && "text-gray-600"
                )}>
                  {item.details || statusConfig[item.status]?.description}
                </span>
                <time className="text-xs text-gray-500" dateTime={item.timestamp.toISOString()}>
                  {item.timestamp.toLocaleTimeString()}
                </time>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Bulk Status Display - For showing multiple project statuses
 */
export function BulkStatusDisplay({
  projects,
  onStatusClick,
  className
}: {
  projects: Array<{
    id: string
    name: string
    status: ProjectStatus | 'published' | 'unpublished' | 'draft'
    lastUpdated?: Date
  }>
  onStatusClick?: (projectId: string, status: string) => void
  className?: string
}) {
  const statusCounts = projects.reduce((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className={cn("space-y-4", className)}>
      {/* Status Summary */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div key={status} className="flex items-center gap-1">
            <AccessibleStatusBadge
              status={status as any}
              size="sm"
              showText={false}
            />
            <span className="text-sm text-gray-600">
              {count} {status}
            </span>
          </div>
        ))}
      </div>

      {/* Project List */}
      <div className="grid gap-2">
        {projects.map((project) => (
          <div
            key={project.id}
            className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50"
          >
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 truncate">
                {project.name}
              </h4>
              {project.lastUpdated && (
                <p className="text-sm text-gray-500">
                  Updated {project.lastUpdated.toLocaleDateString()}
                </p>
              )}
            </div>
            
            <AccessibleStatusBadge
              status={project.status}
              size="sm"
              onClick={onStatusClick ? () => onStatusClick(project.id, project.status) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  )
}