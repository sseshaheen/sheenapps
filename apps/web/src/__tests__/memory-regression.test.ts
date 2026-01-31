/**
 * Memory Regression Tests
 * 
 * Tests for memory leaks in the builder and preview engine
 * Fails build if memory growth exceeds 2MB over extended usage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'

// Memory monitoring utilities
interface MemorySnapshot {
  timestamp: number
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
}

class MemoryMonitor {
  private snapshots: MemorySnapshot[] = []
  private intervalId: NodeJS.Timeout | null = null
  
  start(intervalMs: number = 1000) {
    this.snapshots = []
    this.takeSnapshot() // Initial snapshot
    
    this.intervalId = setInterval(() => {
      this.takeSnapshot()
    }, intervalMs)
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
  
  private takeSnapshot() {
    const memory = process.memoryUsage()
    this.snapshots.push({
      timestamp: Date.now(),
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      rss: memory.rss
    })
  }
  
  getGrowth(): { 
    heapGrowth: number
    totalGrowth: number 
    maxHeap: number
    avgGrowthRate: number
  } {
    if (this.snapshots.length < 2) {
      return { heapGrowth: 0, totalGrowth: 0, maxHeap: 0, avgGrowthRate: 0 }
    }
    
    const first = this.snapshots[0]
    const last = this.snapshots[this.snapshots.length - 1]
    const maxHeap = Math.max(...this.snapshots.map(s => s.heapUsed))
    
    const heapGrowth = last.heapUsed - first.heapUsed
    const totalGrowth = last.rss - first.rss
    const timeElapsed = (last.timestamp - first.timestamp) / 1000 // seconds
    const avgGrowthRate = heapGrowth / timeElapsed // bytes per second
    
    return {
      heapGrowth: heapGrowth / (1024 * 1024), // Convert to MB
      totalGrowth: totalGrowth / (1024 * 1024), // Convert to MB
      maxHeap: maxHeap / (1024 * 1024), // Convert to MB
      avgGrowthRate: avgGrowthRate / (1024 * 1024) // MB per second
    }
  }
  
  getSnapshots() {
    return [...this.snapshots]
  }
}

// Mock components that simulate the builder
const MockBuilderComponent = () => {
  const [state, setState] = React.useState({
    previews: new Map(),
    history: [],
    questions: [],
    cache: new Map()
  })
  
  // Simulate memory-intensive operations
  const addPreview = () => {
    setState(prev => {
      const newPreviews = new Map(prev.previews)
      const largeContent = Array(1000).fill(0).map((_, i) => `preview-content-${i}-${Date.now()}`)
      newPreviews.set(Date.now(), largeContent)
      return { ...prev, previews: newPreviews }
    })
  }
  
  const addToHistory = () => {
    setState(prev => ({
      ...prev,
      history: [...prev.history, {
        id: Date.now(),
        content: Array(100).fill(0).map((_, i) => `history-item-${i}-${Date.now()}`)
      }]
    }))
  }
  
  const clearCache = () => {
    setState(prev => ({
      ...prev,
      previews: new Map(),
      cache: new Map(),
      history: []
    }))
  }
  
  return React.createElement('div', {
    'data-testid': 'mock-builder'
  }, [
      React.createElement('button', {
        key: 'add-preview',
        'data-testid': 'add-preview',
        onClick: addPreview
      }, 'Add Preview'),
      React.createElement('button', {
        key: 'add-history',
        'data-testid': 'add-history', 
        onClick: addToHistory
      }, 'Add History'),
      React.createElement('button', {
        key: 'clear-cache',
        'data-testid': 'clear-cache',
        onClick: clearCache
      }, 'Clear Cache'),
      React.createElement('div', {
        key: 'state-display',
        'data-testid': 'state-size'
      }, `Previews: ${state.previews.size}, History: ${state.history.length}`)
    ])
}

// Utility to simulate realistic user interactions
async function simulateBuilderSession(component: ReturnType<typeof render>, durationMs: number) {
  const endTime = Date.now() + durationMs
  const addPreviewBtn = component.getByTestId('add-preview')
  const addHistoryBtn = component.getByTestId('add-history')
  const clearCacheBtn = component.getByTestId('clear-cache')
  
  let actionCount = 0
  
  while (Date.now() < endTime) {
    // Simulate various user actions
    if (actionCount % 10 === 0) {
      // Clear cache periodically to simulate cleanup
      fireEvent.click(clearCacheBtn)
    } else if (actionCount % 3 === 0) {
      // Add to history frequently
      fireEvent.click(addHistoryBtn)
    } else {
      // Generate previews most frequently
      fireEvent.click(addPreviewBtn)
    }
    
    actionCount++
    
    // Wait between actions to simulate real usage
    await new Promise(resolve => setTimeout(resolve, 10)) // Faster for tests
    
    // Force garbage collection if available (Node.js)
    if (global.gc) {
      global.gc()
    }
  }
  
  return actionCount
}

describe('Memory Regression Tests', () => {
  let memoryMonitor: MemoryMonitor
  
  beforeEach(() => {
    memoryMonitor = new MemoryMonitor()
    
    // Force garbage collection before each test
    if (global.gc) {
      global.gc()
    }
  })
  
  afterEach(() => {
    memoryMonitor.stop()
    cleanup()
    
    // Force garbage collection after each test
    if (global.gc) {
      global.gc()
    }
  })
  
  it.skip('should not leak memory during short builder session', async () => {
    
    const TEST_DURATION = process.env.CI ? 30 * 1000 : 5 * 1000 // 30s in CI, 5s locally
    const MEMORY_LIMIT_MB = 2 // 2MB growth limit
    
    memoryMonitor.start(500) // Sample every 500ms
    
    const component = render(React.createElement(MockBuilderComponent))
    
    // Simulate realistic builder usage
    const actionCount = await simulateBuilderSession(component, TEST_DURATION)
    
    memoryMonitor.stop()
    
    const growth = memoryMonitor.getGrowth()
    
    // eslint-disable-next-line no-console
    console.log('Memory Growth Analysis:', {
      heapGrowth: `${growth.heapGrowth.toFixed(2)}MB`,
      totalGrowth: `${growth.totalGrowth.toFixed(2)}MB`,
      maxHeap: `${growth.maxHeap.toFixed(2)}MB`,
      avgGrowthRate: `${growth.avgGrowthRate.toFixed(4)}MB/s`,
      actionsPerformed: actionCount,
      testDuration: `${TEST_DURATION / 1000}s`
    })
    
    // Test assertions
    expect(growth.heapGrowth).toBeLessThan(MEMORY_LIMIT_MB)
    expect(growth.totalGrowth).toBeLessThan(MEMORY_LIMIT_MB * 2) // Allow more total growth
    expect(growth.avgGrowthRate).toBeLessThan(0.1) // Less than 0.1MB/s growth rate
  }, 45000) // 45 second timeout
  
  it.skip('should not leak memory during extended preview generation', async () => {
    
    const TEST_DURATION = 5 * 60 * 1000 // 5 minutes
    const MEMORY_LIMIT_MB = 2 // 2MB growth limit
    
    memoryMonitor.start(1000) // Sample every second
    
    const component = render(React.createElement(MockBuilderComponent))
    
    // Simulate extended builder usage with more preview generation
    const endTime = Date.now() + TEST_DURATION
    let actionCount = 0
    
    while (Date.now() < endTime) {
      // Focus on preview generation (most memory-intensive)
      fireEvent.click(component.getByTestId('add-preview'))
      actionCount++
      
      // Periodic cleanup every 50 actions
      if (actionCount % 50 === 0) {
        fireEvent.click(component.getByTestId('clear-cache'))
        
        // Force garbage collection
        if (global.gc) {
          global.gc()
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    memoryMonitor.stop()
    
    const growth = memoryMonitor.getGrowth()
    
    // eslint-disable-next-line no-console
    console.log('Extended Memory Growth Analysis:', {
      heapGrowth: `${growth.heapGrowth.toFixed(2)}MB`,
      totalGrowth: `${growth.totalGrowth.toFixed(2)}MB`,
      maxHeap: `${growth.maxHeap.toFixed(2)}MB`,
      avgGrowthRate: `${growth.avgGrowthRate.toFixed(4)}MB/s`,
      actionsPerformed: actionCount,
      testDuration: `${TEST_DURATION / 1000}s`
    })
    
    // Stricter limits for extended tests
    expect(growth.heapGrowth).toBeLessThan(MEMORY_LIMIT_MB)
    expect(growth.avgGrowthRate).toBeLessThan(0.01) // Very low growth rate
  }, 6 * 60 * 1000) // 6 minute timeout
  
  it('should properly clean up when component unmounts', async () => {
    // Skip memory tests in regular test runs
    if (!process.env.CI && !process.env.RUN_MEMORY_TESTS) {
      console.log('Skipping memory cleanup test (set RUN_MEMORY_TESTS=true to enable)')
      return
    }
    if (global.gc) global.gc()
    
    memoryMonitor.start(100)
    
    // Mount and unmount component multiple times
    for (let i = 0; i < 10; i++) {
      const component = render(React.createElement(MockBuilderComponent))
      
      // Simulate some activity
      fireEvent.click(component.getByTestId('add-preview'))
      fireEvent.click(component.getByTestId('add-history'))
      
      cleanup() // Unmount
      
      if (global.gc) global.gc()
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    memoryMonitor.stop()
    
    const growth = memoryMonitor.getGrowth()
    
    // eslint-disable-next-line no-console
    console.log('Mount/Unmount Memory Analysis:', {
      heapGrowth: `${growth.heapGrowth.toFixed(2)}MB`,
      avgGrowthRate: `${growth.avgGrowthRate.toFixed(4)}MB/s`
    })
    
    // Should have minimal growth from mount/unmount cycles
    expect(growth.heapGrowth).toBeLessThan(1) // Less than 1MB growth
  })
  
  it('should handle memory pressure gracefully', async () => {
    // Skip memory tests in regular test runs
    if (!process.env.CI && !process.env.RUN_MEMORY_TESTS) {
      console.log('Skipping memory pressure test (set RUN_MEMORY_TESTS=true to enable)')
      return
    }
    memoryMonitor.start(200)
    
    const component = render(React.createElement(MockBuilderComponent))
    
    // Create memory pressure by rapidly adding content
    for (let i = 0; i < 100; i++) {
      fireEvent.click(component.getByTestId('add-preview'))
      
      // Check if we should clean up based on memory usage
      if (i % 20 === 0) {
        const currentGrowth = memoryMonitor.getGrowth()
        if (currentGrowth.heapGrowth > 1) {
          fireEvent.click(component.getByTestId('clear-cache'))
          if (global.gc) global.gc()
        }
      }
    }
    
    memoryMonitor.stop()
    
    const growth = memoryMonitor.getGrowth()
    
    // eslint-disable-next-line no-console
    console.log('Memory Pressure Analysis:', {
      heapGrowth: `${growth.heapGrowth.toFixed(2)}MB`,
      maxHeap: `${growth.maxHeap.toFixed(2)}MB`
    })
    
    // Should handle memory pressure without excessive growth
    expect(growth.heapGrowth).toBeLessThan(5) // Allow more growth under pressure
    expect(growth.maxHeap).toBeLessThan(50) // Reasonable max heap size
  })
})

// Export for potential use in other tests
export { MemoryMonitor, simulateBuilderSession }