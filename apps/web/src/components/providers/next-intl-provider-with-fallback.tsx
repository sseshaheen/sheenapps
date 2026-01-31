'use client'

/* eslint-disable no-restricted-globals */

import { logger } from '@/utils/logger'
import { NextIntlClientProvider } from 'next-intl'
import { ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { isPublicAdvisorPath } from '@/utils/advisor-routes'

interface NextIntlProviderWithFallbackProps {
  children: ReactNode
  locale: string
  messages: any
}

/**
 * Enhanced NextIntlClientProvider with Fast Refresh protection
 * Handles context initialization issues during development hot reloads
 */
export function NextIntlProviderWithFallback({
  children,
  locale,
  messages
}: NextIntlProviderWithFallbackProps) {
  const pathname = usePathname()
  const isPublicAdvisor = isPublicAdvisorPath(pathname)
  const [isContextReady, setIsContextReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    // Add a small delay to ensure context is properly initialized
    // This helps with Fast Refresh race conditions
    const timer = setTimeout(() => {
      try {
        // Validate that we have the required props
        if (!locale || !messages) {
          throw new Error(`Missing required props: locale=${!!locale}, messages=${!!messages}`)
        }

        setIsContextReady(true)
        setInitError(null)

        if (process.env.NODE_ENV === 'development') {
          logger.debug('intl', '🌍 NextIntl context initialized successfully', {
            locale,
            messageKeys: Object.keys(messages).length,
            timestamp: new Date().toISOString()
          })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error'
        setInitError(errorMessage)
        logger.error('🌍 NextIntl context initialization failed:', { error: errorMessage, locale })
      }
    }, process.env.NODE_ENV === 'development' ? 50 : 0) // Small delay only in development

    return () => clearTimeout(timer)
  }, [locale, messages])

  // Minimal text maps (provider can't use next-intl hooks)
  const getLoadingText = (locale: string): string => {
    const loadingTexts: Record<string, string> = {
      'en': 'Loading...',
      'ar': 'جاري التحميل...',
      'ar-eg': 'جاري التحميل...',
      'ar-sa': 'جاري التحميل...',
      'ar-ae': 'جاري التحميل...',
      'fr': 'Chargement...',
      'fr-ma': 'Chargement...',
      'es': 'Cargando...',
      'de': 'Laden...'
    }
    return loadingTexts[locale] || loadingTexts['en']
  }

  const getErrorTexts = (locale: string) => {
    const errorTexts: Record<string, { title: string; description: string; button: string }> = {
      'en': {
        title: 'Translation System Error',
        description: 'Failed to initialize internationalization context',
        button: 'Reload Page'
      },
      'ar': {
        title: 'خطأ في نظام الترجمة',
        description: 'فشل في تهيئة سياق التدويل',
        button: 'إعادة تحميل الصفحة'
      },
      'ar-eg': {
        title: 'خطأ في نظام الترجمة',
        description: 'فشل في تهيئة سياق التدويل',
        button: 'إعادة تحميل الصفحة'
      },
      'ar-sa': {
        title: 'خطأ في نظام الترجمة',
        description: 'فشل في تهيئة سياق التدويل',
        button: 'إعادة تحميل الصفحة'
      },
      'ar-ae': {
        title: 'خطأ في نظام الترجمة',
        description: 'فشل في تهيئة سياق التدويل',
        button: 'إعادة تحميل الصفحة'
      },
      'fr': {
        title: 'Erreur du système de traduction',
        description: 'Échec de l\'initialisation du contexte d\'internationalisation',
        button: 'Recharger la page'
      },
      'fr-ma': {
        title: 'Erreur du système de traduction',
        description: 'Échec de l\'initialisation du contexte d\'internationalisation',
        button: 'Recharger la page'
      },
      'es': {
        title: 'Error del sistema de traducción',
        description: 'Error al inicializar el contexto de internacionalización',
        button: 'Recargar página'
      },
      'de': {
        title: 'Übersetzungssystem-Fehler',
        description: 'Initialisierung des Internationalisierungskontexts fehlgeschlagen',
        button: 'Seite neu laden'
      }
    }
    return errorTexts[locale] || errorTexts['en']
  }

  // Show loading state during initialization (skip loading for public advisor routes)
  if (!isContextReady && !isPublicAdvisor) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          {/* <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {getLoadingText(locale)}
          </p> */}
        </div>
      </div>
    )
  }

  // Show error state if initialization failed
  if (initError) {
    const errorTexts = getErrorTexts(locale)

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-6 border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 rounded-lg">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
            {errorTexts.title}
          </h2>
          <p className="text-sm text-red-600 dark:text-red-300 mb-4">
            {errorTexts.description}: {initError}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            {errorTexts.button}
          </button>
        </div>
      </div>
    )
  }

  // Provide the context with error boundary
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={(error) => {
        // Log intl errors in development
        if (process.env.NODE_ENV === 'development') {
          logger.warn('🌍 NextIntl runtime error:', {
            error: error.message,
            locale,
            timestamp: new Date().toISOString()
          })
        }
      }}
      getMessageFallback={({ namespace, key, error }) => {
        // Provide fallbacks for missing translations
        const fallback = process.env.NODE_ENV === 'development'
          ? `⚠️ ${namespace}.${key}`
          : key

        if (process.env.NODE_ENV === 'development') {
          logger.warn('🌍 Missing translation:', { namespace, key, error: error?.message })
        }

        return fallback
      }}
    >
      {children}
    </NextIntlClientProvider>
  )
}
