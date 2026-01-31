'use client'

/**
 * Lazy-loaded components for code splitting
 * Reduces initial workspace bundle by ~200KB
 */

import React from 'react'
import dynamic from 'next/dynamic'
import { ComponentType } from 'react'

// Heavy animation components - split first (Framer Motion users)
export const LazyQuestionInterface = dynamic(
  () => import('./question-flow/question-interface').then(mod => ({ default: mod.QuestionInterface })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Loading questions...</div>
      </div>
    )
  }
)

export const LazyMobileQuestionInterface = dynamic(
  () => import('./question-flow/mobile-question-interface').then(mod => ({ default: mod.MobileQuestionInterface })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-32">
        <div className="animate-pulse text-gray-500">Loading mobile interface...</div>
      </div>
    )
  }
)

// Preview and overlay components (heavy with AI features)
export const LazyMinimalComponentOverlay = dynamic(
  () => import('../preview/minimal-component-overlay').then(mod => ({ default: mod.MinimalComponentOverlay })),
  {
    loading: () => <div className="animate-pulse bg-gray-100 rounded h-8" />
  }
)

export const LazyPerChoiceAIOverlay = dynamic(
  () => import('../preview/per-choice-ai-overlay').then(mod => ({ default: mod.PerChoiceAIOverlay })),
  {
    loading: () => <div className="animate-pulse bg-blue-50 rounded h-12" />
  }
)

// Section editing system (complex UI)
export const LazySectionEditDialog = dynamic(
  () => import('./section-editors/section-edit-dialog').then(mod => ({ default: mod.SectionEditDialog })),
  {
    loading: () => (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }
)

export const LazySectionEditSystem = dynamic(
  () => import('./section-editors/section-edit-system').then(mod => ({ default: mod.SectionEditSystem })),
  {
    loading: () => <div className="animate-pulse bg-gray-50 rounded h-16" />
  }
)

// Engagement and celebration features (non-critical)
export const LazyCelebrationEffects = dynamic(
  () => import('./engagement/celebration-effects').then(mod => ({ default: mod.CelebrationEffects })),
  {
    loading: () => null // Silent loading for celebration effects
  }
)

export const LazySmartHint = dynamic(
  () => import('./hints/smart-hint').then(mod => ({ default: mod.SmartHint })),
  {
    loading: () => (
      <div className="animate-pulse bg-blue-50 rounded p-2 text-xs text-blue-600">
        Loading hint...
      </div>
    )
  }
)

// Mobile workspace layout (mobile-only)
export const LazyMobileWorkspaceLayout = dynamic(
  () => import('./workspace/mobile-workspace-layout').then(mod => ({ default: mod.MobileWorkspaceLayout })),
  {
    loading: () => (
      <div className="flex flex-col h-screen animate-pulse">
        <div className="h-14 bg-gray-100"></div>
        <div className="flex-1 bg-gray-50"></div>
        <div className="h-16 bg-gray-100"></div>
      </div>
    )
  }
)

// Builder interfaces (heavy logic)
export const LazyBuilderInterface = dynamic(
  () => import('./builder-interface').then(mod => ({ default: mod.BuilderInterface })),
  {
    loading: () => (
      <div className="flex h-full animate-pulse">
        <div className="w-64 bg-gray-100"></div>
        <div className="flex-1 bg-gray-50"></div>
        <div className="w-80 bg-gray-100"></div>
      </div>
    )
  }
)

export const LazyOrchestrationInterface = dynamic(
  () => import('./orchestration-interface').then(mod => ({ default: mod.OrchestrationInterface })),
  {
    loading: () => <div className="animate-pulse bg-purple-50 rounded h-20" />
  }
)

// Framer Motion utility wrapper for splitting motion components
export const withLazyMotion = <T extends object>(
  importFn: () => Promise<{ default: ComponentType<T> }>,
  loadingComponent?: ComponentType
) => {
  return dynamic(importFn, {
    loading: loadingComponent ? () => React.createElement(loadingComponent) : undefined
  })
}

// Motion components that can be split
export const LazyMotionDiv = dynamic(
  () => import('framer-motion').then(mod => ({ default: mod.motion.div })),
  { ssr: false }
)

export const LazyAnimatePresence = dynamic(
  () => import('framer-motion').then(mod => ({ default: mod.AnimatePresence })),
  { ssr: false }
)

// 🎯 BD-5: Monster Chunk Surgery - Chat Interface (React Component)
export const LazyChatInterface = dynamic(
  () => import('./orchestration/chat-interface').then(mod => ({ default: mod.ChatInterface })),
  {
    loading: () => (
      <div className="animate-pulse bg-gray-50 rounded h-32 flex items-center justify-center">
        <div className="text-gray-500">Loading AI chat...</div>
      </div>
    )
  }
)

// Note: LivePreviewEngine and AIOrchestrator are service classes, not React components
// They are lazy-loaded directly in their respective components using dynamic imports

// Critical components that should NOT be lazy loaded
// (Keep these as regular imports for LCP)
// - WorkspaceHeader
// - Basic layout components
// - Essential preview frame