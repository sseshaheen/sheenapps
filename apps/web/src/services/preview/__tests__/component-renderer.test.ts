import { describe, test, expect } from 'vitest'
import { ComponentRenderer } from '../component-renderer'

describe('ComponentRenderer - Undo/Redo Button Generation', () => {
  describe('Button ID generation', () => {
    test('generates correct button IDs from component type and ID', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test Content</div>',
        'hero',
        'hero-luxury-premium-hero-color-scheme'
      )
      
      // Check undo button ID
      expect(html).toContain('id="undo-hero-hero-luxury-premium-hero-color-scheme"')
      
      // Check redo button ID
      expect(html).toContain('id="redo-hero-hero-luxury-premium-hero-color-scheme"')
    })

    test('handles simple component IDs correctly', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test</div>',
        'features',
        'features'
      )
      
      expect(html).toContain('id="undo-features-features"')
      expect(html).toContain('id="redo-features-features"')
    })

    test('preserves dynamic component IDs for button matching', () => {
      // Test various ID patterns we've seen
      const testCases = [
        { type: 'hero', id: 'hero-ai-generated' },
        { type: 'features', id: 'features-luxury' },
        { type: 'testimonials', id: 'testimonials-config-based' },
      ]
      
      testCases.forEach(({ type, id }) => {
        const html = ComponentRenderer.wrapWithEditControls('<div>Test</div>', type, id)
        expect(html).toContain(`id="undo-${type}-${id}"`)
        expect(html).toContain(`id="redo-${type}-${id}"`)
      })
    })
  })

  describe('Button visibility and persistence', () => {
    test('buttons have data-keep-visible attribute handling', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test</div>',
        'hero',
        'hero-123'
      )
      
      // Check onmouseout respects data-keep-visible
      expect(html).toContain('if (!controls.getAttribute(\'data-keep-visible\'))')
      
      // Check onclick sets data-keep-visible
      expect(html).toContain('controls.setAttribute(\'data-keep-visible\', \'true\')')
    })

    test('buttons have 3-second auto-hide after click', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test</div>',
        'hero',
        'hero-123'
      )
      
      // Check setTimeout for removing data-keep-visible
      expect(html).toContain('setTimeout(() => {')
      expect(html).toContain('controls.removeAttribute(\'data-keep-visible\')')
      expect(html).toContain('}, 3000)')
    })

    test('section controls have proper initial state', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test</div>',
        'hero',
        'hero-123'
      )
      
      // Controls initially hidden
      expect(html).toContain('opacity: 0;')
      
      // Undo/redo buttons initially display: none
      expect(html).toMatch(/undo-button[\s\S]*?display: none;/)
      expect(html).toMatch(/redo-button[\s\S]*?display: none;/)
    })
  })

  describe('Button styling', () => {
    test('undo button has correct styling', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test</div>',
        'hero',
        'hero-123'
      )
      
      // Orange background for undo
      expect(html).toContain('background: rgba(251, 146, 60, 0.9)')
      
      // Undo icon
      expect(html).toContain('⟲')
      expect(html).toContain('Undo')
    })

    test('redo button has correct styling', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test</div>',
        'hero',
        'hero-123'
      )
      
      // Green background for redo
      expect(html).toContain('background: rgba(34, 197, 94, 0.9)')
      
      // Redo icon
      expect(html).toContain('⟳')
      expect(html).toContain('Redo')
    })
  })

  describe('Event handlers', () => {
    test('undo button calls correct window function', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test</div>',
        'hero',
        'hero-123'
      )
      
      expect(html).toContain('window.undoSection(\'hero\', \'hero-123\', \'Hero\')')
    })

    test('redo button calls correct window function', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test</div>',
        'features',
        'features-456'
      )
      
      expect(html).toContain('window.redoSection(\'features\', \'features-456\', \'Features\')')
    })

    test('section name is properly capitalized', () => {
      const testCases = [
        { type: 'hero', expected: 'Hero' },
        { type: 'features', expected: 'Features' },
        { type: 'testimonials', expected: 'Testimonials' },
      ]
      
      testCases.forEach(({ type, expected }) => {
        const html = ComponentRenderer.wrapWithEditControls('<div>Test</div>', type, 'test-id')
        expect(html).toContain(`data-section-name="${expected}"`)
        expect(html).toContain(`window.editSection('${type}', 'test-id', '${expected}')`)
      })
    })
  })

  describe('Container structure', () => {
    test('wraps content with proper editable container', () => {
      const content = '<div class="test-content">Original Content</div>'
      const html = ComponentRenderer.wrapWithEditControls(content, 'hero', 'hero-123')
      
      // Has editable-section class
      expect(html).toContain('class="editable-section"')
      
      // Has data attributes
      expect(html).toContain('data-section-type="hero"')
      expect(html).toContain('data-section-id="hero-123"')
      expect(html).toContain('data-section-name="Hero"')
      
      // Contains original content
      expect(html).toContain(content)
      
      // Has section controls
      expect(html).toContain('class="section-controls"')
    })

    test('hover effects work on container', () => {
      const html = ComponentRenderer.wrapWithEditControls(
        '<div>Test</div>',
        'hero',
        'hero-123'
      )
      
      // Mouseover shows purple outline and controls
      expect(html).toContain('onmouseover="this.style.outline=\'2px solid rgba(147, 51, 234, 0.5)\'')
      expect(html).toContain('this.querySelector(\'.section-controls\').style.opacity=\'1\'')
      
      // Mouseout hides if not kept visible
      expect(html).toContain('onmouseout=')
      expect(html).toContain('controls.style.opacity=\'0\'')
    })
  })
})