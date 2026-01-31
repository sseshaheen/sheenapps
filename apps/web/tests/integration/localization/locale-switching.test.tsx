import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SUPPORTED_LOCALES, isRTL } from '../../utils/localization'
import { createMockRouter } from '../../mocks/services'

// Mock localStorage before other imports
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  writable: true
})

// Mock locale context provider
const LocaleProvider = ({ 
  children, 
  locale = 'en',
  onLocaleChange
}: { 
  children: React.ReactNode
  locale?: string
  onLocaleChange?: (locale: string) => void
}) => {
  const [currentLocale, setCurrentLocale] = React.useState(locale)
  
  // Sync with the locale prop when it changes
  React.useEffect(() => {
    setCurrentLocale(locale)
  }, [locale])
  
  const changeLocale = (newLocale: string) => {
    setCurrentLocale(newLocale)
    onLocaleChange?.(newLocale)
  }
  
  return (
    <div data-locale={currentLocale} dir={isRTL(currentLocale) ? 'rtl' : 'ltr'}>
      {children}
    </div>
  )
}

// Mock locale switcher component
const LocaleSwitcher = ({ 
  locale, 
  changeLocale 
}: { 
  locale: string
  changeLocale: (locale: string) => void 
}) => {
  return (
    <select 
      value={locale} 
      onChange={(e) => changeLocale(e.target.value)}
      data-testid="locale-switcher"
    >
      {SUPPORTED_LOCALES.map(loc => (
        <option key={loc} value={loc}>{loc}</option>
      ))}
    </select>
  )
}

// Mock component that uses translations
const TranslatedComponent = ({ locale }: { locale: string }) => {
  const [translations, setTranslations] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  
  React.useEffect(() => {
    setLoading(true)
    import(`../../../src/messages/${locale}.json`)
      .then(module => {
        setTranslations(module.default)
        setLoading(false)
      })
      .catch(() => {
        setTranslations({ error: 'Failed to load translations' })
        setLoading(false)
      })
  }, [locale])
  
  if (loading) return <div>Loading...</div>
  if (!translations) return <div>No translations</div>
  
  return (
    <div data-testid="translated-content">
      <h1>{translations.hero?.title || 'No title'}</h1>
      <p>{translations.hero?.subtitle || 'No subtitle'}</p>
      <button>{translations.navigation?.login || 'Login'}</button>
    </div>
  )
}

describe('Locale Switching', () => {
  let mockRouter: ReturnType<typeof createMockRouter>
  
  beforeEach(() => {
    mockRouter = createMockRouter()
    vi.clearAllMocks()
    // Clear localStorage mocks
    vi.mocked(window.localStorage.getItem).mockClear()
    vi.mocked(window.localStorage.setItem).mockClear()
    // Reset document direction
    document.documentElement.dir = 'ltr'
    document.documentElement.lang = 'en'
  })

  describe('Runtime Locale Switching', () => {
    test('should switch locale without page reload', async () => {
      const handleLocaleChange = vi.fn()
      
      const App = () => {
        const [locale, setLocale] = React.useState('en')
        
        const changeLocale = (newLocale: string) => {
          setLocale(newLocale)
          handleLocaleChange(newLocale)
        }
        
        return (
          <LocaleProvider locale={locale} onLocaleChange={handleLocaleChange}>
            <div>
              <LocaleSwitcher locale={locale} changeLocale={changeLocale} />
              <TranslatedComponent locale={locale} />
            </div>
          </LocaleProvider>
        )
      }
      
      render(<App />)
      
      // Initial state
      expect(screen.getByTestId('locale-switcher')).toHaveValue('en')
      await waitFor(() => {
        expect(screen.getByTestId('translated-content')).toBeInTheDocument()
      })
      
      // Switch to Arabic
      fireEvent.change(screen.getByTestId('locale-switcher'), { target: { value: 'ar-eg' } })
      
      await waitFor(() => {
        expect(handleLocaleChange).toHaveBeenCalledWith('ar-eg')
        expect(screen.getByTestId('locale-switcher')).toHaveValue('ar-eg')
      })
    })

    test('should update all translated content on locale change', async () => {
      const App = () => {
        const [locale, setLocale] = React.useState('en')
        
        return (
          <LocaleProvider locale={locale}>
            <div>
              <LocaleSwitcher locale={locale} changeLocale={setLocale} />
              <TranslatedComponent locale={locale} />
            </div>
          </LocaleProvider>
        )
      }
      
      render(<App />)
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText(/Welcome|Build|Create/i)).toBeInTheDocument()
      })
      
      // Switch to French
      fireEvent.change(screen.getByTestId('locale-switcher'), { target: { value: 'fr' } })
      
      // Content should update
      await waitFor(() => {
        const content = screen.getByTestId('translated-content')
        expect(content.textContent).not.toContain('Welcome')
      })
    })

    test('should maintain locale across navigation', async () => {
      const navigatedLocales: string[] = []
      
      const App = () => {
        const [locale, setLocale] = React.useState('en')
        const [page, setPage] = React.useState('home')
        
        React.useEffect(() => {
          navigatedLocales.push(locale)
        }, [page, locale])
        
        return (
          <LocaleProvider locale={locale}>
            <div>
              <LocaleSwitcher locale={locale} changeLocale={setLocale} />
              <button onClick={() => setPage('about')} data-testid="navigate">
                Navigate
              </button>
              <div data-testid="current-page">{page}</div>
              <TranslatedComponent locale={locale} />
            </div>
          </LocaleProvider>
        )
      }
      
      render(<App />)
      
      // Switch locale
      fireEvent.change(screen.getByTestId('locale-switcher'), { target: { value: 'es' } })
      
      await waitFor(() => {
        expect(screen.getByTestId('locale-switcher')).toHaveValue('es')
      })
      
      // Navigate
      fireEvent.click(screen.getByTestId('navigate'))
      
      await waitFor(() => {
        expect(screen.getByTestId('current-page')).toHaveTextContent('about')
        expect(screen.getByTestId('locale-switcher')).toHaveValue('es')
      })
      
      // Locale should persist
      expect(navigatedLocales).toContain('es')
    })
  })

  describe('Locale Persistence', () => {
    test('should save locale preference to localStorage', async () => {
      // Reset localStorage mock
      vi.mocked(window.localStorage.getItem).mockReturnValue(null)
      
      const App = () => {
        const [locale, setLocale] = React.useState(() => {
          return localStorage.getItem('preferred-locale') || 'en'
        })
        
        const changeLocale = (newLocale: string) => {
          setLocale(newLocale)
          localStorage.setItem('preferred-locale', newLocale)
        }
        
        return (
          <LocaleProvider locale={locale}>
            <LocaleSwitcher locale={locale} changeLocale={changeLocale} />
          </LocaleProvider>
        )
      }
      
      render(<App />)
      
      // Change locale
      await act(async () => {
        fireEvent.change(screen.getByTestId('locale-switcher'), { target: { value: 'de' } })
      })
      
      await waitFor(() => {
        expect(window.localStorage.setItem).toHaveBeenCalledWith('preferred-locale', 'de')
      })
    })

    test('should restore locale from localStorage on mount', () => {
      // Mock localStorage to return a saved locale
      vi.mocked(window.localStorage.getItem).mockReturnValue('fr-ma')
      
      const App = () => {
        const [locale] = React.useState(() => {
          return localStorage.getItem('preferred-locale') || 'en'
        })
        
        return (
          <LocaleProvider locale={locale}>
            <div data-testid="current-locale">{locale}</div>
          </LocaleProvider>
        )
      }
      
      render(<App />)
      
      expect(window.localStorage.getItem).toHaveBeenCalledWith('preferred-locale')
      expect(screen.getByTestId('current-locale')).toHaveTextContent('fr-ma')
    })
  })

  describe('Direction Changes', () => {
    test('should update document direction on RTL locale switch', async () => {
      const App = () => {
        const [locale, setLocale] = React.useState('en')
        
        React.useEffect(() => {
          document.documentElement.dir = isRTL(locale) ? 'rtl' : 'ltr'
          document.documentElement.lang = locale
        }, [locale])
        
        return (
          <LocaleProvider locale={locale}>
            <LocaleSwitcher locale={locale} changeLocale={setLocale} />
          </LocaleProvider>
        )
      }
      
      render(<App />)
      
      // Initial LTR
      expect(document.documentElement.dir).toBe('ltr')
      expect(document.documentElement.lang).toBe('en')
      
      // Switch to RTL
      await act(async () => {
        fireEvent.change(screen.getByTestId('locale-switcher'), { target: { value: 'ar-sa' } })
      })
      
      await waitFor(() => {
        expect(document.documentElement.dir).toBe('rtl')
        expect(document.documentElement.lang).toBe('ar-sa')
      })
      
      // Switch back to LTR
      await act(async () => {
        fireEvent.change(screen.getByTestId('locale-switcher'), { target: { value: 'fr' } })
      })
      
      await waitFor(() => {
        expect(document.documentElement.dir).toBe('ltr')
        expect(document.documentElement.lang).toBe('fr')
      })
    })
  })

  describe('Number and Date Formatting', () => {
    test('should format numbers according to locale', () => {
      const NumberFormatter = ({ locale, value }: { locale: string; value: number }) => {
        const formatted = new Intl.NumberFormat(locale).format(value)
        return <span data-testid="formatted-number">{formatted}</span>
      }
      
      const { rerender } = render(<NumberFormatter locale="en" value={1234.56} />)
      expect(screen.getByTestId('formatted-number')).toHaveTextContent('1,234.56')
      
      rerender(<NumberFormatter locale="fr" value={1234.56} />)
      expect(screen.getByTestId('formatted-number')).toHaveTextContent('1 234,56')
      
      rerender(<NumberFormatter locale="ar-eg" value={1234.56} />)
      const arabicFormatted = screen.getByTestId('formatted-number').textContent
      expect(arabicFormatted).toMatch(/١٬٢٣٤٫٥٦|1,234.56/) // May vary by environment
    })

    test('should format dates according to locale', () => {
      const DateFormatter = ({ locale, date }: { locale: string; date: Date }) => {
        const formatted = new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }).format(date)
        return <span data-testid="formatted-date">{formatted}</span>
      }
      
      const testDate = new Date('2024-03-15')
      
      const { rerender } = render(<DateFormatter locale="en" date={testDate} />)
      expect(screen.getByTestId('formatted-date')).toHaveTextContent('March 15, 2024')
      
      rerender(<DateFormatter locale="de" date={testDate} />)
      expect(screen.getByTestId('formatted-date')).toHaveTextContent('15. März 2024')
      
      rerender(<DateFormatter locale="es" date={testDate} />)
      expect(screen.getByTestId('formatted-date')).toHaveTextContent('15 de marzo de 2024')
    })
  })

  describe('Error Handling', () => {
    test('should handle invalid locale gracefully', async () => {
      const App = () => {
        const [locale, setLocale] = React.useState('en')
        const [error, setError] = React.useState<string | null>(null)
        
        const changeLocale = async (newLocale: string) => {
          try {
            await import(`../../../src/messages/${newLocale}.json`)
            setLocale(newLocale)
            setError(null)
          } catch {
            setError(`Failed to load locale: ${newLocale}`)
          }
        }
        
        return (
          <div>
            <button onClick={() => changeLocale('invalid-locale')} data-testid="invalid-locale-btn">
              Load Invalid Locale
            </button>
            {error && <div data-testid="error-message">{error}</div>}
            <div data-testid="current-locale">{locale}</div>
          </div>
        )
      }
      
      render(<App />)
      
      fireEvent.click(screen.getByTestId('invalid-locale-btn'))
      
      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Failed to load locale: invalid-locale')
        expect(screen.getByTestId('current-locale')).toHaveTextContent('en') // Should stay on current locale
      })
    })
  })
})