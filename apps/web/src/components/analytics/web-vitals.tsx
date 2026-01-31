'use client'

/**
 * 📊 Web-Vitals Real-User Monitoring
 * Tracks Core Web Vitals to measure bundle optimization impact
 * Expert mandate: "Ship Web-Vitals logging this week"
 */

import { useEffect } from 'react'
import { onCLS, onFCP, onLCP, onTTFB, onINP } from 'web-vitals'
import { logger } from '@/utils/logger'

// FIX: Sample client logs to avoid console spam in production
// NODE_ENV is inlined at build time by Next.js - safe to use in client components
// eslint-disable-next-line no-restricted-globals
const CLIENT_LOG_SAMPLE = process.env.NODE_ENV === 'production' ? 0.01 : 1.0

/**
 * Send vital data using sendBeacon (survives page unload) with fetch fallback
 */
function postVital(payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload)

  // Prefer sendBeacon (survives unload/navigation)
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' })
    const ok = navigator.sendBeacon('/api/analytics/web-vitals', blob)
    if (ok) return
  }

  // Fallback: fetch with keepalive
  fetch('/api/analytics/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    cache: 'no-store',
  }).catch(() => {
    // Analytics should stay fire-and-forget
  })
}

export function WebVitalsMonitor() {
  useEffect(() => {
    const sendToAnalytics = (metric: any) => {
      const webVitalData = {
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType || 'unknown',
        url: window.location.href,
        timestamp: Date.now(),
      }

      // FIX: Sample client logs to avoid console spam
      if (Math.random() < CLIENT_LOG_SAMPLE) {
        logger.info(`📊 Web Vital: ${metric.name}`, {
          value: `${Math.round(metric.value)}ms`,
          rating: metric.rating,
          route: window.location.pathname,
        })
      }

      // Fire-and-forget using sendBeacon
      postVital(webVitalData)
    }

    // Track all Core Web Vitals - using observer pattern
    onCLS(sendToAnalytics)
    onINP(sendToAnalytics) // INP replaced FID in web-vitals v4
    onFCP(sendToAnalytics)
    onLCP(sendToAnalytics)
    onTTFB(sendToAnalytics)
  }, [])

  // This component doesn't render anything
  return null
}

/**
 * Custom performance metric reporter
 * Use this to track app-specific metrics like TTFMUI, AI response time, etc.
 *
 * See: docs/PERFORMANCE_ANALYSIS.md - Section 8 (Custom Snappiness Metrics)
 */
export function reportCustomMetric(
  name: string,
  value: number,
  metadata?: Record<string, string | number | boolean>
) {
  if (typeof window === 'undefined') return

  // Log locally for debugging
  logger.info(`📊 Custom Metric: ${name}`, {
    value: `${Math.round(value)}ms`,
    ...metadata
  })

  // Send to analytics endpoint (same as web vitals, but with custom flag)
  fetch('/api/analytics/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      value,
      rating: value < 1500 ? 'good' : value < 3000 ? 'needs-improvement' : 'poor',
      delta: value,
      id: `custom-${name}-${Date.now()}`,
      navigationType: 'custom',
      url: window.location.href,
      timestamp: Date.now(),
      ...metadata
    })
  }).catch(err => logger.error(`Failed to send custom metric ${name}:`, err))
}

/**
 * Track Time to First Meaningful UI (TTFMUI)
 * Call this when the main interactive shell is rendered and clickable.
 *
 * Target: < 1.5s for workspace shell
 */
export function trackTTFMUI(componentName: string = 'workspace-shell') {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return

  // Mark the current point as shell ready
  const markName = `${componentName}-ready`
  const measureName = `ttfmui-${componentName}`

  try {
    performance.mark(markName)
    performance.measure(measureName, 'fetchStart', markName)

    const entry = performance.getEntriesByName(measureName)[0]
    if (entry) {
      reportCustomMetric('TTFMUI', entry.duration, {
        component: componentName
      })
    }

    // Cleanup to avoid memory buildup on repeated calls
    performance.clearMarks(markName)
    performance.clearMeasures(measureName)
  } catch (err) {
    // Performance API may not be fully supported in all environments
    logger.warn('Failed to track TTFMUI:', err)
  }
}

/**
 * Bundle optimization tracking helper
 * Reports bundle-specific metrics for correlation analysis
 */
export function trackBundleMetrics() {
  if (typeof window === 'undefined') return

  // Track bundle-specific timing
  setTimeout(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    
    // Calculate JS bundle load time
    const jsResources = resources.filter(r => r.name.includes('.js'))
    const bundleLoadTime = jsResources.reduce((total, resource) => {
      return total + (resource.responseEnd - resource.requestStart)
    }, 0)

    const bundleMetrics = {
      bundleLoadTime: Math.round(bundleLoadTime),
      jsResourceCount: jsResources.length,
      totalResourceCount: resources.length,
      domContentLoaded: Math.round(navigation.domContentLoadedEventEnd - navigation.fetchStart),
      url: window.location.pathname,
      timestamp: Date.now()
    }

    logger.info('📦 Bundle metrics:', bundleMetrics)

    // Send bundle metrics
    fetch('/api/analytics/bundle-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundleMetrics),
    }).catch(err => logger.error('Failed to send bundle metrics:', err))
  }, 2000) // Wait 2s for resources to load
}