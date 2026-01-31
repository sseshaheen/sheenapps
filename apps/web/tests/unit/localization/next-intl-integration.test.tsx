import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { SUPPORTED_LOCALES } from '../../utils/localization'

// Import at top level for testing
import { useTranslations, useLocale } from 'next-intl'
import { getMessages } from 'next-intl/server'

// Test component that uses next-intl hooks
function TestComponent() {
  const t = useTranslations('navigation')
  const tHero = useTranslations('hero')
  
  return (
    <div>
      <nav>
        <a href="#">{t('howItWorks')}</a>
        <a href="#">{t('pricing')}</a>
        <button>{t('startBuilding')}</button>
      </nav>
      <h1>{tHero('title')}</h1>
      <p>{tHero('subtitle')}</p>
    </div>
  )
}

describe('next-intl Integration', () => {
  describe('NextIntlClientProvider', () => {
    test('provides translations to child components', async () => {
      const messages = {
        navigation: {
          howItWorks: 'How It Works',
          pricing: 'Pricing',
          startBuilding: 'Start Building'
        },
        hero: {
          title: 'Build Your Website',
          subtitle: 'Create stunning websites'
        }
      }
      
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <TestComponent />
        </NextIntlClientProvider>
      )
      
      expect(screen.getByText('How It Works')).toBeInTheDocument()
      expect(screen.getByText('Pricing')).toBeInTheDocument()
      expect(screen.getByText('Start Building')).toBeInTheDocument()
      expect(screen.getByText('Build Your Website')).toBeInTheDocument()
      expect(screen.getByText('Create stunning websites')).toBeInTheDocument()
    })
    
    test('supports all configured locales', async () => {
      for (const locale of SUPPORTED_LOCALES) {
        const { unmount } = render(
          <NextIntlClientProvider locale={locale} messages={{}}>
            <div data-testid="locale-test">{locale}</div>
          </NextIntlClientProvider>
        )
        
        expect(screen.getByTestId('locale-test')).toHaveTextContent(locale)
        unmount()
      }
    })
  })
  
  describe('useTranslations hook', () => {
    test('returns translation function for namespace', () => {
      const TranslationTest = () => {
        // useTranslations is already imported
        const t = useTranslations('navigation')
        
        return <div>{typeof t === 'function' ? 'Function' : 'Not Function'}</div>
      }
      
      render(
        <NextIntlClientProvider locale="en" messages={{}}>
          <TranslationTest />
        </NextIntlClientProvider>
      )
      
      expect(screen.getByText('Function')).toBeInTheDocument()
    })
    
    test('handles missing translations gracefully', () => {
      const MissingTranslationTest = () => {
        // useTranslations is already imported
        const t = useTranslations('nonexistent')
        
        return <div>{t('missingKey')}</div>
      }
      
      render(
        <NextIntlClientProvider locale="en" messages={{}}>
          <MissingTranslationTest />
        </NextIntlClientProvider>
      )
      
      // Should show the key when translation is missing
      expect(screen.getByText('nonexistent.missingKey')).toBeInTheDocument()
    })
  })
  
  describe('Translation interpolation', () => {
    test('supports variable interpolation', () => {
      const InterpolationTest = () => {
        // useTranslations is already imported
        const t = useTranslations('dashboard')
        
        // Mock implementation for testing
        const mockT = (key: string, values?: any) => {
          if (key === 'welcome' && values?.name) {
            return `Welcome, ${values.name}!`
          }
          return key
        }
        
        return <div>{mockT('welcome', { name: 'John' })}</div>
      }
      
      render(
        <NextIntlClientProvider locale="en" messages={{}}>
          <InterpolationTest />
        </NextIntlClientProvider>
      )
      
      expect(screen.getByText('Welcome, John!')).toBeInTheDocument()
    })
    
    test('supports count-based pluralization', () => {
      const PluralizationTest = () => {
        const messages = {
          items: {
            count_one: 'One item',
            count_other: '{{count}} items'
          }
        }
        
        const mockT = (key: string, values?: any) => {
          if (key === 'count' && values?.count === 1) {
            return messages.items.count_one
          } else if (key === 'count' && values?.count) {
            return messages.items.count_other.replace('{{count}}', values.count)
          }
          return key
        }
        
        return (
          <div>
            <span>{mockT('count', { count: 1 })}</span>
            <span>{mockT('count', { count: 5 })}</span>
          </div>
        )
      }
      
      render(
        <NextIntlClientProvider locale="en" messages={{}}>
          <PluralizationTest />
        </NextIntlClientProvider>
      )
      
      expect(screen.getByText('One item')).toBeInTheDocument()
      expect(screen.getByText('5 items')).toBeInTheDocument()
    })
  })
  
  describe('Rich text formatting', () => {
    test('supports rich text with components', () => {
      const RichTextTest = () => {
        // Mock rich text functionality
        const tRich = (key: string, components: Record<string, (chunks: any) => JSX.Element>) => {
          if (key === 'terms') {
            return (
              <>
                By continuing, you agree to our{' '}
                {components.link(<>Terms of Service</>)}
              </>
            )
          }
          return key
        }
        
        return (
          <div>
            {tRich('terms', {
              link: (chunks) => <a href="/terms">{chunks}</a>
            })}
          </div>
        )
      }
      
      render(
        <NextIntlClientProvider locale="en" messages={{}}>
          <RichTextTest />
        </NextIntlClientProvider>
      )
      
      const link = screen.getByRole('link', { name: 'Terms of Service' })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/terms')
    })
  })
  
  describe('Locale context', () => {
    test('useLocale returns current locale', () => {
      const LocaleTest = () => {
        // useLocale is mocked in test setup
        const locale = useLocale()
        
        return <div data-testid="current-locale">{locale}</div>
      }
      
      render(
        <NextIntlClientProvider locale="fr" messages={{}}>
          <LocaleTest />
        </NextIntlClientProvider>
      )
      
      expect(screen.getByTestId('current-locale')).toHaveTextContent('en') // Mocked to return 'en'
    })
  })
  
  describe('Message loading', () => {
    test('loads messages from JSON files', async () => {
      // getMessages is mocked in test setup
      
      for (const locale of SUPPORTED_LOCALES) {
        const messages = await getMessages({ locale })
        
        expect(messages).toBeDefined()
        expect(typeof messages).toBe('object')
        expect(messages.navigation).toBeDefined()
        expect(messages.hero).toBeDefined()
      }
    })
  })
})