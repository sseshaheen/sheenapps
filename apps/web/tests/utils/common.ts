import { vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

// Performance testing utilities
export const measurePerformance = async (
  testFn: () => void | Promise<void>,
  options: {
    runs?: number
    warmup?: number
    maxDuration?: number
  } = {}
) => {
  const { runs = 10, warmup = 2, maxDuration = 1000 } = options
  const timings: number[] = []
  
  // Warmup runs
  for (let i = 0; i < warmup; i++) {
    await testFn()
  }
  
  // Measured runs
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    await testFn()
    const end = performance.now()
    timings.push(end - start)
  }
  
  const average = timings.reduce((a, b) => a + b, 0) / timings.length
  const min = Math.min(...timings)
  const max = Math.max(...timings)
  const median = timings.sort((a, b) => a - b)[Math.floor(timings.length / 2)]
  
  return {
    average,
    min,
    max,
    median,
    timings,
    passed: average < maxDuration
  }
}

// Memory leak detection utilities
export const detectMemoryLeak = async (
  setupFn: () => any,
  teardownFn: (instance: any) => void,
  options: {
    iterations?: number
    threshold?: number
  } = {}
) => {
  const { iterations = 100, threshold = 0.1 } = options
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc()
  }
  
  const initialMemory = process.memoryUsage().heapUsed
  const instances: any[] = []
  
  // Create and destroy instances
  for (let i = 0; i < iterations; i++) {
    const instance = setupFn()
    instances.push(instance)
  }
  
  // Cleanup all instances
  instances.forEach(instance => teardownFn(instance))
  instances.length = 0
  
  // Force garbage collection again
  if (global.gc) {
    global.gc()
  }
  
  const finalMemory = process.memoryUsage().heapUsed
  const memoryGrowth = (finalMemory - initialMemory) / initialMemory
  
  return {
    initialMemory,
    finalMemory,
    growth: memoryGrowth,
    hasLeak: memoryGrowth > threshold
  }
}

// Async testing utilities
export const waitForCondition = async (
  condition: () => boolean,
  options: {
    timeout?: number
    interval?: number
    message?: string
  } = {}
) => {
  const { timeout = 5000, interval = 50, message = 'Condition not met' } = options
  const start = Date.now()
  
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timeout: ${message}`)
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

// Event testing utilities
export const createEventSpy = () => {
  const events: Array<{ type: string; data: any; timestamp: number }> = []
  
  const spy = vi.fn((type: string, data?: any) => {
    events.push({ type, data, timestamp: Date.now() })
  })
  
  spy.getEvents = () => events
  spy.getEventsByType = (type: string) => events.filter(e => e.type === type)
  spy.clear = () => (events.length = 0)
  spy.waitForEvent = async (type: string, timeout = 1000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const event = events.find(e => e.type === type)
      if (event) return event
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error(`Event ${type} not received within ${timeout}ms`)
  }
  
  return spy
}

// React Hook testing utilities
export const testHookWithProvider = <T>(
  hook: () => T,
  wrapper: React.ComponentType<{ children: ReactNode }>
) => {
  const { result, rerender, unmount } = renderHook(hook, { wrapper })
  
  return {
    result,
    rerender,
    unmount,
    waitForNextUpdate: () => waitFor(() => {
      // Wait for any pending updates
    })
  }
}

// Store testing utilities
export const createStoreTestUtils = (store: any) => {
  const initialState = store.getState()
  
  return {
    reset: () => store.setState(initialState),
    expectState: (expected: any) => {
      expect(store.getState()).toMatchObject(expected)
    },
    waitForState: async (predicate: (state: any) => boolean, timeout = 1000) => {
      await waitForCondition(() => predicate(store.getState()), { timeout })
    },
    subscribeToChanges: () => {
      const changes: any[] = []
      const unsubscribe = store.subscribe((state: any) => {
        changes.push({ ...state })
      })
      return {
        changes,
        unsubscribe
      }
    }
  }
}

// API mocking utilities
export const createAPIErrorMock = (
  status: number,
  message: string,
  code?: string
) => {
  return vi.fn().mockRejectedValue({
    response: {
      status,
      data: { error: { message, code } }
    }
  })
}

export const createAPISuccessMock = (data: any) => {
  return vi.fn().mockResolvedValue({
    data,
    error: null
  })
}

// Browser API mocking
export const mockBrowserAPIs = () => {
  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0
  }
  
  // Mock sessionStorage
  const sessionStorageMock = { ...localStorageMock }
  
  // Mock window.matchMedia
  const matchMediaMock = vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
  
  // Mock IntersectionObserver
  const intersectionObserverMock = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }))
  
  // Mock ResizeObserver
  const resizeObserverMock = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }))
  
  return {
    localStorage: localStorageMock,
    sessionStorage: sessionStorageMock,
    matchMedia: matchMediaMock,
    IntersectionObserver: intersectionObserverMock,
    ResizeObserver: resizeObserverMock,
    apply: () => {
      Object.defineProperty(window, 'localStorage', { value: localStorageMock })
      Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock })
      Object.defineProperty(window, 'matchMedia', { value: matchMediaMock })
      global.IntersectionObserver = intersectionObserverMock as any
      global.ResizeObserver = resizeObserverMock as any
    }
  }
}

// Test data cleanup utilities
export const createCleanupManager = () => {
  const cleanupFns: Array<() => void | Promise<void>> = []
  
  return {
    add: (fn: () => void | Promise<void>) => {
      cleanupFns.push(fn)
    },
    cleanup: async () => {
      for (const fn of cleanupFns.reverse()) {
        await fn()
      }
      cleanupFns.length = 0
    }
  }
}

// Snapshot testing utilities
export const sanitizeSnapshot = (data: any): any => {
  if (typeof data !== 'object' || data === null) {
    return data
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeSnapshot)
  }
  
  const sanitized: any = {}
  for (const [key, value] of Object.entries(data)) {
    // Remove timestamps and IDs for stable snapshots
    if (key === 'id' || key === 'timestamp' || key.endsWith('_at')) {
      sanitized[key] = '[SANITIZED]'
    } else {
      sanitized[key] = sanitizeSnapshot(value)
    }
  }
  
  return sanitized
}

// Accessibility testing utilities
export const testA11y = (element: ReactElement) => {
  // Basic a11y checks (extend with axe-core for comprehensive testing)
  const props = element.props as any
  const checks = {
    hasRole: !!(props?.role),
    hasAriaLabel: !!(props?.['aria-label']) || !!(props?.['aria-labelledby']),
    hasAltText: element.type === 'img' ? !!(props?.alt) : true,
    isKeyboardAccessible: (props?.tabIndex) !== -1
  }
  
  return {
    passed: Object.values(checks).every(Boolean),
    checks
  }
}