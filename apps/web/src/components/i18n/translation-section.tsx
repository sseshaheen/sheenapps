import { Suspense } from 'react'
import { getMessageSection, type TranslationSection } from '@/i18n/chunked-request'

interface TranslationSectionProps {
  locale: string
  section: TranslationSection
  children: (translations: any) => React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Suspense-wrapped component for loading translation sections on-demand
 */
async function TranslationSectionLoader({ 
  locale, 
  section, 
  children 
}: Omit<TranslationSectionProps, 'fallback'>) {
  const translations = await getMessageSection(locale, section)
  return <>{children(translations)}</>
}

/**
 * Translation section with Suspense boundary
 */
export function TranslationSection({ 
  locale, 
  section, 
  children, 
  fallback 
}: TranslationSectionProps) {
  return (
    <Suspense fallback={fallback || <TranslationSkeleton />}>
      <TranslationSectionLoader 
        locale={locale} 
        section={section}
      >
        {children}
      </TranslationSectionLoader>
    </Suspense>
  )
}

/**
 * Default skeleton for loading translation sections
 */
function TranslationSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-gray-200 h-4 w-32 rounded mb-2"></div>
      <div className="bg-gray-200 h-3 w-24 rounded"></div>
    </div>
  )
}

/**
 * Specialized skeletons for different sections
 */
export const TranslationSkeletons = {
  Hero: () => (
    <div className="animate-pulse space-y-4">
      <div className="bg-gray-200 h-8 w-64 rounded"></div>
      <div className="bg-gray-200 h-6 w-48 rounded"></div>
      <div className="bg-gray-200 h-10 w-32 rounded"></div>
    </div>
  ),
  
  Navigation: () => (
    <div className="animate-pulse flex space-x-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-gray-200 h-4 w-16 rounded"></div>
      ))}
    </div>
  ),
  
  Pricing: () => (
    <div className="animate-pulse grid grid-cols-3 gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-gray-200 h-32 rounded"></div>
      ))}
    </div>
  ),
  
  Features: () => (
    <div className="animate-pulse grid grid-cols-2 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="space-y-2">
          <div className="bg-gray-200 h-4 w-24 rounded"></div>
          <div className="bg-gray-200 h-3 w-32 rounded"></div>
        </div>
      ))}
    </div>
  )
}