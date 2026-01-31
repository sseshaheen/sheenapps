/**
 * Responsive Table Wrapper Component
 * Best Practice: Horizontal scroll on mobile with sticky actions
 */

'use client'

import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface ResponsiveTableProps {
  children: ReactNode
  className?: string
}

export function ResponsiveTable({ children, className }: ResponsiveTableProps) {
  return (
    <div className={cn(
      "w-full",
      className
    )}>
      {/* Mobile: Horizontal scroll wrapper */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="inline-block min-w-full align-middle">
          {children}
        </div>
      </div>
      
      {/* Scroll indicator for mobile */}
      <div className="sm:hidden text-xs text-center text-muted-foreground mt-2">
        ← Swipe to view more →
      </div>
    </div>
  )
}

/**
 * Mobile Card View for Table Data
 * Alternative pattern for complex tables on mobile
 */
interface MobileCardProps {
  data: Record<string, any>
  primaryField: string
  secondaryField?: string
  actions?: ReactNode
  badge?: ReactNode
}

export function MobileCard({ 
  data, 
  primaryField, 
  secondaryField, 
  actions,
  badge 
}: MobileCardProps) {
  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      {/* Header with primary info and badge */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {data[primaryField]}
          </p>
          {secondaryField && (
            <p className="text-xs text-muted-foreground mt-1">
              {data[secondaryField]}
            </p>
          )}
        </div>
        {badge}
      </div>
      
      {/* Data fields */}
      <div className="space-y-2 text-sm">
        {Object.entries(data).map(([key, value]) => {
          if (key === primaryField || key === secondaryField) return null
          return (
            <div key={key} className="flex justify-between">
              <span className="text-muted-foreground capitalize">
                {key.replace(/_/g, ' ')}:
              </span>
              <span className="font-medium text-right">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </span>
            </div>
          )
        })}
      </div>
      
      {/* Actions - Touch-friendly size */}
      {actions && (
        <div className="pt-3 border-t flex gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}

/**
 * Responsive Table Container with breakpoint visibility
 */
export function ResponsiveTableContainer({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Desktop table view */}
      <div className="hidden sm:block">
        {children}
      </div>
      
      {/* Mobile card view */}
      <div className="block sm:hidden space-y-3">
        {children}
      </div>
    </>
  )
}