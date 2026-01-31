'use client'

import { useEffect } from 'react'

interface ClientFontLoaderProps {
  locale: string
  direction: string
  fontClasses: string
  bodyClasses: string
}

export function ClientFontLoader({ locale, direction, fontClasses, bodyClasses }: ClientFontLoaderProps) {
  useEffect(() => {
    // Apply font classes and attributes after hydration
    // Using requestAnimationFrame to ensure this runs after the initial render
    if (typeof document !== 'undefined') {
      requestAnimationFrame(() => {
        const html = document.documentElement
        const body = document.body
        
        // Set lang and dir attributes (these should already be set by SSR)
        // Only update if they're different to avoid unnecessary DOM mutations
        if (html.lang !== locale) {
          html.lang = locale
        }
        if (html.dir !== direction) {
          html.dir = direction
        }
        
        // Add font classes without removing existing ones (especially 'dark' and 'h-full')
        // Important: Never remove classes, only add missing ones
        const fontClassArray = fontClasses.split(' ').filter(Boolean)
        
        fontClassArray.forEach(cls => {
          if (cls && !html.classList.contains(cls)) {
            html.classList.add(cls)
          }
        })
        
        // Add body classes without replacing existing ones (prevents hydration mismatch)
        const bodyClassArray = bodyClasses.split(' ').filter(Boolean)
        
        bodyClassArray.forEach(cls => {
          if (cls && !body.classList.contains(cls)) {
            body.classList.add(cls)
          }
        })
      })
    }
  }, [locale, direction, fontClasses, bodyClasses])

  // Dev check for duplicate headers
  useEffect(() => {
    // eslint-disable-next-line no-restricted-globals
    if (process.env.NODE_ENV !== 'development') return;
    
    const checkHeaders = () => {
      const headers = document.querySelectorAll('[data-app-header]')
      if (headers.length > 1) {
        console.warn(`⚠️ Duplicate headers detected: ${headers.length} headers found`)
        headers.forEach((header, index) => {
          console.warn(`Header ${index + 1}:`, header)
        })
      }
    }

    // Check immediately
    checkHeaders()
    
    // Also check after any DOM changes (useful for dynamic content)
    const observer = new MutationObserver(checkHeaders)
    observer.observe(document.body, { childList: true, subtree: true })
    
    return () => observer.disconnect()
  }, [])

  return null // This component only handles side effects
}
