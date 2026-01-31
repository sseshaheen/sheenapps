'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

interface TestMonitoringData {
  test: any
  results: any
  lastUpdated: Date
  isLive: boolean
}

interface MonitoringAlert {
  id: string
  testId: string
  type: 'success_criteria_met' | 'statistical_significance' | 'safety_alert' | 'rollout_ready'
  message: string
  severity: 'info' | 'warning' | 'critical' | 'success'
  timestamp: Date
  action_required?: boolean
  suggested_action?: string
}

export function useTestMonitoring(testId?: string, refreshInterval = 30000) {
  const [monitoringData, setMonitoringData] = useState<TestMonitoringData | null>(null)
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastUpdateRef = useRef<Date | null>(null)

  const fetchTestData = useCallback(async () => {
    if (!testId) return

    try {
      setError(null)

      // Fetch test details and results in parallel
      const [testResponse, resultsResponse] = await Promise.all([
        fetch(`/api/admin/pricing/tests/${testId}?include_results=true&include_progress=true`, {
          headers: { 'Cache-Control': 'no-cache' }
        }),
        fetch(`/api/admin/pricing/tests/${testId}/results?time_range=24h&aggregation=hourly`, {
          headers: { 'Cache-Control': 'no-cache' }
        })
      ])

      if (!testResponse.ok || !resultsResponse.ok) {
        throw new Error('Failed to fetch test data')
      }

      const [testData, resultsData] = await Promise.all([
        testResponse.json(),
        resultsResponse.json()
      ])

      if (testData.success && resultsData.success) {
        const newData: TestMonitoringData = {
          test: testData.test,
          results: resultsData.results,
          lastUpdated: new Date(),
          isLive: testData.test.status === 'running'
        }

        // Check for new alerts
        if (lastUpdateRef.current) {
          const newAlerts = detectAlerts(newData, monitoringData)
          if (newAlerts.length > 0) {
            setAlerts(prev => [...newAlerts, ...prev].slice(0, 10)) // Keep last 10 alerts
            
            // Show toast notifications for critical alerts
            newAlerts.forEach(alert => {
              if (alert.severity === 'critical' || alert.action_required) {
                toast.error(alert.message, {
                  description: alert.suggested_action,
                  duration: 10000
                })
              } else if (alert.severity === 'success') {
                toast.success(alert.message, {
                  description: alert.suggested_action,
                  duration: 5000
                })
              }
            })
          }
        }

        setMonitoringData(newData)
        lastUpdateRef.current = new Date()
      }

    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch test data')
      console.error('Test monitoring error:', fetchError)
    }
  }, [testId, monitoringData])

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    setIsMonitoring(true)
    
    // Initial fetch
    fetchTestData()

    // Set up periodic updates
    intervalRef.current = setInterval(() => {
      fetchTestData()
    }, refreshInterval)

  }, [fetchTestData, refreshInterval])

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
    setIsMonitoring(false)
  }, [])

  const clearAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId))
  }, [])

  const clearAllAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  // Auto-start monitoring when testId changes
  useEffect(() => {
    if (testId) {
      startMonitoring()
    } else {
      stopMonitoring()
    }

    return () => stopMonitoring()
  }, [testId, startMonitoring, stopMonitoring])

  return {
    data: monitoringData,
    alerts,
    isMonitoring,
    error,
    startMonitoring,
    stopMonitoring,
    clearAlert,
    clearAllAlerts,
    refresh: fetchTestData
  }
}

function detectAlerts(newData: TestMonitoringData, oldData: TestMonitoringData | null): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = []
  
  if (!oldData) return alerts

  const testId = newData.test.id
  
  // Check for statistical significance achievement
  if (newData.results?.summary?.statistical_summary) {
    const stats = newData.results.summary.statistical_summary
    const oldStats = oldData.results?.summary?.statistical_summary
    
    if (stats.significance_test && !oldStats?.significance_test) {
      alerts.push({
        id: `${testId}-significance-${Date.now()}`,
        testId,
        type: 'statistical_significance',
        message: 'Test has reached statistical significance!',
        severity: 'success',
        timestamp: new Date(),
        action_required: true,
        suggested_action: 'Review results and consider stopping the test'
      })
    }
  }

  // Check for success criteria being met
  const newMetrics = newData.test.current_metrics
  const oldMetrics = oldData.test.current_metrics
  
  if (newMetrics && oldMetrics) {
    // Check if sample size threshold reached
    const newSampleSize = Object.values(newMetrics).reduce((sum: number, group: any) => {
      return sum + (group.sample_size || 0)
    }, 0)
    const oldSampleSize = Object.values(oldMetrics).reduce((sum: number, group: any) => {
      return sum + (group.sample_size || 0)
    }, 0)
    
    const minSampleSize = newData.test.success_criteria?.minimum_sample_size || 1000
    
    if (newSampleSize >= minSampleSize && oldSampleSize < minSampleSize) {
      alerts.push({
        id: `${testId}-sample-${Date.now()}`,
        testId,
        type: 'success_criteria_met',
        message: 'Minimum sample size reached',
        severity: 'info',
        timestamp: new Date(),
        suggested_action: 'Test can now provide reliable results'
      })
    }
  }

  // Check for rollout progression (gradual rollout tests)
  if (newData.test.test_type === 'gradual_rollout' && newData.test.rollout_progress) {
    const newProgress = newData.test.rollout_progress
    const oldProgress = oldData.test.rollout_progress || []
    
    // Find newly completed stages
    const newlyCompleted = newProgress.filter((stage: any) => 
      stage.status === 'completed' && 
      !oldProgress.some((oldStage: any) => oldStage.id === stage.id && oldStage.status === 'completed')
    )
    
    newlyCompleted.forEach((stage: any) => {
      alerts.push({
        id: `${testId}-rollout-${stage.id}-${Date.now()}`,
        testId,
        type: 'rollout_ready',
        message: `Rollout stage "${stage.stage_name}" completed successfully`,
        severity: 'success',
        timestamp: new Date(),
        action_required: true,
        suggested_action: 'Ready to advance to next rollout stage'
      })
    })
  }

  // Safety alerts - check for concerning metrics
  if (newData.results?.processed_data) {
    newData.results.processed_data.forEach((group: any) => {
      const latestMetrics = group.latest_metrics || {}
      
      // High error rate alert
      if (latestMetrics.error_rate > 0.05) { // 5% threshold
        alerts.push({
          id: `${testId}-error-${group.test_group}-${Date.now()}`,
          testId,
          type: 'safety_alert',
          message: `High error rate detected in ${group.test_group}: ${(latestMetrics.error_rate * 100).toFixed(1)}%`,
          severity: 'critical',
          timestamp: new Date(),
          action_required: true,
          suggested_action: 'Consider pausing the test immediately'
        })
      }
      
      // High bounce rate alert
      if (latestMetrics.bounce_rate > 0.8) { // 80% threshold
        alerts.push({
          id: `${testId}-bounce-${group.test_group}-${Date.now()}`,
          testId,
          type: 'safety_alert',
          message: `High bounce rate in ${group.test_group}: ${(latestMetrics.bounce_rate * 100).toFixed(1)}%`,
          severity: 'warning',
          timestamp: new Date(),
          suggested_action: 'Monitor user experience closely'
        })
      }
    })
  }

  return alerts
}

// Hook for monitoring multiple tests
export function useTestListMonitoring(refreshInterval = 60000) {
  const [tests, setTests] = useState<any[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchAllTests = useCallback(async () => {
    try {
      setError(null)

      const response = await fetch('/api/admin/pricing/tests?status=running', {
        headers: { 'Cache-Control': 'no-cache' }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch tests')
      }

      const data = await response.json()
      if (data.success) {
        setTests(data.tests)
      }

    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch tests')
      console.error('Test list monitoring error:', fetchError)
    }
  }, [])

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    setIsMonitoring(true)
    
    // Initial fetch
    fetchAllTests()

    // Set up periodic updates
    intervalRef.current = setInterval(() => {
      fetchAllTests()
    }, refreshInterval)

  }, [fetchAllTests, refreshInterval])

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
    setIsMonitoring(false)
  }, [])

  return {
    tests,
    isMonitoring,
    error,
    startMonitoring,
    stopMonitoring,
    refresh: fetchAllTests
  }
}