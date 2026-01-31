'use client'

import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { cn } from '@/lib/utils'
import { CheckCircle, ChevronDown, ChevronUp, Clock, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'

// Build phases for smart categorization
type BuildPhase = 'setup' | 'development' | 'dependencies' | 'build' | 'deploy'

interface BuildEvent {
  id: string
  title: string
  description: string
  eventType: 'started' | 'progress' | 'completed' | 'failed' | 'queued'
  timestamp: Date
  duration?: number
  details?: {
    category?: 'setup' | 'development' | 'installation' | 'validation' | 'general'
    specificMessage?: string
  }
}

interface BuildPhaseGroup {
  phase: BuildPhase
  name: string
  icon: string
  events: BuildEvent[]
  status: 'completed' | 'active' | 'pending'
  totalDuration: number
  estimatedProgress: number // 0-100
}

interface CompactBuildProgressProps {
  events: BuildEvent[]
  className?: string
}

export function CompactBuildProgress({ events, className }: CompactBuildProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Group events into phases and calculate smart progress
  const { phases, overallProgress, currentPhase, nextPhase } = useMemo(() => {
    return analyzeEventsAndPhases(events)
  }, [events])

  const completedPhases = phases.filter(p => p.status === 'completed')
  const activePhase = phases.find(p => p.status === 'active')
  const activeEvent = activePhase?.events.find(e =>
    e.eventType === 'started' || e.eventType === 'progress'
  )

  return (
    <div className={cn("w-full max-w-2xl", className)}>
      {/* Compact View */}
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900/50 rounded-lg border border-gray-700 p-4"
      >
        {/* Header with progress */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            🏗️ Building Your App
          </h3>
          <span className="text-sm text-gray-400">
            {Math.round(overallProgress)}% estimated
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
          <m.div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full"
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        {/* Completed phases summary */}
        {completedPhases.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-200">
              {getCompletedSummary(completedPhases)}
            </span>
          </div>
        )}

        {/* Current active step */}
        {activeEvent && (
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-sm text-blue-200">
              {activeEvent.title}
              {activeEvent.duration && activeEvent.duration > 10 && (
                <span className="text-blue-300/60 ml-2">
                  ({Math.floor((Date.now() - activeEvent.timestamp.getTime()) / 1000)}s)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Next steps preview */}
        {nextPhase && (
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">
              {getNextStepsPreview(nextPhase, phases)}
            </span>
          </div>
        )}

        {/* Expand/Collapse toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Hide {events.length} build steps
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show {events.length} build steps
            </>
          )}
        </button>
      </m.div>

      {/* Expanded Timeline View */}
      <AnimatePresence>
        {isExpanded && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-4 bg-gray-900/30 rounded-lg border border-gray-700/50 overflow-hidden"
          >
            <div className="p-4">
              <h4 className="text-md font-semibold text-white mb-4 flex items-center gap-2">
                📋 Build Timeline Details
              </h4>

              {phases.map((phase, index) => (
                <PhaseSection
                  key={phase.phase}
                  phase={phase}
                  isLast={index === phases.length - 1}
                />
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Phase section component for expanded view
function PhaseSection({ phase, isLast }: { phase: BuildPhaseGroup, isLast: boolean }) {
  const getPhaseStatusIcon = () => {
    switch (phase.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-400" />
      case 'active':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
      default:
        return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  const getPhaseStatusText = () => {
    switch (phase.status) {
      case 'completed':
        return `✅ (${phase.events.length} steps, ${phase.totalDuration.toFixed(1)}s total)`
      case 'active':
        return '🔄 (in progress)'
      default:
        return '⏸️ (upcoming)'
    }
  }

  return (
    <div className={cn("mb-4", !isLast && "border-b border-gray-700/50 pb-4")}>
      {/* Phase header */}
      <div className="flex items-center gap-3 mb-3">
        {getPhaseStatusIcon()}
        <div className="flex-1">
          <h5 className="font-medium text-white flex items-center gap-2">
            {phase.icon} {phase.name.toUpperCase()} {getPhaseStatusText()}
          </h5>
        </div>
      </div>

      {/* Phase events */}
      <div className="ml-8 space-y-2">
        {phase.events.map((event, eventIndex) => (
          <div
            key={event.id}
            className="flex items-center gap-3 text-sm"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              {phase.status === 'completed' || eventIndex < phase.events.length - 1 ? (
                <div className="w-2 h-2 bg-green-400 rounded-full" />
              ) : event.eventType === 'started' || event.eventType === 'progress' ? (
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              ) : (
                <div className="w-2 h-2 bg-gray-500 rounded-full" />
              )}
            </div>

            <span className={cn(
              "flex-1",
              phase.status === 'completed' || eventIndex < phase.events.length - 1
                ? "text-green-200"
                : event.eventType === 'started' || event.eventType === 'progress'
                ? "text-blue-200"
                : "text-gray-400"
            )}>
              {event.title}
            </span>

            {event.duration && (
              <span className="text-xs text-gray-500">
                ({event.duration.toFixed(1)}s)
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Smart analysis function to group events and calculate progress
function analyzeEventsAndPhases(events: BuildEvent[]) {
  // Phase definitions with progress weights
  const phaseDefinitions = {
    setup: { name: 'Setup', icon: '📦', weight: 0.2 },
    development: { name: 'Development', icon: '⚡', weight: 0.25 },
    dependencies: { name: 'Dependencies', icon: '📚', weight: 0.35 },
    build: { name: 'Build', icon: '🔧', weight: 0.15 },
    deploy: { name: 'Preview', icon: '🚀', weight: 0.05 }
  }

  // Categorize events into phases
  const phases: BuildPhaseGroup[] = Object.entries(phaseDefinitions).map(([phaseKey, def]) => ({
    phase: phaseKey as BuildPhase,
    name: def.name,
    icon: def.icon,
    events: [],
    status: 'pending' as const,
    totalDuration: 0,
    estimatedProgress: def.weight * 100
  }))

  // Assign events to phases based on content analysis
  events.forEach((event, index) => {
    const phase = detectEventPhase(event)
    const phaseGroup = phases.find(p => p.phase === phase)
    if (phaseGroup) {
      phaseGroup.events.push(event)
    }
  })

  // Calculate phase statuses and durations
  let overallProgress = 0
  let currentPhaseIndex = -1

  phases.forEach((phase, index) => {
    if (phase.events.length === 0) return

    // Calculate total duration for completed events
    phase.totalDuration = phase.events
      .filter(e => e.duration)
      .reduce((sum, e) => sum + (e.duration || 0), 0)

    // Determine phase status
    const hasActiveEvent = phase.events.some(e =>
      e.eventType === 'started' || e.eventType === 'progress'
    )
    const allCompleted = phase.events.every(e =>
      e.eventType === 'completed' || events.indexOf(e) < events.length - 1
    )

    if (hasActiveEvent) {
      phase.status = 'active'
      currentPhaseIndex = index
      // Add partial progress for active phase
      overallProgress += phase.estimatedProgress * 0.5
    } else if (allCompleted && phase.events.length > 0) {
      phase.status = 'completed'
      overallProgress += phase.estimatedProgress
    } else if (phase.events.length > 0) {
      phase.status = 'pending'
    }
  })

  // Find current and next phases
  const currentPhase = phases[currentPhaseIndex]
  const nextPhase = phases.find((p, i) => i > currentPhaseIndex && p.events.length > 0)

  return {
    phases: phases.filter(p => p.events.length > 0),
    overallProgress: Math.min(overallProgress, 95), // Cap at 95% until fully complete
    currentPhase,
    nextPhase
  }
}

// Detect which phase an event belongs to based on content
function detectEventPhase(event: BuildEvent): BuildPhase {
  const title = event.title.toLowerCase()
  const description = event.description.toLowerCase()
  const message = event.details?.specificMessage?.toLowerCase() || ''

  // Dependencies phase
  if (title.includes('dependencies') || title.includes('install') ||
      message.includes('npm') || message.includes('yarn') ||
      title.includes('packages')) {
    return 'dependencies'
  }

  // Setup phase
  if (title.includes('setup') || title.includes('config') ||
      message.includes('package.json') || message.includes('tsconfig') ||
      title.includes('creating') && (message.includes('.json') || message.includes('config'))) {
    return 'setup'
  }

  // Build phase
  if (title.includes('build') || title.includes('compile') ||
      title.includes('validation') || message.includes('build') ||
      title.includes('validate')) {
    return 'build'
  }

  // Deploy phase
  if (title.includes('deploy') || title.includes('publish') ||
      title.includes('upload')) {
    return 'deploy'
  }

  // Development phase (default for code creation)
  return 'development'
}

// Generate completed phases summary
function getCompletedSummary(completedPhases: BuildPhaseGroup[]): string {
  if (completedPhases.length === 0) return ''

  const totalSteps = completedPhases.reduce((sum, p) => sum + p.events.length, 0)
  const totalTime = completedPhases.reduce((sum, p) => sum + p.totalDuration, 0)

  if (completedPhases.length === 1) {
    return `${completedPhases[0].name} complete (${totalSteps} steps, ${totalTime.toFixed(1)}s)`
  }

  const phaseNames = completedPhases.slice(0, 2).map(p => p.name.toLowerCase()).join(' & ')
  const remaining = completedPhases.length > 2 ? ` +${completedPhases.length - 2} more` : ''

  return `${phaseNames}${remaining} complete (${totalSteps} steps, ${totalTime.toFixed(1)}s)`
}

// Generate next steps preview
function getNextStepsPreview(nextPhase: BuildPhaseGroup, allPhases: BuildPhaseGroup[]): string {
  const remaining = allPhases.filter(p => p.status === 'pending').length

  if (remaining === 1) {
    return `${nextPhase.name} up next`
  }

  const secondNext = allPhases.find(p => p.status === 'pending' && p.phase !== nextPhase.phase)

  if (secondNext) {
    return `${nextPhase.name} → ${secondNext.name} up next`
  }

  return `${nextPhase.name} → finish up next`
}
