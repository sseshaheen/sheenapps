'use client'

import React, { useState, useEffect } from 'react'
import { m } from '@/components/ui/motion-provider'
import { Check, Loader2, Clock, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBuildEvent, isStructuredEvent } from '@/utils/format-build-events'
import { useTranslations } from 'next-intl'
import { logger } from '@/utils/logger'

// Enhanced build event interface
interface EnhancedBuildEvent {
  id: string
  message: string
  eventType: string
  status: 'pending' | 'active' | 'completed' | 'failed'
  timestamp: Date
  completedAt?: Date
  duration?: number
  category: 'setup' | 'development' | 'installation' | 'validation' | 'general'
  enhanced: {
    title: string
    description: string
    estimatedDuration: string
  }
  _rawEvent?: any // Raw event data for formatting with translations
}

interface BuildTimelineProps {
  events: EnhancedBuildEvent[]
  className?: string
}

export function BuildTimeline({ events, className }: BuildTimelineProps) {
  const completedCount = events.filter(e => e.status === 'completed').length
  const totalCount = events.length
  const activeEvent = events.find(e => e.status === 'active')
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  
  return (
    <div className={cn("space-y-4", className)}>
      {/* Overall Progress Header */}
      <BuildProgressHeader 
        completed={completedCount}
        total={totalCount}
        percentage={progressPercentage}
        activeStep={activeEvent?.enhanced.title}
      />
      
      {/* Timeline Events */}
      <div className="relative">
        {/* Vertical progress line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700">
          <m.div 
            className="absolute top-0 left-0 w-full bg-gradient-to-b from-green-500 to-blue-500"
            animate={{ height: `${Math.min((completedCount / Math.max(totalCount, 1)) * 100, 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        
        {/* Event Items */}
        <div className="space-y-2">
          {events.map((event, index) => (
            <TimelineEvent 
              key={event.id}
              event={event}
              isLast={index === events.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Individual timeline event component
function TimelineEvent({ event, isLast }: { event: EnhancedBuildEvent, isLast: boolean }) {
  const getStatusIcon = () => {
    switch (event.status) {
      case 'completed':
        return <Check className="w-5 h-5 text-white" />
      case 'active':
        return (
          <m.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="w-5 h-5 text-white" />
          </m.div>
        )
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-white" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }
  
  const getStatusStyles = () => {
    switch (event.status) {
      case 'completed':
        return {
          container: "bg-green-500/5 border-l-green-500 border-l-2",
          icon: "bg-green-500 shadow-green-500/20",
          title: "text-green-200",
          badge: "text-green-400 bg-green-500/20",
          description: "text-green-300/80"
        }
      case 'active':
        return {
          container: "bg-blue-500/10 border-l-blue-500 border-l-2 shadow-lg shadow-blue-500/10",
          icon: "bg-blue-500 shadow-blue-500/20",
          title: "text-blue-200 font-semibold",
          badge: "text-blue-400 bg-blue-500/20 animate-pulse",
          description: "text-blue-300/80"
        }
      case 'failed':
        return {
          container: "bg-red-500/5 border-l-red-500 border-l-2",
          icon: "bg-red-500 shadow-red-500/20",
          title: "text-red-200",
          badge: "text-red-400 bg-red-500/20",
          description: "text-red-300/80"
        }
      default:
        return {
          container: "opacity-60",
          icon: "bg-gray-700",
          title: "text-gray-400",
          badge: "text-gray-500 bg-gray-800",
          description: "text-gray-500"
        }
    }
  }
  
  const styles = getStatusStyles()
  
  const containerAnimation = event.status === 'completed' ? {
    initial: { x: -10, opacity: 0.8 },
    animate: { x: 0, opacity: 1 },
    transition: { duration: 0.3 }
  } : {}
  
  const iconAnimation = event.status === 'completed' ? {
    animate: { scale: [1, 1.2, 1] },
    transition: { duration: 0.5 }
  } : {}
  
  return (
    <m.div 
      className={cn("flex items-start gap-4 py-3 px-4 rounded-lg", styles.container)}
      {...containerAnimation}
    >
      {/* Status Icon */}
      <m.div 
        className={cn("w-8 h-8 rounded-full flex items-center justify-center mt-0.5 shadow-lg", styles.icon)}
        {...iconAnimation}
      >
        {getStatusIcon()}
      </m.div>
      
      {/* Event Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h4 className={cn("text-sm", styles.title)}>
            {event.enhanced.title}
          </h4>
          <span className={cn("text-xs px-2 py-1 rounded text-nowrap", styles.badge)}>
            {event.status === 'completed' && event.duration ? 
              `✓ Done • ${event.duration.toFixed(1)}s` :
              event.status === 'active' ? 'Active' :
              event.status === 'failed' ? 'Failed' :
              'Pending'
            }
          </span>
        </div>
        
        <p className={cn("text-xs", styles.description)}>
          {event.enhanced.description}
        </p>
        
        {/* Active event progress bar with smart timeout */}
        {event.status === 'active' && (
          <ActiveProgressBar startTime={event.timestamp} />
        )}
      </div>
    </m.div>
  )
}

// Smart progress bar component with barber-pole timeout
function ActiveProgressBar({ startTime }: { startTime: Date }) {
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [showBarberPole, setShowBarberPole] = useState(false)
  
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime.getTime()) / 1000
      setTimeElapsed(elapsed)
      
      // Switch to barber-pole after 10 seconds
      if (elapsed > 10 && !showBarberPole) {
        setShowBarberPole(true)
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [startTime, showBarberPole])
  
  if (showBarberPole) {
    return (
      <div className="mt-2 space-y-1">
        {/* Barber-pole progress bar */}
        <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden">
          <m.div 
            className="h-1 w-full"
            style={{
              background: `repeating-linear-gradient(
                45deg,
                transparent,
                transparent 8px,
                rgba(59, 130, 246, 0.4) 8px,
                rgba(59, 130, 246, 0.4) 16px
              )`
            }}
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        </div>
        {/* Reassuring message */}
        <p className="text-xs text-blue-300/60 flex items-center gap-1">
          <m.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            ⏳
          </m.span>
          Still working... ({Math.floor(timeElapsed)}s elapsed)
          {timeElapsed > 30 && " • Large dependency installation in progress"}
        </p>
      </div>
    )
  }
  
  // Normal animated progress bar for first 10 seconds
  return (
    <div className="mt-2">
      <div className="w-full bg-gray-800 rounded-full h-1">
        <m.div 
          className="bg-blue-500 h-1 rounded-full"
          animate={{ width: ['0%', '100%', '0%'] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      </div>
      {timeElapsed > 5 && (
        <p className="text-xs text-blue-300/60 mt-1">
          {Math.floor(timeElapsed)}s elapsed...
        </p>
      )}
    </div>
  )
}

// Progress header component
function BuildProgressHeader({ 
  completed, 
  total, 
  percentage, 
  activeStep 
}: {
  completed: number
  total: number  
  percentage: number
  activeStep?: string
}) {
  return (
    <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          🏗️ Building Your App
        </h3>
        <span className="text-sm text-gray-400">
          Step {completed} of {total}
        </span>
      </div>
      
      <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
        <m.div 
          className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full"
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      
      <p className="text-xs text-gray-400">
        {activeStep ? (
          <>Currently: {activeStep}</>
        ) : percentage === 100 ? (
          <>🎉 Your app is ready for preview!</>
        ) : (
          <>Building your application components...</>
        )}
      </p>
    </div>
  )
}

// Process events with progressive states
export function processEventsWithStates(events: any[]): EnhancedBuildEvent[] {
  // Note: This is a utility function that doesn't have access to translations
  // The formatting will be done by components that use this data
  return events.map((event, index) => {
    const isLast = index === events.length - 1
    const nextEvent = events[index + 1]
    
    // Auto-complete logic: if there's a next event, this one is completed
    const status = isLast ? 'active' : 'completed'
    const completedAt = nextEvent ? new Date(nextEvent.created_at) : undefined
    const duration = completedAt ? 
      (new Date(completedAt).getTime() - new Date(event.created_at).getTime()) / 1000 : 
      undefined
    
    // Store both raw event data and legacy fields for components to format
    return {
      id: event.id,
      message: event.event_data?.message || event.enhanced?.description || 'Processing...',
      eventType: event.event_type,
      status,
      timestamp: new Date(event.created_at),
      completedAt,
      duration,
      category: event.details?.category || 'general',
      enhanced: {
        title: event.title || 'Processing...',
        description: event.description || 'Working on your project...',
        estimatedDuration: event.details?.estimatedDuration || '1-2s'
      },
      // Store raw event for formatting in components
      _rawEvent: event
    }
  })
}