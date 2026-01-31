'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'

export function LocalizedComponent() {
  const t = useTranslations('hero')
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      <button>{t('startBuilding')}</button>
    </div>
  )
}

// Example with nested translations
export function NavigationExample() {
  const t = useTranslations('navigation')
  
  return (
    <nav>
      <a href="#">{t('howItWorks')}</a>
      <a href="#">{t('pricing')}</a>
      <a href="#">{t('features')}</a>
      <button>{t('startBuilding')}</button>
    </nav>
  )
}

// Example with interpolation
export function InterpolationExample() {
  const t = useTranslations('dashboard')
  
  const projectCount = 5
  
  return (
    <div>
      <p>{t('projectCount', { count: projectCount })}</p>
      <p>{t('welcomeMessage', { name: 'John' })}</p>
    </div>
  )
}

// Example with rich text
export function RichTextExample() {
  const t = useTranslations('common')
  
  return (
    <div>
      <p>
        {t.rich('termsAndConditions', {
          link: (chunks) => <Link href="/terms">{chunks}</Link>,
          strong: (chunks) => <strong>{chunks}</strong>
        })}
      </p>
    </div>
  )
}