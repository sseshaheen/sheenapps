'use client'

import { useLocale } from 'next-intl'

// Simple formatter utilities
const createNumberFormatter = (locale: string, options?: Intl.NumberFormatOptions) => {
  return new Intl.NumberFormat(locale, options)
}

const formatCurrencyCore = (amount: number, locale: string, currency = 'USD') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(amount)
}

const formatDateCore = (date: Date, locale: string, options?: Intl.DateTimeFormatOptions) => {
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function useFormatters() {
  const locale = useLocale()
  
  const formatNumber = (value: number) => {
    return createNumberFormatter(locale).format(value)
  }
  
  const formatCurrency = (amount: number, currency = 'USD') => {
    return formatCurrencyCore(amount, locale, currency)
  }
  
  const formatPercentage = (value: number) => {
    return createNumberFormatter(locale, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }).format(value)
  }
  
  const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) => {
    return formatDateCore(date, locale, options)
  }
  
  const formatRelativeTime = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffDays > 7) {
      return formatDate(date, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      })
    }
    
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    
    if (diffDays > 0) {
      return rtf.format(-diffDays, 'day')
    } else if (diffHours > 0) {
      return rtf.format(-diffHours, 'hour')
    } else if (diffMinutes > 0) {
      return rtf.format(-diffMinutes, 'minute')
    } else {
      return rtf.format(-diffSeconds, 'second')
    }
  }
  
  return { 
    formatNumber, 
    formatCurrency, 
    formatPercentage, 
    formatDate,
    formatRelativeTime 
  }
}