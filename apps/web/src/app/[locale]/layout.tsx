import { ClarityProvider } from '@/components/analytics/clarity-provider';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { AuthProvider } from '@/components/auth/auth-provider';
import { HTTPRequestLogger } from '@/components/debug/http-request-logger';
import { HydrationErrorBoundary } from '@/components/error-boundaries/hydration-error-boundary';
import { FeedbackProvider, FeedbackTab, FeedbackErrorBoundary } from '@/components/feedback';
import { ClientFontLoader } from '@/components/layout/client-font-loader';
import ConditionalHeader from '@/components/layout/conditional-header';
import { GA4LayoutProvider } from '@/components/layout/ga4-layout-provider';
import { IntlErrorBoundary } from '@/components/providers/intl-error-boundary';
import { QueryProvider } from '@/components/providers/query-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { MotionProvider } from '@/components/ui/motion-provider';
import { WhatsAppMarketingOnly } from '@/components/ui/whatsapp-marketing-only';
import { locales, type Locale } from '@/i18n/config';
import { Toaster } from 'sonner';
// Grafana Faro client-side initialization (side-effect import)
import { NextIntlProviderWithFallback } from '@/components/providers/next-intl-provider-with-fallback';
import { getServerAuthSnapshot } from '@/lib/auth/get-server-auth-snapshot';
import { themeInitScriptMinified } from '@/lib/theme-script';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { Cairo, Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from 'next/navigation';
import '../faro.client';
import "../globals.css";

// EXPERT RECOMMENDATION: Force dynamic rendering to ensure server components read fresh cookies
export const dynamic = 'force-dynamic'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'arial'],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap',
  preload: true,
  fallback: ['ui-monospace', 'Consolas'],
});

// Modern Arabic fonts for professional, futuristic look
// NOTE: preload=false because these are only used on Arabic locales (~4/9 locales)
// They'll still load when needed, just not preloaded on every page
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"], // Reduced from 9 weights to 3
  display: 'swap',
  preload: false, // Only used on Arabic pages - don't preload on English/French/etc
  fallback: ['system-ui', 'arial'],
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"], // Reduced from 7 weights to 3
  display: 'swap',
  preload: false, // Only used on Arabic pages - don't preload on English/French/etc
  fallback: ['system-ui', 'arial'],
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// RTL locales - module scope for efficiency
const RTL_LOCALES = new Set(['ar', 'ar-eg', 'ar-sa', 'ar-ae'])

// Map app locales to OpenGraph locale format (e.g., ar-eg -> ar_EG)
// Note: ar_AR is not a real OG locale, use ar_EG as Arabic fallback
const toOgLocale = (locale: string): string => {
  const ogLocaleMap: Record<string, string> = {
    'en': 'en_US',
    'ar': 'ar_EG', // ar_AR doesn't exist; use ar_EG as fallback
    'ar-eg': 'ar_EG',
    'ar-sa': 'ar_SA',
    'ar-ae': 'ar_AE',
    'fr': 'fr_FR',
    'fr-ma': 'fr_MA',
    'es': 'es_ES',
    'de': 'de_DE',
  }
  return ogLocaleMap[locale] ?? (locale.startsWith('ar') ? 'ar_EG' : 'en_US')
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;

  const titles: Record<string, string> = {
    'en': 'SheenApps - Your Tech Team. AI + Humans',
    'ar-eg': 'شين آبس - فريقك التقني. ذكاء اصطناعي + شريك بشري',
    'ar-sa': 'شين آبس - فريقك التقني. ذكاء اصطناعي + شريك بشري',
    'ar-ae': 'شين آبس - فريقك التقني. ذكاء اصطناعي + شريك بشري',
    'ar': 'شين آبس - فريقك التقني. ذكاء اصطناعي + شريك بشري',
    'fr': 'SheenApps – Votre équipe tech. IA + Humains'
  };

  const descriptions = {
    'en': 'Build your business in 5 minutes. Add features in minutes. Real humans on standby.',
    'ar-eg': 'اعمل شركتك في 5 دقايق. ضيف مميزات في أقل. ناس حقيقية مستنياك.',
    'ar-sa': 'أنشئ شركتك في 5 دقائق. أضف مميزات في أقل. أشخاص حقيقيون في الانتظار.',
    'ar-ae': 'أنشئ شركتك في 5 دقائق. أضف مميزات في أقل. أشخاص حقيقيون في الانتظار.',
    'ar': 'أنشئ شركتك في 5 دقائق. أضف مميزات في أقل. أشخاص حقيقيون في الانتظار.',
    'fr': 'Créez votre entreprise en 5 minutes. Ajoutez des fonctionnalités rapidement. Des vraies personnes à votre disposition.'
  };

  return {
    metadataBase: new URL('https://www.sheenapps.com'),
    title: titles[locale] || titles.en,
    description: descriptions[locale] || descriptions.en,

    // Alternate language links for SEO
    // Note: English canonical is root (/), fr-ma excluded (redirects to /fr/)
    alternates: {
      canonical: locale === 'en' ? '/' : `/${locale}`,
      languages: {
        // English at root (canonical)
        'en': '/',
        // All other locales with prefix (excluding fr-ma which redirects, and en-XA which is dev-only)
        'ar-EG': '/ar-eg',
        'ar-SA': '/ar-sa',
        'ar-AE': '/ar-ae',
        'ar': '/ar',
        'fr': '/fr',
        'es': '/es',
        'de': '/de',
        // x-default points to root (English canonical)
        'x-default': '/',
      },
    },

    // Open Graph
    openGraph: {
      title: titles[locale] || titles.en,
      description: descriptions[locale] || descriptions.en,
      url: 'https://www.sheenapps.com',
      siteName: 'SheenApps',
      locale: toOgLocale(locale),
      alternateLocale: locales.filter(l => l !== locale).map(toOgLocale),
      type: 'website',
      images: [
        {
          url: 'https://www.sheenapps.com/og-image.png',
          width: 1536,
          height: 1024,
          alt: 'SheenApps - Your Tech Team. AI + Humans',
        }
      ],
    },

    // Twitter
    twitter: {
      card: 'summary_large_image',
      title: titles[locale] || titles.en,
      description: descriptions[locale] || descriptions.en,
      images: ['https://www.sheenapps.com/og-image.png'],
      creator: '@sheenapps',
      site: '@sheenapps',
    },

    // Additional meta tags
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },

    // Icons
    icons: {
      icon: '/favicon.svg',
      shortcut: '/favicon.svg',
      apple: '/favicon.svg',
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale)) {
    notFound();
  }

  // EXPERT CRITICAL FIX: Bind request to locale for provider stability
  // This prevents context recreation and eliminates "No intl context found" errors
  setRequestLocale(locale);

  // EXPERT RECOMMENDATION: Deterministic direction calculation (using module-scope RTL_LOCALES)
  const direction = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
  const isArabic = locale.startsWith('ar');

  // Stabilize font classes to prevent hydration mismatch
  // Use memoized/cached class generation to ensure server/client consistency
  const baseFontClasses = `${geistSans.variable} ${geistMono.variable}`
  const arabicFontClasses = isArabic ? ` ${cairo.variable} ${ibmPlexArabic.variable}` : ''
  const fontClasses = baseFontClasses + arabicFontClasses

  // Stabilize body classes to prevent hydration mismatch - use static classes
  const bodyClasses = `antialiased ${isArabic ? 'font-cairo' : 'font-geist-sans'}`

  // EXPERT SYNCHRONOUS BOOTSTRAP SOLUTION: Get auth state for immediate client initialization
  const initialAuthSnapshot = await getServerAuthSnapshot()

  // Get all messages for the locale
  const messages = await getMessages({ locale });

  // EXPERT FIX ROUND 2: Gate analytics providers to reduce overhead in non-prod
  const isProd = process.env.NEXT_PUBLIC_APP_ENV === 'production'
  const enableAnalytics = isProd && process.env.NEXT_PUBLIC_ENABLE_ANALYTICS !== 'false'
  const enableDebugLogger = process.env.NODE_ENV === 'development'

  return (
    <html lang={locale} dir={direction} className={`h-full ${fontClasses}`} suppressHydrationWarning>
      <head>
        {/* Note: font preconnects removed - next/font/google self-hosts fonts */}
        {/* Prevent theme flash and hydration mismatch by setting theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: themeInitScriptMinified,
          }}
        />
      </head>
      <body className={`min-h-dvh grid grid-rows-[auto,1fr] ${bodyClasses}`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
          storageKey="theme"
        >
          <ClientFontLoader
            locale={locale}
            direction={direction}
            fontClasses={fontClasses}
            bodyClasses={bodyClasses}
          />
          <NextIntlProviderWithFallback locale={locale} messages={messages}>
            <IntlErrorBoundary>
              <QueryProvider>
                <AuthProvider initialAuthSnapshot={initialAuthSnapshot}>
                  <FeedbackProvider
                    buildVersion={process.env.NEXT_PUBLIC_BUILD_VERSION}
                    locale={locale}
                  >
                    <FeedbackErrorBoundary>
                      <MotionProvider>
                        {/* EXPERT FIX ROUND 2: Only load analytics providers in production */}
                        {enableAnalytics ? (
                          <PostHogProvider>
                            <ClarityProvider>
                              <GA4LayoutProvider>
                                {enableDebugLogger && <HTTPRequestLogger />}
                                <ConditionalHeader locale={locale} />
                                <HydrationErrorBoundary>
                                  <div className="min-h-0">{children}</div>
                                </HydrationErrorBoundary>
                                {/* EXPERT FIX: Portal container inside provider scope to prevent context errors */}
                                <div id="portal-root" />
                                {/* Toast notifications - Milestone C */}
                                <Toaster />
                                {/* WhatsApp support button - only shows on marketing pages for Arabic locales */}
                                <WhatsAppMarketingOnly locale={locale} showHours={false} />
                                {/* Feedback Tab - user-initiated feedback (highest signal) */}
                                <FeedbackTab position="right" />
                              </GA4LayoutProvider>
                            </ClarityProvider>
                          </PostHogProvider>
                        ) : (
                          <>
                            {enableDebugLogger && <HTTPRequestLogger />}
                            <ConditionalHeader locale={locale} />
                            <HydrationErrorBoundary>
                              <div className="min-h-0">{children}</div>
                            </HydrationErrorBoundary>
                            <div id="portal-root" />
                            <Toaster />
                            <WhatsAppMarketingOnly locale={locale} showHours={false} />
                            {/* Feedback Tab - user-initiated feedback (highest signal) */}
                            <FeedbackTab position="right" />
                          </>
                        )}
                      </MotionProvider>
                    </FeedbackErrorBoundary>
                  </FeedbackProvider>
                </AuthProvider>
              </QueryProvider>
            </IntlErrorBoundary>
          </NextIntlProviderWithFallback>
        </ThemeProvider>
        {/* GA4 Analytics - Expert-corrected implementation, only in production */}
        {enableAnalytics && <GoogleAnalytics measurementId={process.env.NEXT_PUBLIC_GA_ID || ''} />}
        {/* Web-Vitals monitoring - production ready with unified architecture */}
        {/* <WebVitalsMonitor /> */}
      </body>
    </html>
  );
}
