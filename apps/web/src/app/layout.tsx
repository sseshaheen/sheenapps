import "@/styles/workspace.css"; // EXPERT FIX: Ensure workspace utilities ship to production
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: 'hsl(var(--bg))', // Use design system background
  viewportFit: 'cover', // Essential for devices with notches/home indicators
};

export const metadata: Metadata = {
  // Expert recommendation: Set metadataBase to prevent relative URL edge cases
  metadataBase: new URL('https://www.sheenapps.com'),

  title: "SheenApps - Your Tech Team",
  description: "Build your business in 5 minutes. Add features in minutes. Real humans on standby. We're not just a builder, we're your permanent tech department.",
  keywords: ["app builder", "no-code", "startup", "tech team", "AI builder", "rapid development", "business automation", "web development", "mobile apps"],
  authors: [{ name: "SheenApps" }],
  creator: "SheenApps",
  publisher: "SheenApps",

  //Open Graph
  openGraph: {
    title: "SheenApps - Your Tech Team",
    description: "Build your business in 5 minutes. Add features in minutes. Real humans on standby. We're not just a builder, we're your permanent tech department.",
    type: "website",
    locale: "en_US",
    url: "https://www.sheenapps.com", // Match canonical domain
    siteName: "SheenApps",
    images: [
      {
        url: "https://www.sheenapps.com/og-image.png",
        width: 1536,
        height: 1024,
        alt: "SheenApps - Your Tech Team. AI + Humans",
      }
    ],
  },

  // Twitter
  twitter: {
    card: "summary_large_image",
    title: "SheenApps - Your Tech Team",
    description: "Build your business in 5 minutes. Add features in minutes. Real humans on standby. We're not just a builder, we're your permanent tech department.",
    images: ["https://www.sheenapps.com/og-image.png"],
    creator: "@sheenapps",
    site: "@sheenapps",
  },

  // Additional SEO
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

  // Search Console Verification
  // IMPORTANT: Replace these placeholders with actual verification codes from:
  // - Google: https://search.google.com/search-console
  // - Bing: https://www.bing.com/webmasters
  // - Yandex: https://webmaster.yandex.com
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION || '',
    other: {
      'msvalidate.01': process.env.NEXT_PUBLIC_BING_VERIFICATION || '',
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Note: The [locale] routes provide their own html and body tags
  // But admin routes need html and body tags from here
  // Next.js will handle the duplicate prevention automatically
  return children;
}
