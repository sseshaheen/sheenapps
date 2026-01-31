'use client'

import { lazy, Suspense } from 'react'
import type { ComponentProps } from 'react'

// Lazy load the Dialog components only when needed
const LazyDialog = lazy(() => import('./dialog').then(mod => ({ default: mod.Dialog })))
const LazyDialogContent = lazy(() => import('./dialog').then(mod => ({ default: mod.DialogContent })))
const LazyDialogHeader = lazy(() => import('./dialog').then(mod => ({ default: mod.DialogHeader })))
const LazyDialogTitle = lazy(() => import('./dialog').then(mod => ({ default: mod.DialogTitle })))
const LazyDialogDescription = lazy(() => import('./dialog').then(mod => ({ default: mod.DialogDescription })))
const LazyDialogFooter = lazy(() => import('./dialog').then(mod => ({ default: mod.DialogFooter })))
const LazyDialogTrigger = lazy(() => import('./dialog').then(mod => ({ default: mod.DialogTrigger })))

// Create wrapped components with Suspense
export function Dialog(props: ComponentProps<typeof LazyDialog>) {
  return (
    <Suspense fallback={null}>
      <LazyDialog {...props} />
    </Suspense>
  )
}

export function DialogContent(props: ComponentProps<typeof LazyDialogContent>) {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
        <div 
          role="dialog" 
          aria-labelledby="loading-dialog-title"
          aria-describedby="loading-dialog-description"
          className="bg-gray-950/95 border border-gray-800 rounded-lg p-6 w-full max-w-lg"
        >
          <h2 id="loading-dialog-title" className="sr-only">Loading</h2>
          <p id="loading-dialog-description" className="sr-only">Please wait while the dialog content loads</p>
          <div className="animate-pulse">
            <div className="h-6 bg-gray-800 rounded mb-4"></div>
            <div className="h-4 bg-gray-800 rounded mb-2"></div>
            <div className="h-4 bg-gray-800 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    }>
      <LazyDialogContent {...props} />
    </Suspense>
  )
}

export function DialogHeader(props: ComponentProps<typeof LazyDialogHeader>) {
  return (
    <Suspense fallback={null}>
      <LazyDialogHeader {...props} />
    </Suspense>
  )
}

export function DialogTitle(props: ComponentProps<typeof LazyDialogTitle>) {
  return (
    <Suspense fallback={null}>
      <LazyDialogTitle {...props} />
    </Suspense>
  )
}

export function DialogDescription(props: ComponentProps<typeof LazyDialogDescription>) {
  return (
    <Suspense fallback={null}>
      <LazyDialogDescription {...props} />
    </Suspense>
  )
}

export function DialogFooter(props: ComponentProps<typeof LazyDialogFooter>) {
  return (
    <Suspense fallback={null}>
      <LazyDialogFooter {...props} />
    </Suspense>
  )
}

export function DialogTrigger(props: ComponentProps<typeof LazyDialogTrigger>) {
  return (
    <Suspense fallback={null}>
      <LazyDialogTrigger {...props} />
    </Suspense>
  )
}