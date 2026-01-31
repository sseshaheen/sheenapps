"use client"

import Icon from '@/components/ui/icon'
import { LanguageSwitcher } from "@/components/ui/language-switcher"
import { m } from '@/components/ui/motion-provider'
import { ROUTES } from '@/i18n/routes'
import { Link } from '@/i18n/routing'
import Image from "next/image"

interface FooterClientProps {
  description: string;
  product: string;
  support: string;
  company: string;
  links: {
    howItWorks: string;
    pricing: string;
    features: string;
    templates: string;
    integrations: string;
    talkToAdvisor: string;
    helpCenter: string;
    community: string;
    status: string;
    bookCall: string;
    about: string;
    blog: string;
    careers: string;
    privacy: string;
    terms: string;
  };
  copyright: string;
  systemsOperational: string;
  supportAvailable: string;
  locale: string;
}

export function FooterClient({
  description,
  product,
  support,
  company,
  links,
  copyright,
  systemsOperational,
  supportAvailable,
  locale
}: FooterClientProps) {
  return (
    <footer className="bg-black border-t border-white/10">
      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <m.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-6"
            >
              <div className="mb-4">
                <Image
                  src="https://www.sheenapps.com/sheenapps-logo-trans--min.png"
                  alt="SheenApps Logo"
                  width={150}
                  height={50}
                  className="h-7 sm:h-8 md:h-9 w-auto"
                />
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                {description}
              </p>
            </m.div>

            {/* Language Switcher */}
            <LanguageSwitcher variant="footer" currentLocale={locale} />

            {/* Social Links */}
            <div className="flex gap-4">
              <a href="https://twitter.com/sheenapps" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                <Icon name="twitter" className="w-5 h-5"  />
              </a>
              <a href="https://github.com/sheenapps" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                <Icon name="github" className="w-5 h-5"  />
              </a>
              <a href="mailto:support@sheenapps.com" className="text-gray-400 hover:text-white transition-colors">
                <Icon name="mail" className="w-5 h-5"  />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-white font-semibold mb-4">{product}</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href={ROUTES.HOW_IT_WORKS} className="hover:text-white transition-colors">{links.howItWorks}</Link></li>
              <li><Link href={ROUTES.PRICING_PAGE} className="hover:text-white transition-colors">{links.pricing}</Link></li>
              <li><Link href={ROUTES.FEATURES} className="hover:text-white transition-colors">{links.features}</Link></li>
              <li><Link href={ROUTES.INTEGRATIONS} className="hover:text-white transition-colors">{links.integrations}</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-semibold mb-4">{support}</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href={ROUTES.ADVISOR_BROWSE} className="hover:text-white transition-colors">{links.talkToAdvisor}</Link></li>
              <li><Link href={ROUTES.HELP} className="hover:text-white transition-colors">{links.helpCenter}</Link></li>
              <li><Link href={ROUTES.ADVISOR} className="hover:text-white transition-colors">Advisors</Link></li>
              <li><Link href={ROUTES.ADVISOR_BROWSE} className="hover:text-white transition-colors">{links.bookCall}</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white font-semibold mb-4">{company}</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href={ROUTES.ABOUT} className="hover:text-white transition-colors">{links.about}</Link></li>
              <li><Link href={ROUTES.BLOG} className="hover:text-white transition-colors">{links.blog}</Link></li>
              <li><Link href={ROUTES.CAREERS} className="hover:text-white transition-colors">{links.careers}</Link></li>
              <li><Link href={ROUTES.PRIVACY} className="hover:text-white transition-colors">{links.privacy}</Link></li>
              <li><Link href={ROUTES.TERMS} className="hover:text-white transition-colors">{links.terms}</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-400">
            {copyright}
          </p>

          <div className="flex items-center gap-6 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>{systemsOperational}</span>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="message-circle" className="w-4 h-4"  />
              <span>{supportAvailable}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
