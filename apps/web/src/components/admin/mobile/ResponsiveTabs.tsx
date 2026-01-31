/**
 * Mobile-Responsive Tabs Component
 * Best Practice: Scrollable tabs on mobile, dropdown on very small screens
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Tab {
  value: string
  label: string
  icon?: React.ReactNode
  badge?: string | number
}

interface ResponsiveTabsProps {
  tabs: Tab[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

/**
 * Responsive Tabs - Scrollable on mobile, full width on desktop
 */
export function ResponsiveTabs({ 
  tabs, 
  value, 
  onValueChange,
  className 
}: ResponsiveTabsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollIndicator, setShowScrollIndicator] = useState(false)

  // Check if tabs are scrollable
  useEffect(() => {
    const checkScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollWidth, clientWidth } = scrollContainerRef.current
        setShowScrollIndicator(scrollWidth > clientWidth)
      }
    }
    
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [tabs])

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile: Dropdown for very small screens (< 480px) */}
      <div className="block xs:hidden">
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select tab">
              {tabs.find(tab => tab.value === value)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tabs.map((tab) => (
              <SelectItem key={tab.value} value={tab.value}>
                <div className="flex items-center gap-2">
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">
                      {tab.badge}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tablet & Desktop: Scrollable tabs */}
      <div className="hidden xs:block relative">
        <div 
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-none"
        >
          <div className="inline-flex h-10 items-center justify-start rounded-lg bg-muted p-1 text-muted-foreground min-w-full sm:w-full">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => onValueChange(tab.value)}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                  "min-w-[100px] sm:flex-1", // Min width on mobile, flex on desktop
                  value === tab.value
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:bg-background/50"
                )}
              >
                {tab.icon && <span className="mr-2">{tab.icon}</span>}
                {tab.label}
                {tab.badge && (
                  <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        
        {/* Scroll indicator */}
        {showScrollIndicator && (
          <div className="sm:hidden absolute right-0 top-0 h-full flex items-center pointer-events-none">
            <div className="bg-gradient-to-l from-background to-transparent w-8 h-full" />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Mobile Tab List - Vertical stack for mobile
 */
export function MobileTabList({ 
  tabs, 
  value, 
  onValueChange 
}: ResponsiveTabsProps) {
  return (
    <div className="space-y-2">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onValueChange(tab.value)}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors",
            "min-h-[44px]", // Touch-friendly minimum height
            value === tab.value
              ? "bg-primary/10 text-primary border-l-4 border-primary"
              : "bg-muted hover:bg-muted/80"
          )}
        >
          <div className="flex items-center gap-3">
            {tab.icon}
            <span className="font-medium">{tab.label}</span>
          </div>
          {tab.badge && (
            <span className="text-xs bg-background px-2 py-1 rounded">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * Responsive Tab Navigation with icons
 */
interface IconTab extends Tab {
  icon: React.ReactNode
}

export function IconTabs({ 
  tabs, 
  value, 
  onValueChange 
}: { 
  tabs: IconTab[]
  value: string
  onValueChange: (value: string) => void 
}) {
  return (
    <div className="w-full">
      {/* Mobile: Icon-only tabs to save space */}
      <div className="sm:hidden flex justify-around bg-muted rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center p-2 rounded-md transition-colors",
              "min-h-[44px]", // Touch target
              value === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
            aria-label={tab.label}
          >
            {tab.icon}
            <span className="text-xs mt-1">{tab.label}</span>
            {tab.badge && (
              <span className="absolute -top-1 -right-1 text-xs bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      
      {/* Desktop: Full tabs with labels */}
      <div className="hidden sm:flex gap-1 bg-muted rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md transition-colors",
              value === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/50"
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}