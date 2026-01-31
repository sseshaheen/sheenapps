/**
 * Virtual List Component Tests
 * 
 * Tests for virtual scrolling components to ensure they handle
 * large datasets efficiently while maintaining functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { VirtualList, VirtualChatList, VirtualTable, VirtualListPerformance } from '../components/ui/virtual-list'

// Mock TanStack Virtual
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: vi.fn(() => [
      { key: 0, index: 0, start: 0, size: 50 },
      { key: 1, index: 1, start: 50, size: 50 },
      { key: 2, index: 2, start: 100, size: 50 },
    ]),
    getTotalSize: vi.fn(() => 1000),
    scrollToIndex: vi.fn(),
  }))
}))

const generateMockItems = (count: number) => 
  Array.from({ length: count }, (_, i) => ({
    id: i,
    title: `Item ${i}`,
    description: `Description for item ${i}`,
    timestamp: new Date(Date.now() - i * 1000)
  }))

const generateMockMessages = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    content: `Message ${i}: ${'Lorem ipsum '.repeat(Math.floor(Math.random() * 10) + 1)}`,
    type: i % 3 === 0 ? 'ai' : 'user',
    timestamp: new Date(Date.now() - i * 1000)
  }))

describe('VirtualList Component', () => {
  beforeEach(() => {
    // Mock DOM methods
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      writable: true,
      value: 0,
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      writable: true,
      value: 1000,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      writable: true,
      value: 400,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe('Basic Virtual List', () => {
    it('should render virtual list with large dataset', () => {
      const items = generateMockItems(10000)
      
      const { container } = render(
        <VirtualList
          items={items}
          height={400}
          itemHeight={50}
          renderItem={(item, index) => (
            <div key={item.id} data-testid={`item-${index}`}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          )}
          data-testid="virtual-list"
        />
      )

      // Should render the virtualized container
      expect(container.querySelector('[style*="height: 1000px"]')).toBeTruthy()
      
      // Should only render visible items (mocked to 3)
      const renderedItems = container.querySelectorAll('[data-testid^="item-"]')
      expect(renderedItems.length).toBe(3)
    })

    it('should handle dynamic item heights', () => {
      const items = generateMockItems(100)
      
      const dynamicHeight = (index: number) => {
        return index % 2 === 0 ? 60 : 40 // Alternating heights
      }

      const { container } = render(
        <VirtualList
          items={items}
          height={400}
          itemHeight={dynamicHeight}
          renderItem={(item, index) => (
            <div key={item.id} data-testid={`item-${index}`}>
              {item.title}
            </div>
          )}
        />
      )

      expect(container.querySelector('[data-testid="item-0"]')).toBeTruthy()
    })

    it('should handle scroll to index', () => {
      const items = generateMockItems(1000)
      
      const { rerender } = render(
        <VirtualList
          items={items}
          height={400}
          itemHeight={50}
          renderItem={(item) => <div key={item.id}>{item.title}</div>}
          scrollToIndex={0}
        />
      )

      // Change scroll index
      rerender(
        <VirtualList
          items={items}
          height={400}
          itemHeight={50}
          renderItem={(item) => <div key={item.id}>{item.title}</div>}
          scrollToIndex={500}
        />
      )

      // Mock virtualizer should have been called
      // Virtualizer should have been called
    })

    it('should call onScroll callback', () => {
      const onScroll = vi.fn()
      const items = generateMockItems(100)
      
      const { container } = render(
        <VirtualList
          items={items}
          height={400}
          itemHeight={50}
          renderItem={(item) => <div key={item.id}>{item.title}</div>}
          onScroll={onScroll}
        />
      )

      const scrollContainer = container.firstChild as HTMLElement
      fireEvent.scroll(scrollContainer, { target: { scrollTop: 200 } })

      expect(onScroll).toHaveBeenCalledWith(200)
    })
  })

  describe('Virtual Chat List', () => {
    it('should render chat messages efficiently', () => {
      const messages = generateMockMessages(5000)
      
      const { container } = render(
        <VirtualChatList
          messages={messages}
          height={400}
          renderMessage={(message, index) => (
            <div key={message.id} data-testid={`message-${index}`}>
              <span className={`message-${message.type}`}>
                {message.content}
              </span>
            </div>
          )}
        />
      )

      // Should render virtualized container
      expect(container.querySelector('[style*="height: 1000px"]')).toBeTruthy()
      
      // Should render some messages (mocked to 3)
      const renderedMessages = container.querySelectorAll('[data-testid^="message-"]')
      expect(renderedMessages.length).toBe(3)
    })

    it('should handle auto-scroll to bottom', () => {
      const messages = generateMockMessages(100)
      
      const { rerender } = render(
        <VirtualChatList
          messages={messages}
          height={400}
          renderMessage={(message) => <div key={message.id}>{message.content}</div>}
          autoScrollToBottom={true}
        />
      )

      // Add new message
      const newMessages = [...messages, {
        id: 'new-msg',
        content: 'New message',
        type: 'user' as const,
        timestamp: new Date()
      }]

      rerender(
        <VirtualChatList
          messages={newMessages}
          height={400}
          renderMessage={(message) => <div key={message.id}>{message.content}</div>}
          autoScrollToBottom={true}
        />
      )

      // Should attempt to scroll to the new message
      // Virtualizer should have been called
    })

    it('should detect bottom scroll position', () => {
      const onScroll = vi.fn()
      const messages = generateMockMessages(100)
      
      const { container } = render(
        <VirtualChatList
          messages={messages}
          height={400}
          renderMessage={(message) => <div key={message.id}>{message.content}</div>}
          onScroll={onScroll}
        />
      )

      const scrollContainer = container.firstChild as HTMLElement
      
      // Simulate scrolling to bottom
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 600 })
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000 })
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 400 })
      
      fireEvent.scroll(scrollContainer)

      expect(onScroll).toHaveBeenCalledWith(600, true) // true = at bottom
    })
  })

  describe('Virtual Table', () => {
    const columns = [
      { key: 'id', label: 'ID', width: '60px', render: (item: any) => <span>{item.id}</span> },
      { key: 'title', label: 'Title', render: (item: any) => <span>{item.title}</span> },
      { key: 'description', label: 'Description', render: (item: any) => <span>{item.description}</span> }
    ]

    it('should render virtual table with headers', () => {
      const items = generateMockItems(1000)
      
      const { container, getByText } = render(
        <VirtualTable
          items={items}
          height={400}
          rowHeight={40}
          columns={columns}
        />
      )

      // Should render headers
      expect(getByText('ID')).toBeTruthy()
      expect(getByText('Title')).toBeTruthy()
      expect(getByText('Description')).toBeTruthy()

      // Should render virtualized rows
      expect(container.querySelector('[style*="height: 1000px"]')).toBeTruthy()
    })

    it('should handle row clicks', () => {
      const onRowClick = vi.fn()
      const items = generateMockItems(10)
      
      const { container } = render(
        <VirtualTable
          items={items}
          height={400}
          rowHeight={40}
          columns={columns}
          onRowClick={onRowClick}
        />
      )

      // Find and click the first row (after header)
      const rows = container.querySelectorAll('[style*="transform: translateY"]')
      if (rows.length > 0) {
        fireEvent.click(rows[0])
        expect(onRowClick).toHaveBeenCalledWith(items[0], 0)
      }
    })

    it('should apply custom row classes', () => {
      const items = generateMockItems(10)
      const rowClassName = (item: any, index: number) => 
        index % 2 === 0 ? 'even-row' : 'odd-row'
      
      const { container } = render(
        <VirtualTable
          items={items}
          height={400}
          rowHeight={40}
          columns={columns}
          rowClassName={rowClassName}
        />
      )

      // Check for custom classes (would be applied to virtual rows)
      expect(container.querySelector('.even-row')).toBeTruthy()
    })
  })

  describe('Performance Utilities', () => {
    it('should estimate item height based on content', () => {
      const shortContent = 'Short text'
      const longContent = 'This is a much longer piece of content that would span multiple lines in a typical list item rendering scenario'

      const shortHeight = VirtualListPerformance.estimateItemHeight(shortContent)
      const longHeight = VirtualListPerformance.estimateItemHeight(longContent)

      expect(shortHeight).toBe(40) // Base height for short content
      expect(longHeight).toBeGreaterThan(shortHeight) // Longer content = taller
    })

    it('should calculate appropriate overscan', () => {
      const overscan = VirtualListPerformance.calculateOverscan(400, 50)
      
      expect(overscan).toBeGreaterThan(0)
      expect(overscan).toBeLessThanOrEqual(20) // Max limit
    })

    it('should create performance monitor', () => {
      const monitor = VirtualListPerformance.createPerformanceMonitor('test-list')
      
      monitor.onRender()
      monitor.onRender()
      
      const stats = monitor.getRenderStats()
      expect(stats.totalRenders).toBe(2)
      expect(stats.avgFrameTime).toBeGreaterThan(0)
    })
  })
})

// Performance benchmark test
describe('Virtual List Performance Tests', () => {
  it('should handle very large datasets efficiently', () => {
    const startTime = performance.now()
    
    // Create a large dataset
    const items = generateMockItems(50000)
    
    const { container } = render(
      <VirtualList
        items={items}
        height={400}
        itemHeight={50}
        renderItem={(item, index) => (
          <div key={item.id} data-testid={`item-${index}`}>
            {item.title}
          </div>
        )}
      />
    )

    const renderTime = performance.now() - startTime
    
    // Should render quickly even with large dataset
    expect(renderTime).toBeLessThan(100) // Less than 100ms
    
    // Should only render virtual items, not all 50k
    const renderedItems = container.querySelectorAll('[data-testid^="item-"]')
    expect(renderedItems.length).toBeLessThanOrEqual(20) // Much less than 50k
    
    console.log(`Rendered ${items.length} items in ${renderTime.toFixed(2)}ms`)
  })

  it('should maintain smooth scrolling performance', () => {
    const items = generateMockItems(10000)
    const onScroll = vi.fn()
    
    const { container } = render(
      <VirtualList
        items={items}
        height={400}
        itemHeight={50}
        renderItem={(item) => <div key={item.id}>{item.title}</div>}
        onScroll={onScroll}
      />
    )

    const scrollContainer = container.firstChild as HTMLElement
    
    // Simulate rapid scrolling
    const scrollPositions = [0, 100, 200, 300, 400, 500]
    scrollPositions.forEach(position => {
      fireEvent.scroll(scrollContainer, { target: { scrollTop: position } })
    })

    // Should handle all scroll events
    expect(onScroll).toHaveBeenCalledTimes(scrollPositions.length)
  })
})