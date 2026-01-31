'use client'

/**
 * Minimal Footer Component
 * Simplified footer for coming soon / preview mode
 * No navigation links, just branding and copyright
 */

import { m } from '@/components/ui/motion-provider'
import Image from 'next/image'
import { Icon } from '@/components/ui/icon'

interface FooterMinimalProps {
  translations: {
    launching: string
    copyright: string
  }
  locale: string
}

export function FooterMinimal({ translations, locale }: FooterMinimalProps) {
  const isRTL = locale.startsWith('ar')

  return (
    <footer
      className="py-12 bg-black border-t border-white/10"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Image
              src="https://www.sheenapps.com/sheenapps-logo-trans--min.png"
              alt="SheenApps"
              width={120}
              height={28}
              className="h-7 w-auto opacity-80"
            />
          </m.div>

          {/* Launching badge */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2 text-gray-400"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-sm">{translations.launching}</span>
          </m.div>

          {/* Social links placeholder */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-4"
          >
            <a
              href="https://twitter.com/sheenapps"
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Icon name="twitter" className="w-4 h-4" />
            </a>
            <a
              href="https://linkedin.com/company/sheenapps"
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Icon name="linkedin" className="w-4 h-4" />
            </a>
          </m.div>

          {/* Copyright */}
          <m.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="text-sm text-gray-500"
          >
            {translations.copyright}
          </m.p>
        </div>
      </div>
    </footer>
  )
}
