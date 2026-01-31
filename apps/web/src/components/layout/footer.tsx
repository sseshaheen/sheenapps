"use client"

import Icon from '@/components/ui/icon'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { m } from '@/components/ui/motion-provider'
import { ROUTES } from '@/i18n/routes'
import { Link } from '@/i18n/routing'
import Image from "next/image"

export function Footer() {
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
                  className="h-10 w-auto"
                />
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Your permanent tech team for the price of a gym membership.
                Build, grow, and scale your business without the technical hassle.
              </p>
            </m.div>

            {/* Language Switcher */}
            <div className="mb-6">
              <LanguageSwitcher variant="footer" />
            </div>

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
            <h4 className="text-white font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href={ROUTES.HOW_IT_WORKS} className="hover:text-white transition-colors">How it Works</Link></li>
              <li><Link href={ROUTES.PRICING} className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href={ROUTES.FEATURES} className="hover:text-white transition-colors">Features</Link></li>
              <li><Link href={ROUTES.INTEGRATIONS} className="hover:text-white transition-colors">Integrations</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href={ROUTES.ADVISOR_BROWSE} className="hover:text-white transition-colors">Talk to Advisor</Link></li>
              <li><Link href={ROUTES.HELP} className="hover:text-white transition-colors">Help Center</Link></li>
              <li><Link href={ROUTES.ADVISOR} className="hover:text-white transition-colors">Advisors</Link></li>
              <li><Link href={ROUTES.ADVISOR_BROWSE} className="hover:text-white transition-colors">Book a Call</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href={ROUTES.ABOUT} className="hover:text-white transition-colors">About</Link></li>
              <li>
                <Link href={ROUTES.BLOG} className="hover:text-white transition-colors">
                  Blog
                </Link>
              </li>
              <li><Link href={ROUTES.CAREERS} className="hover:text-white transition-colors">Careers</Link></li>
              <li><Link href={ROUTES.PRIVACY} className="hover:text-white transition-colors">Privacy</Link></li>
              <li><Link href={ROUTES.TERMS} className="hover:text-white transition-colors">Terms</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-400">
            © 2025 SheenApps. All rights reserved.
          </p>

          <div className="flex items-center gap-6 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>All systems operational</span>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="message-circle" className="w-4 h-4"  />
              <span>24/7 support available</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
