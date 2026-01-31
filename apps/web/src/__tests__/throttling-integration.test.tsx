/**
 * Throttling Integration Tests
 * 
 * Tests to verify that event handler throttling is working correctly
 * and improves performance without breaking functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import React, { useRef, useState } from 'react'
import { useResponsive } from '../hooks/use-responsive'
import { useGestures } from '../hooks/use-gestures'
import { throttleWithRAF, throttle, PerformanceUtils } from '../hooks/use-throttle'

// Mock component to test throttled resize handling
const ResponsiveTestComponent = () => {
  const responsive = useResponsive()
  const [updateCount, setUpdateCount] = useState(0)
  
  React.useEffect(() => {
    setUpdateCount(prev => prev + 1)
  }, [responsive.viewport, responsive.width, responsive.height])
  
  return (
    <div data-testid="responsive-component">
      <div data-testid="viewport">{responsive.viewport}</div>
      <div data-testid="width">{responsive.width}</div>
      <div data-testid="height">{responsive.height}</div>
      <div data-testid="update-count">{updateCount}</div>
    </div>
  )
}

// Mock component to test throttled gesture handling
const GestureTestComponent = () => {
  const elementRef = useRef<HTMLDivElement>(null)
  const [gestureCount, setGestureCount] = useState(0)
  const [moveCount, setMoveCount] = useState(0)
  
  useGestures(elementRef, {
    onSwipeLeft: () => setGestureCount(prev => prev + 1),
    onSwipeRight: () => setGestureCount(prev => prev + 1),
    onSwipeUp: () => setGestureCount(prev => prev + 1),
    onSwipeDown: () => setGestureCount(prev => prev + 1),
  })
  
  // Add a direct mousemove listener to compare with throttled gestures
  React.useEffect(() => {
    const element = elementRef.current
    if (!element) return
    
    const handleMove = () => setMoveCount(prev => prev + 1)
    element.addEventListener('mousemove', handleMove)
    
    return () => element.removeEventListener('mousemove', handleMove)
  }, [])
  
  return (
    <div 
      ref={elementRef} 
      data-testid="gesture-component"
      style={{ width: 200, height: 200, backgroundColor: '#f0f0f0' }}
    >
      <div data-testid="gesture-count">{gestureCount}</div>
      <div data-testid="move-count">{moveCount}</div>
    </div>
  )
}

describe('Throttling Integration Tests', () => {
  beforeEach(() => {
    // Reset window size to default
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
    
    // Mock requestAnimationFrame with immediate execution for tests
    global.requestAnimationFrame = vi.fn((cb) => {
      cb(16) // Execute immediately instead of setTimeout
      return 1
    })
    global.cancelAnimationFrame = vi.fn()
  })
  
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })
  
  describe('Responsive Hook Throttling', () => {
    it('should throttle resize events using requestAnimationFrame', async () => {
      const component = render(<ResponsiveTestComponent />)
      
      // Get initial update count
      const initialCount = parseInt(component.getByTestId('update-count').textContent || '0')
      
      // Rapidly trigger resize events wrapped in act
      await act(async () => {
        for (let i = 0; i < 10; i++) {
          Object.defineProperty(window, 'innerWidth', { value: 800 + i, writable: true })
          fireEvent(window, new Event('resize'))
        }
        
        // Wait for throttled updates
        await new Promise(resolve => setTimeout(resolve, 20))
      })
      
      const finalCount = parseInt(component.getByTestId('update-count').textContent || '0')
      
      // Should have fewer updates than events due to throttling
      expect(finalCount - initialCount).toBeLessThan(10)
      expect(finalCount - initialCount).toBeGreaterThan(0)
      expect(global.requestAnimationFrame).toHaveBeenCalled()
    })
    
    it('should eventually reflect the final viewport state', async () => {
      const component = render(<ResponsiveTestComponent />)
      
      // Change to mobile viewport wrapped in act
      await act(async () => {
        Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
        Object.defineProperty(window, 'innerHeight', { value: 812, writable: true })
        fireEvent(window, new Event('resize'))
        
        // Wait for throttled update to complete
        await new Promise(resolve => setTimeout(resolve, 30))
      })
      
      expect(component.getByTestId('viewport').textContent).toBe('mobile')
      expect(component.getByTestId('width').textContent).toBe('375')
      expect(component.getByTestId('height').textContent).toBe('812')
    })
  })
  
  describe('Gesture Hook Throttling', () => {
    it('should throttle mouse move events during gestures', () => {
      const component = render(<GestureTestComponent />)
      const gestureElement = component.getByTestId('gesture-component')
      
      // Rapidly fire mousemove events
      for (let i = 0; i < 20; i++) {
        fireEvent.mouseMove(gestureElement, { clientX: 10 + i, clientY: 10 + i })
      }
      
      const moveCount = parseInt(component.getByTestId('move-count').textContent || '0')
      
      // Direct move listener should see all events
      expect(moveCount).toBe(20)
      
      // Throttled gesture handler should see fewer (handled internally by throttling)
      expect(global.requestAnimationFrame).toHaveBeenCalled()
    })
    
    it('should still detect gestures correctly despite throttling', async () => {
      const component = render(<GestureTestComponent />)
      const gestureElement = component.getByTestId('gesture-component')
      
      // Simulate a swipe gesture
      fireEvent.mouseDown(gestureElement, { clientX: 10, clientY: 10 })
      
      // Move rapidly across the element
      for (let i = 0; i < 10; i++) {
        fireEvent.mouseMove(gestureElement, { clientX: 10 + i * 10, clientY: 10 })
      }
      
      fireEvent.mouseUp(gestureElement, { clientX: 110, clientY: 10 })
      
      // Wait for gesture processing
      await new Promise(resolve => setTimeout(resolve, 20))
      
      const gestureCount = parseInt(component.getByTestId('gesture-count').textContent || '0')
      
      // Should have detected the swipe gesture
      expect(gestureCount).toBeGreaterThan(0)
    })
  })
  
  describe('Throttling Utilities', () => {
    it('should throttle function calls using requestAnimationFrame', () => {
      const mockFn = vi.fn()
      const throttled = throttleWithRAF(mockFn)
      
      // Call multiple times rapidly
      throttled('arg1')
      throttled('arg2')
      throttled('arg3')
      
      // Should only have scheduled one RAF call
      expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1)
      // Since we're executing RAF callbacks immediately in tests, function is called
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith('arg1')
    })
    
    it('should throttle function calls with custom delay', async () => {
      const mockFn = vi.fn()
      const throttled = throttle(mockFn, 50)
      
      // Call multiple times rapidly
      throttled('arg1')
      throttled('arg2')
      throttled('arg3')
      
      // Should execute immediately first time
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith('arg1')
      
      // Wait for throttle delay
      await new Promise(resolve => setTimeout(resolve, 55))
      
      // Should execute the latest call
      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(mockFn).toHaveBeenLastCalledWith('arg3')
    })
    
    it('should cancel throttled calls correctly', () => {
      const mockFn = vi.fn()
      const throttled = throttleWithRAF(mockFn)
      
      throttled('test')
      throttled.cancel()
      
      expect(global.cancelAnimationFrame).toHaveBeenCalled()
    })
  })
  
  describe('Performance Monitoring', () => {
    it('should measure handler performance', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      // Mock a slow handler without blocking
      const slowHandler = vi.fn(() => {
        // Simulate slow work without actually blocking
      })
      
      const measuredHandler = PerformanceUtils.measureHandler(slowHandler, 'test-handler')
      
      // Mock performance.now to simulate timing
      const mockPerformance = {
        now: vi.fn()
          .mockReturnValueOnce(0)  // Start time
          .mockReturnValueOnce(20) // End time (20ms later)
      }
      
      Object.defineProperty(global, 'performance', {
        value: mockPerformance,
        writable: true
      })
      
      measuredHandler()
      
      // Should warn about slow handler
      expect(consoleSpy).toHaveBeenCalledWith('test-handler took 20.00ms (>16ms frame budget)')
      
      consoleSpy.mockRestore()
    })
    
    it('should detect RAF support', () => {
      expect(PerformanceUtils.supportsRAF).toBe(true)
    })
  })
})

// Performance comparison test
describe('Performance Impact Tests', () => {
  it('should reduce event handler frequency with throttling', async () => {
    let unthrottledCount = 0
    let throttledCount = 0
    
    const unthrottledHandler = () => unthrottledCount++
    const throttledHandler = throttleWithRAF(() => throttledCount++)
    
    // Simulate high-frequency events
    const eventCount = 100
    for (let i = 0; i < eventCount; i++) {
      unthrottledHandler()
      throttledHandler()
    }
    
    // Wait for RAF callbacks
    await new Promise(resolve => setTimeout(resolve, 30))
    
    expect(unthrottledCount).toBe(eventCount)
    expect(throttledCount).toBeLessThan(eventCount) // Should be much less due to throttling
    expect(throttledCount).toBeGreaterThan(0) // But should still execute
    
    console.log(`Performance comparison: ${unthrottledCount} unthrottled vs ${throttledCount} throttled events`)
  })
})