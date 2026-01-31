/**
 * Event System Integration Test
 * Validates that the event-driven architecture is working properly
 */

import { events } from '@/utils/event-logger'
import { FEATURE_FLAGS } from '@/config/feature-flags'

describe('Event System Integration', () => {
  beforeEach(() => {
    // Clear any existing listeners
    events.all.clear()
  })

  it('should emit and receive events when system is enabled', () => {
    if (!FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) {
      console.log('Event system disabled, skipping test')
      return
    }

    let receivedEvent = false
    let eventData: any = null

    // Listen for test event
    events.on('store:action', (data) => {
      receivedEvent = true
      eventData = data
    })

    // Emit test event
    events.emit('store:action', {
      type: 'test',
      payload: { message: 'Hello World' },
      timestamp: Date.now()
    })

    expect(receivedEvent).toBe(true)
    expect(eventData.type).toBe('test')
    expect(eventData.payload.message).toBe('Hello World')
  })

  it('should handle events safely when system is disabled', () => {
    if (FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) {
      console.log('Event system enabled, skipping disabled test')
      return
    }

    // This should not throw even when disabled
    expect(() => {
      events.emit('store:action', {
        type: 'test',
        payload: {},
        timestamp: Date.now()
      })
    }).not.toThrow()

    // Listeners should also work safely
    expect(() => {
      events.on('store:action', () => {})
    }).not.toThrow()
  })

  it('should emit section edit events', () => {
    if (!FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) return

    let sectionEditReceived = false
    let editData: any = null

    events.on('section:edited', (data) => {
      sectionEditReceived = true
      editData = data
    })

    events.emit('section:edited', {
      sectionId: 'hero-1',
      content: { html: '<h1>Test</h1>', props: {} },
      userAction: 'manual_edit'
    })

    expect(sectionEditReceived).toBe(true)
    expect(editData.sectionId).toBe('hero-1')
    expect(editData.userAction).toBe('manual_edit')
  })

  it('should emit history events', () => {
    if (!FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) return

    let historyEventReceived = false

    events.on('history:section_agnostic_edit', (data) => {
      historyEventReceived = true
    })

    events.emit('history:section_agnostic_edit', {
      operationType: 'undo',
      sectionType: 'hero'
    })

    expect(historyEventReceived).toBe(true)
  })

  it('should emit snapshot events', () => {
    if (!FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) return

    let snapshotEventReceived = false

    events.on('snapshot:created', (data) => {
      snapshotEventReceived = true
    })

    events.emit('snapshot:created', {
      snapshotId: 'snap_123',
      sizeEstimate: 1024
    })

    expect(snapshotEventReceived).toBe(true)
  })
})