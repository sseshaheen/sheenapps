import { describe, test, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { RTL_LOCALES, isRTL, withRTLLocales, renderWithI18n } from '../../utils/localization'

// Mock component that uses RTL-sensitive styling
const RTLTestComponent = ({ locale }: { locale: string }) => {
  const dir = isRTL(locale) ? 'rtl' : 'ltr'
  
  return (
    <div dir={dir} data-testid="rtl-container">
      <div 
        style={{
          marginLeft: dir === 'ltr' ? '20px' : '0',
          marginRight: dir === 'rtl' ? '20px' : '0',
          paddingInlineStart: '10px',
          paddingInlineEnd: '15px'
        }}
        data-testid="rtl-spacing"
      >
        <button 
          style={{
            float: dir === 'ltr' ? 'right' : 'left'
          }}
          data-testid="rtl-button"
        >
          Action
        </button>
        <div 
          style={{
            textAlign: dir === 'rtl' ? 'right' : 'left'
          }}
          data-testid="rtl-text"
        >
          Text content
        </div>
      </div>
    </div>
  )
}

describe('RTL Rendering', () => {
  describe('RTL Detection', () => {
    test('should correctly identify RTL locales', () => {
      expect(isRTL('ar')).toBe(true)
      expect(isRTL('ar-eg')).toBe(true)
      expect(isRTL('ar-sa')).toBe(true)
      expect(isRTL('ar-ae')).toBe(true)
      
      expect(isRTL('en')).toBe(false)
      expect(isRTL('fr')).toBe(false)
      expect(isRTL('es')).toBe(false)
      expect(isRTL('de')).toBe(false)
      expect(isRTL('fr-ma')).toBe(false)
    })
  })

  describe('RTL Layout', () => {
    withRTLLocales('should apply correct dir attribute', (locale) => {
      renderWithI18n(<RTLTestComponent locale={locale} />, { locale })
      
      const container = screen.getByTestId('rtl-container')
      expect(container).toHaveAttribute('dir', 'rtl')
    })

    withRTLLocales('should apply RTL-specific styles', (locale) => {
      renderWithI18n(<RTLTestComponent locale={locale} />, { locale })
      
      const spacingElement = screen.getByTestId('rtl-spacing')
      const styles = window.getComputedStyle(spacingElement)
      
      // In RTL, margins should be flipped
      expect(styles.marginLeft).toBe('0px')
      expect(styles.marginRight).toBe('20px')
    })

    withRTLLocales('should float elements correctly', (locale) => {
      renderWithI18n(<RTLTestComponent locale={locale} />, { locale })
      
      const button = screen.getByTestId('rtl-button')
      const styles = window.getComputedStyle(button)
      
      expect(styles.float).toBe('left') // Flipped in RTL
    })

    withRTLLocales('should align text correctly', (locale) => {
      renderWithI18n(<RTLTestComponent locale={locale} />, { locale })
      
      const textElement = screen.getByTestId('rtl-text')
      const styles = window.getComputedStyle(textElement)
      
      expect(styles.textAlign).toBe('right')
    })
  })

  describe('CSS Logical Properties', () => {
    test('should use logical properties for RTL support', () => {
      const Component = ({ locale }: { locale: string }) => (
        <div
          style={{
            paddingInlineStart: '10px',
            paddingInlineEnd: '20px',
            marginInlineStart: '5px',
            marginInlineEnd: '15px',
            borderInlineStart: '2px solid red',
            borderInlineEnd: '2px solid blue'
          }}
          data-testid="logical-props"
          dir={isRTL(locale) ? 'rtl' : 'ltr'}
        >
          Content
        </div>
      )

      // Test LTR
      const { rerender } = render(<Component locale="en" />)
      let element = screen.getByTestId('logical-props')
      let styles = window.getComputedStyle(element)
      
      expect(element).toHaveAttribute('dir', 'ltr')
      
      // Test RTL
      rerender(<Component locale="ar" />)
      element = screen.getByTestId('logical-props')
      styles = window.getComputedStyle(element)
      
      expect(element).toHaveAttribute('dir', 'rtl')
    })
  })

  describe('calc() Usage in RTL', () => {
    test('should handle calc() expressions correctly in RTL', () => {
      const Component = ({ locale }: { locale: string }) => {
        const dir = isRTL(locale) ? 'rtl' : 'ltr'
        return (
          <div
            style={{
              [dir === 'ltr' ? 'left' : 'right']: 'calc(100% - 50px)',
              [dir === 'ltr' ? 'paddingLeft' : 'paddingRight']: 'calc(1rem + 10px)',
              width: 'calc(100vw - 200px)'
            }}
            data-testid="calc-element"
            dir={dir}
          >
            Content
          </div>
        )
      }

      // Test Arabic (RTL)
      renderWithI18n(<Component locale="ar-eg" />, { locale: 'ar-eg' })
      const rtlElement = screen.getByTestId('calc-element')
      const rtlStyles = window.getComputedStyle(rtlElement)
      
      expect(rtlElement).toHaveAttribute('dir', 'rtl')
      expect(rtlStyles.right).toBe('calc(100% - 50px)')
      // Accept both orderings of calc() values
      expect(rtlStyles.paddingRight).toMatch(/calc\((1rem \+ 10px|10px \+ 1rem)\)/)
    })
  })

  describe('Form Elements in RTL', () => {
    withRTLLocales('should render form elements with correct alignment', (locale) => {
      const Form = () => (
        <form dir={isRTL(locale) ? 'rtl' : 'ltr'}>
          <label htmlFor="name" style={{ display: 'block', textAlign: isRTL(locale) ? 'right' : 'left' }}>
            الاسم
          </label>
          <input
            id="name"
            type="text"
            placeholder="أدخل اسمك"
            style={{ textAlign: isRTL(locale) ? 'right' : 'left' }}
            data-testid="rtl-input"
          />
          <select style={{ direction: isRTL(locale) ? 'rtl' : 'ltr' }} data-testid="rtl-select">
            <option>خيار 1</option>
            <option>خيار 2</option>
          </select>
        </form>
      )

      renderWithI18n(<Form />, { locale })
      
      const input = screen.getByTestId('rtl-input')
      const select = screen.getByTestId('rtl-select')
      
      expect(window.getComputedStyle(input).textAlign).toBe('right')
      expect(window.getComputedStyle(select).direction).toBe('rtl')
    })
  })

  describe('Icons and Images in RTL', () => {
    test('should flip directional icons in RTL', () => {
      const Icon = ({ locale, type }: { locale: string; type: string }) => {
        const shouldFlip = isRTL(locale) && ['arrow-right', 'arrow-left', 'chevron-right', 'chevron-left'].includes(type)
        
        return (
          <span
            style={{
              transform: shouldFlip ? 'scaleX(-1)' : 'none'
            }}
            data-testid={`icon-${type}`}
          >
            {type}
          </span>
        )
      }

      // Test arrow flipping in RTL
      renderWithI18n(<Icon locale="ar" type="arrow-right" />, { locale: 'ar' })
      const arrowIcon = screen.getByTestId('icon-arrow-right')
      expect(window.getComputedStyle(arrowIcon).transform).toBe('scaleX(-1)')

      // Test non-directional icon should not flip
      renderWithI18n(<Icon locale="ar" type="home" />, { locale: 'ar' })
      const homeIcon = screen.getByTestId('icon-home')
      expect(window.getComputedStyle(homeIcon).transform).toBe('none')
    })
  })

  describe('Grid and Flexbox in RTL', () => {
    test('should handle flex direction in RTL', () => {
      const FlexContainer = ({ locale }: { locale: string }) => (
        <div
          style={{
            display: 'flex',
            flexDirection: isRTL(locale) ? 'row-reverse' : 'row',
            gap: '10px'
          }}
          data-testid="flex-container"
        >
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
        </div>
      )

      renderWithI18n(<FlexContainer locale="ar-sa" />, { locale: 'ar-sa' })
      const container = screen.getByTestId('flex-container')
      expect(window.getComputedStyle(container).flexDirection).toBe('row-reverse')
    })

    test('should handle grid auto-flow in RTL', () => {
      const GridContainer = ({ locale }: { locale: string }) => (
        <div
          style={{
            display: 'grid',
            gridAutoFlow: isRTL(locale) ? 'column dense' : 'column',
            gridTemplateRows: 'repeat(3, 1fr)',
            direction: isRTL(locale) ? 'rtl' : 'ltr'
          }}
          data-testid="grid-container"
        >
          <div>Cell 1</div>
          <div>Cell 2</div>
          <div>Cell 3</div>
        </div>
      )

      renderWithI18n(<GridContainer locale="ar-ae" />, { locale: 'ar-ae' })
      const container = screen.getByTestId('grid-container')
      expect(window.getComputedStyle(container).direction).toBe('rtl')
    })
  })
})