'use client'

import { buildWhatsAppLink, getSupportConfig, type SupportSource } from '@/config/support'
import { cn } from '@/lib/utils'

interface WhatsAppSupportProps {
  locale: string
  source?: SupportSource | string
  className?: string
  showHours?: boolean
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Floating WhatsApp support button
 *
 * Only renders for Arabic locales - returns null for other locales.
 * Uses locale-specific phone numbers to build trust.
 */
export function WhatsAppSupport({
  locale,
  source = 'floating_button',
  className,
  showHours = false,
  size = 'md'
}: WhatsAppSupportProps) {
  const config = getSupportConfig(locale)

  // Only show for Arabic locales
  if (!config) return null

  const waLink = buildWhatsAppLink(locale, source)
  if (!waLink) return null

  const sizeClasses = {
    sm: 'p-2.5',
    md: 'p-3.5',
    lg: 'p-4'
  }

  const iconSizes = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7'
  }

  return (
    <div className={cn('fixed bottom-4 end-4 z-50', className)}>
      {showHours && (
        <div className="mb-2 bg-background/95 backdrop-blur-sm text-xs text-muted-foreground px-3 py-1.5 rounded-full shadow-sm border border-border text-center">
          {config.hours}
        </div>
      )}
      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center justify-center rounded-full shadow-lg transition-all duration-200',
          'bg-[#25D366] hover:bg-[#20BD5A] active:bg-[#1DA851]',
          'hover:scale-105 active:scale-95',
          'focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2',
          sizeClasses[size]
        )}
        aria-label="تواصل معنا عبر واتساب"
      >
        <WhatsAppIcon className={cn('text-white', iconSizes[size])} />
        {/* aria-label already provides screen reader context; hours shown visually when showHours=true */}
      </a>
    </div>
  )
}

/**
 * Inline WhatsApp button for use within content
 */
export function WhatsAppButton({
  locale,
  source,
  children,
  className,
  variant = 'primary'
}: {
  locale: string
  source?: SupportSource | string
  children?: React.ReactNode
  className?: string
  variant?: 'primary' | 'outline' | 'ghost'
}) {
  const config = getSupportConfig(locale)
  if (!config) return null

  const waLink = buildWhatsAppLink(locale, source)
  if (!waLink) return null

  const variantClasses = {
    primary: 'bg-[#25D366] hover:bg-[#20BD5A] text-white',
    outline: 'border border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10',
    ghost: 'text-[#25D366] hover:bg-[#25D366]/10'
  }

  return (
    <a
      href={waLink}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
        variantClasses[variant],
        className
      )}
    >
      <WhatsAppIcon className="w-5 h-5" />
      {children || 'تحدث مع الدعم'}
    </a>
  )
}

/**
 * WhatsApp icon (official brand)
 */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

export { WhatsAppIcon }
