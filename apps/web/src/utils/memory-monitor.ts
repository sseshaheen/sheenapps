/**
 * Memory Monitor - Tracks memory usage during development
 * Expert requirement: Prevent memory leaks and monitor growth
 */

interface MemorySnapshot {
  timestamp: number
  operation: string
  heapUsed: number
  heapTotal: number
  external: number
}

export class MemoryMonitor {
  private baseline: number = 0
  private snapshots: MemorySnapshot[] = []
  private maxSnapshots = 100 // Keep last 100 operations
  
  constructor() {
    this.baseline = this.getCurrentMemoryUsage()
  }
  
  private getCurrentMemoryUsage(): number {
    if (typeof window !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize
    }
    
    // Node.js environment
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed
    }
    
    return 0
  }
  
  private getTotalMemory(): number {
    if (typeof window !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.totalJSHeapSize
    }
    
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapTotal
    }
    
    return 0
  }
  
  private getExternalMemory(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().external
    }
    
    return 0
  }
  
  /**
   * Reset baseline for new measurement session
   */
  reset(): void {
    this.baseline = this.getCurrentMemoryUsage()
    this.snapshots = []
  }
  
  /**
   * Take a memory snapshot for an operation
   */
  snapshot(operation: string): MemorySnapshot {
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      operation,
      heapUsed: this.getCurrentMemoryUsage(),
      heapTotal: this.getTotalMemory(),
      external: this.getExternalMemory()
    }
    
    this.snapshots.push(snapshot)
    
    // Keep only recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots)
    }
    
    return snapshot
  }
  
  /**
   * Check memory growth since baseline and warn if excessive
   */
  check(operation: string, maxGrowthMB: number = 5): boolean {
    const snapshot = this.snapshot(operation)
    const growthBytes = snapshot.heapUsed - this.baseline
    const growthMB = growthBytes / (1024 * 1024)
    
    if (growthMB > maxGrowthMB) {
      console.warn(`🚨 Memory warning: ${operation} grew by ${growthMB.toFixed(2)}MB (limit: ${maxGrowthMB}MB)`)
      
      // Log recent operations for debugging
      const recentOps = this.snapshots.slice(-5).map(s => ({
        operation: s.operation,
        memoryMB: (s.heapUsed / (1024 * 1024)).toFixed(2)
      }))
      
      console.table(recentOps)
      return false
    }
    
    return true
  }
  
  /**
   * Get memory usage statistics
   */
  getStats(): {
    current: number
    baseline: number
    growth: number
    growthMB: number
    peakUsage: number
    averageGrowthPerOp: number
  } {
    const current = this.getCurrentMemoryUsage()
    const growth = current - this.baseline
    const growthMB = growth / (1024 * 1024)
    
    const peakUsage = Math.max(...this.snapshots.map(s => s.heapUsed), current)
    const averageGrowthPerOp = this.snapshots.length > 0 
      ? growth / this.snapshots.length 
      : 0
    
    return {
      current,
      baseline: this.baseline,
      growth,
      growthMB,
      peakUsage,
      averageGrowthPerOp
    }
  }
  
  /**
   * Get memory trend analysis
   */
  getTrend(): {
    isGrowing: boolean
    growthRate: number // MB per operation
    recommendation: string
  } {
    if (this.snapshots.length < 3) {
      return {
        isGrowing: false,
        growthRate: 0,
        recommendation: 'Need more data points for trend analysis'
      }
    }
    
    const recent = this.snapshots.slice(-10)
    const first = recent[0]
    const last = recent[recent.length - 1]
    
    const growthBytes = last.heapUsed - first.heapUsed
    const growthMB = growthBytes / (1024 * 1024)
    const growthRate = growthMB / recent.length
    
    const isGrowing = growthRate > 0.1 // More than 0.1MB per operation
    
    let recommendation = 'Memory usage is stable'
    if (isGrowing) {
      if (growthRate > 1) {
        recommendation = '🚨 HIGH: Memory growing rapidly, investigate immediately'
      } else if (growthRate > 0.5) {
        recommendation = '⚠️ MEDIUM: Memory growing steadily, monitor closely'
      } else {
        recommendation = '👀 LOW: Slight memory growth, keep monitoring'
      }
    }
    
    return {
      isGrowing,
      growthRate,
      recommendation
    }
  }
  
  /**
   * Force garbage collection (development only)
   */
  forceGC(): void {
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc()
    }
    
    if (typeof global !== 'undefined' && (global as any).gc) {
      (global as any).gc()
    }
  }
  
  /**
   * Log detailed memory report
   */
  report(): void {
    const stats = this.getStats()
    const trend = this.getTrend()
    
    console.group('📊 Memory Monitor Report')
    console.log(`Current Usage: ${(stats.current / (1024 * 1024)).toFixed(2)} MB`)
    console.log(`Baseline: ${(stats.baseline / (1024 * 1024)).toFixed(2)} MB`)
    console.log(`Growth: ${stats.growthMB.toFixed(2)} MB`)
    console.log(`Peak Usage: ${(stats.peakUsage / (1024 * 1024)).toFixed(2)} MB`)
    console.log(`Operations Tracked: ${this.snapshots.length}`)
    console.log(`Average Growth/Op: ${(stats.averageGrowthPerOp / 1024).toFixed(2)} KB`)
    console.log(`Trend: ${trend.recommendation}`)
    
    if (this.snapshots.length > 0) {
      console.log('\nRecent Operations:')
      console.table(
        this.snapshots.slice(-10).map(s => ({
          operation: s.operation,
          memoryMB: (s.heapUsed / (1024 * 1024)).toFixed(2),
          timestamp: new Date(s.timestamp).toLocaleTimeString()
        }))
      )
    }
    
    console.groupEnd()
  }
}

// Global instance for development
export const memoryMonitor = new MemoryMonitor()

// Development helper
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).memoryMonitor = memoryMonitor
  
  // Log memory stats periodically
  setInterval(() => {
    const stats = memoryMonitor.getStats()
    if (stats.growthMB > 10) { // Log if growth > 10MB
      console.log(`📊 Memory: ${stats.growthMB.toFixed(2)}MB growth`)
    }
  }, 30000) // Every 30 seconds
  
  // Capture snapshot before page unload to detect detached objects
  window.addEventListener('beforeunload', () => {
    const finalStats = memoryMonitor.getStats()
    console.log('🔍 Final memory snapshot before unload:', finalStats)
    
    // Force garbage collection if available for better leak detection
    if ('gc' in window && typeof (window as any).gc === 'function') {
      (window as any).gc()
      console.log('🧹 Forced garbage collection before unload')
    }
  })
}