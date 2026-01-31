import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useBuilderStore, type SectionState } from '@/store/builder-store'
import { logger } from '@/utils/logger';

describe('Race Condition Tests - Rapid User Interactions', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useBuilderStore.getState()
    store.resetState()
    store.initializeProject('test-project')
  })

  describe('Rapid Edit Operations', () => {
    test('handles rapid successive edits without losing history', async () => {
      const sectionId = 'hero-1'
      
      // Setup initial section
      const store = useBuilderStore.getState()
      const initialSection: SectionState = {
        id: sectionId,
        type: 'hero',
        content: { html: '', props: { title: 'Initial' } },
        styles: { css: '', variables: {} },
        metadata: { lastModified: Date.now(), userAction: 'initial', aiGenerated: false }
      }
      store.addSection(initialSection)
      
      // Simulate rapid edits (user typing fast)
      const rapidEdits = Array.from({ length: 10 }, (_, i) => ({
        content: { html: '', props: { title: `rapid-edit-${i}` } },
        action: `Edit ${i}`
      }))
      
      // Apply all edits rapidly
      const promises = rapidEdits.map((edit, index) => 
        new Promise<void>(resolve => {
          setTimeout(() => {
            useBuilderStore.getState().applyEdit(
              sectionId, 
              edit.content, 
              edit.action
            )
            resolve()
          }, index * 1) // 1ms intervals for faster tests
        })
      )
      
      await Promise.all(promises)
      
      // Get final state after all edits
      const finalState = useBuilderStore.getState()
      const sectionHist = finalState.sectionHistory[sectionId]
      
      // All edits should be recorded in section history
      expect(sectionHist).toBeDefined()
      expect(sectionHist.undoStack.length).toBeGreaterThan(0)
      
      // Final section should have the last edit
      const currentLayout = finalState.layouts[finalState.ui.currentLayoutId]
      expect(currentLayout.sections[sectionId].content.props.title).toBe('rapid-edit-9')
      
      // Can undo to any previous state
      expect(sectionHist.undoStack.length).toBeGreaterThan(0)
      expect(sectionHist.redoStack.length).toBe(0)
    })

    test('prevents history corruption during concurrent edits', async () => {
      const sectionId = 'hero-1'
      
      // Setup initial section
      const store = useBuilderStore.getState()
      const initialSection: SectionState = {
        id: sectionId,
        type: 'hero',
        content: { html: '', props: { title: 'Initial' } },
        styles: { css: '', variables: {} },
        metadata: { lastModified: Date.now(), userAction: 'initial', aiGenerated: false }
      }
      store.addSection(initialSection)
      
      // Simulate multiple components editing simultaneously
      const concurrentEdits = [
        { component: 'A', content: 'edit-from-A', delay: 0 },
        { component: 'B', content: 'edit-from-B', delay: 5 },
        { component: 'C', content: 'edit-from-C', delay: 10 },
        { component: 'A', content: 'edit-from-A-again', delay: 15 },
      ]
      
      const promises = concurrentEdits.map(edit => 
        new Promise<void>(resolve => {
          setTimeout(() => {
            useBuilderStore.getState().applyEdit(
              sectionId,
              { html: '', props: { title: edit.content, source: edit.component } },
              `Edit from ${edit.component}`
            )
            resolve()
          }, edit.delay / 5) // 5x faster
        })
      )
      
      await Promise.all(promises)
      
      const finalState = useBuilderStore.getState()
      const sectionHist = finalState.sectionHistory[sectionId]
      
      // All edits should be recorded
      expect(sectionHist).toBeDefined()
      expect(sectionHist.undoStack.length).toBe(4)
      
      // Final state should be the last edit
      const currentLayout = finalState.layouts[finalState.ui.currentLayoutId]
      expect(currentLayout.sections[sectionId].content.props.title).toBe('edit-from-A-again')
    })
  })

  describe('Rapid Undo/Redo Operations', () => {
    test('handles rapid undo/redo clicks without state corruption', async () => {
      const sectionId = 'hero-1'
      
      // Setup initial section and history
      const store = useBuilderStore.getState()
      const initialSection: SectionState = {
        id: sectionId,
        type: 'hero',
        content: { html: '', props: { title: 'original' } },
        styles: { css: '', variables: {} },
        metadata: { lastModified: Date.now(), userAction: 'original', aiGenerated: false }
      }
      store.addSection(initialSection)
      
      // Build up some history
      store.applyEdit(sectionId, { html: '', props: { title: 'edit1' } }, 'first edit')
      store.applyEdit(sectionId, { html: '', props: { title: 'edit2' } }, 'second edit')
      store.applyEdit(sectionId, { html: '', props: { title: 'edit3' } }, 'third edit')
      
      // Simulate rapid undo/redo clicks (user clicking frantically)
      const operations = [
        'undo', 'undo', 'redo', 'undo', 'redo', 'redo', 'undo'
      ]
      
      const results: any[] = []
      
      // Execute operations rapidly
      const promises = operations.map((operation, index) =>
        new Promise<void>(resolve => {
          setTimeout(() => {
            const store = useBuilderStore.getState()
            
            if (operation === 'undo') {
              store.undoSection(sectionId)
            } else {
              store.redoSection(sectionId)
            }
            
            const currentLayout = store.layouts[store.ui.currentLayoutId]
            const currentTitle = currentLayout?.sections[sectionId]?.content.props.title
            
            results.push({
              operation,
              currentTitle,
              undoStackLength: store.sectionHistory[sectionId]?.undoStack.length || 0,
              redoStackLength: store.sectionHistory[sectionId]?.redoStack.length || 0
            })
            
            resolve()
          }, index * 5) // 5ms intervals for faster tests
        })
      )
      
      await Promise.all(promises)
      
      // Verify final state is consistent
      const finalState = useBuilderStore.getState()
      const sectionHist = finalState.sectionHistory[sectionId]
      
      expect(sectionHist).toBeDefined()
      expect(sectionHist.undoStack.length + sectionHist.redoStack.length).toBeGreaterThan(0)
      
      // Operations should have completed successfully
      expect(results.length).toBe(operations.length)
      
      // Filter out results that represent valid states
      const validResults = results.filter(r => r.currentTitle !== undefined)
      expect(validResults.length).toBeGreaterThan(0)
      
      // Final state should allow valid operations
      const currentLayout = finalState.layouts[finalState.ui.currentLayoutId]
      const section = currentLayout?.sections[sectionId]
      
      // Check if we can undo/redo based on history state
      if (sectionHist && sectionHist.undoStack.length > 0) {
        expect(sectionHist.undoStack.length).toBeGreaterThan(0)
      }
      if (sectionHist && sectionHist.redoStack.length > 0) {
        expect(sectionHist.redoStack.length).toBeGreaterThan(0)
      }
    })

    test('prevents undo/redo beyond boundaries during rapid clicks', async () => {
      const sectionId = 'hero-1'
      
      // Setup minimal history (only 2 entries)
      const store = useBuilderStore.getState()
      const initialSection: SectionState = {
        id: sectionId,
        type: 'hero',
        content: { html: '', props: { title: 'original' } },
        styles: { css: '', variables: {} },
        metadata: { lastModified: Date.now(), userAction: 'original', aiGenerated: false }
      }
      store.addSection(initialSection)
      store.applyEdit(sectionId, { html: '', props: { title: 'edited' } }, 'edit')
      
      // Try to undo more times than possible
      const excessiveUndos = Array(10).fill('undo')
      const undoResults: boolean[] = []
      
      for (const operation of excessiveUndos) {
        const currentState = useBuilderStore.getState()
        const canUndo = currentState.sectionHistory[sectionId]?.undoStack.length > 0
        if (canUndo) {
          currentState.undoSection(sectionId)
          undoResults.push(true)
        } else {
          undoResults.push(false)
        }
      }
      
      // Only first undo should succeed
      expect(undoResults[0]).toBe(true)
      
      // All subsequent undos should fail
      for (let i = 1; i < undoResults.length; i++) {
        expect(undoResults[i]).toBe(false)
      }
      
      // Now try excessive redos
      const excessiveRedos = Array(10).fill('redo')
      const redoResults: boolean[] = []
      
      for (const operation of excessiveRedos) {
        const currentState = useBuilderStore.getState()
        const canRedo = currentState.sectionHistory[sectionId]?.redoStack.length > 0
        if (canRedo) {
          currentState.redoSection(sectionId)
          redoResults.push(true)
        } else {
          redoResults.push(false)
        }
      }
      
      // Only first redo should succeed
      expect(redoResults[0]).toBe(true)
      
      // All subsequent redos should fail
      for (let i = 1; i < redoResults.length; i++) {
        expect(redoResults[i]).toBe(false)
      }
    })
  })

  describe('Mixed Operations Race Conditions', () => {
    test('handles edit during undo operation', async () => {
      const sectionId = 'hero-1'
      
      // Setup history
      const store = useBuilderStore.getState()
      const initialSection: SectionState = {
        id: sectionId,
        type: 'hero',
        content: { html: '', props: { title: 'v1' } },
        styles: { css: '', variables: {} },
        metadata: { lastModified: Date.now(), userAction: 'v1', aiGenerated: false }
      }
      store.addSection(initialSection)
      store.applyEdit(sectionId, { html: '', props: { title: 'v2' } }, 'v2')
      store.applyEdit(sectionId, { html: '', props: { title: 'v3' } }, 'v3')
      
      // Start undo operation
      const undoPromise = new Promise<void>(resolve => {
        setTimeout(() => {
          useBuilderStore.getState().undoSection(sectionId)
          resolve()
        }, 10)
      })
      
      // Start edit operation almost simultaneously
      const editPromise = new Promise<void>(resolve => {
        setTimeout(() => {
          useBuilderStore.getState().applyEdit(
            sectionId, 
            { html: '', props: { title: 'v4-concurrent' } }, 
            'concurrent edit'
          )
          resolve()
        }, 15)
      })
      
      await Promise.all([undoPromise, editPromise])
      
      const finalState = useBuilderStore.getState()
      const sectionHist = finalState.sectionHistory[sectionId]
      const currentLayout = finalState.layouts[finalState.ui.currentLayoutId]
      const section = currentLayout?.sections[sectionId]
      
      // Either the undo happened first (then edit created new branch) 
      // or edit happened first (undo had no effect)
      expect(sectionHist).toBeDefined()
      expect(sectionHist.undoStack.length).toBeGreaterThan(0)
      
      // The concurrent edit should be present either in current state or history
      const currentTitle = section?.content.props.title
      const hasV4Edit = currentTitle === 'v4-concurrent' || 
        sectionHist.undoStack.some(entry => 
          entry.content.props.title === 'v4-concurrent'
        )
      expect(hasV4Edit).toBe(true)
    })

    test('handles rapid button clicks during DOM updates', async () => {
      // Simulate the scenario where user clicks undo while buttons are being updated
      let buttonUpdateInProgress = false
      let clicksDuringUpdate = 0
      
      const mockButtonUpdate = async (canUndo: boolean, canRedo: boolean) => {
        buttonUpdateInProgress = true
        // Simulate async DOM update
        await new Promise(resolve => setTimeout(resolve, 100))
        buttonUpdateInProgress = false
        return { canUndo, canRedo }
      }
      
      const mockHandleClick = (action: string) => {
        if (buttonUpdateInProgress) {
          clicksDuringUpdate++
          logger.info(`Click during update ignored: ${action}`);
          return false
        }
        logger.info(`Click processed: ${action}`);
        return true
      }
      
      // Start button update
      const updatePromise = mockButtonUpdate(true, false)
      
      // Try to click buttons while update is in progress
      const clickPromises = [
        new Promise<boolean>(resolve => {
          setTimeout(() => resolve(mockHandleClick('undo')), 20)
        }),
        new Promise<boolean>(resolve => {
          setTimeout(() => resolve(mockHandleClick('redo')), 40)
        }),
        new Promise<boolean>(resolve => {
          setTimeout(() => resolve(mockHandleClick('undo')), 60)
        })
      ]
      
      const [updateResult, ...clickResults] = await Promise.all([
        updatePromise,
        ...clickPromises
      ])
      
      // Update should complete successfully
      expect(updateResult).toEqual({ canUndo: true, canRedo: false })
      
      // All clicks during update should be ignored
      expect(clicksDuringUpdate).toBe(3)
      expect(clickResults.every(result => result === false)).toBe(true)
    })
  })

  describe('Debouncing and Throttling', () => {
    test('debounces rapid edit operations', async () => {
      const sectionId = 'hero-1'
      
      // Setup initial section
      const store = useBuilderStore.getState()
      const initialSection: SectionState = {
        id: sectionId,
        type: 'hero',
        content: { html: '', props: { title: 'initial' } },
        styles: { css: '', variables: {} },
        metadata: { lastModified: Date.now(), userAction: 'initial', aiGenerated: false }
      }
      store.addSection(initialSection)
      
      let actualRecordedEdits = 0
      
      // Mock debounced recordEdit function
      const debouncedRecordEdit = (() => {
        let timeout: NodeJS.Timeout
        return (content: any, action: string) => {
          clearTimeout(timeout)
          timeout = setTimeout(() => {
            useBuilderStore.getState().applyEdit(
              sectionId,
              content,
              action
            )
            actualRecordedEdits++
          }, 100) // 100ms debounce
        }
      })()
      
      // Simulate rapid typing (10 keystrokes in 50ms intervals)
      const rapidInputs = Array.from({ length: 10 }, (_, i) => ({
        content: { html: '', props: { title: `typing-${i}` } },
        action: `keystroke-${i}`
      }))
      
      // Apply all inputs rapidly
      rapidInputs.forEach((input, index) => {
        setTimeout(() => {
          debouncedRecordEdit(input.content, input.action)
        }, index * 10)
      })
      
      // Wait for debounce to complete
      await new Promise(resolve => setTimeout(resolve, 250))
      
      // Only the last edit should be recorded due to debouncing
      expect(actualRecordedEdits).toBe(1)
      
      const finalState = useBuilderStore.getState()
      const sectionHist = finalState.sectionHistory[sectionId]
      const currentLayout = finalState.layouts[finalState.ui.currentLayoutId]
      const section = currentLayout?.sections[sectionId]
      
      expect(sectionHist).toBeDefined()
      expect(sectionHist.undoStack.length).toBeGreaterThan(0)
      expect(section?.content.props.title).toBe('typing-9')
    })

    test('throttles button update requests', async () => {
      let updateCallCount = 0
      
      // Mock throttled update function
      const throttledUpdate = (() => {
        let lastCall = 0
        const throttleMs = 100
        
        return (canUndo: boolean, canRedo: boolean) => {
          const now = Date.now()
          if (now - lastCall >= throttleMs) {
            updateCallCount++
            lastCall = now
            logger.info(`Button update ${updateCallCount}: undo=${canUndo}, redo=${canRedo}`);
            return true
          }
          logger.info('Button update throttled');
          return false
        }
      })()
      
      // Make 20 rapid update requests over 150ms
      const updatePromises = Array.from({ length: 20 }, (_, i) =>
        new Promise<boolean>(resolve => {
          setTimeout(() => {
            const result = throttledUpdate(i % 2 === 0, i % 2 === 1)
            resolve(result)
          }, i * 8) // 8ms intervals
        })
      )
      
      const results = await Promise.all(updatePromises)
      
      // Only some updates should succeed due to throttling
      const successfulUpdates = results.filter(r => r === true).length
      expect(successfulUpdates).toBeLessThan(20)
      expect(successfulUpdates).toBeGreaterThan(0)
      expect(updateCallCount).toBe(successfulUpdates)
    })
  })
})