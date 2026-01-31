import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Bundle analyzer for optimization
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

// Sentry configuration (conditionally applied)
const uploadSourcemaps = process.env.UPLOAD_SOURCEMAPS === 'true';
let withSentryConfig: any = (config: NextConfig) => config;
if (process.env.NODE_ENV !== 'development') {
  try {
    const { withSentryConfig: sentryPlugin } = require('@sentry/nextjs');
    const sentryWebpackPluginOptions = {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      widenClientFileUpload: true,
      disableLogger: true,
      sourcemaps: {
        // Only generate+upload source maps when explicitly opted in.
        // Without this, Sentry forces devtool: 'hidden-source-map' on every build,
        // adding ~1-2 min to compilation even when maps are never uploaded.
        disable: !uploadSourcemaps,
        deleteSourcemapsAfterUpload: true,
      },
    };
    withSentryConfig = (config: NextConfig) => sentryPlugin(config, sentryWebpackPluginOptions);
  } catch (e) {
    console.warn('Sentry plugin not found, skipping Sentry configuration');
  }
}

const nextConfig: NextConfig = {
  /* config options here */

  // MONOREPO CRITICAL: Do not change without reading this.
  // In a pnpm workspace, Next.js/Turbopack needs to know the monorepo root (../../)
  // so it can resolve symlinked dependencies in node_modules/.pnpm.
  // Without this, builds fail with "couldn't find next/package.json" errors.
  // Both outputFileTracingRoot and turbopack.root MUST point to the same path.
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory
  outputFileTracingRoot: path.resolve(__dirname, '../..'),

  // Exclude non-runtime directories from serverless function traces.
  // Reduces trace phase (~56s) and traced output size.
  outputFileTracingExcludes: {
    '/*': [
      'docs/**',
      'scripts/**',
      'tests/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      'legacy-for-deletion/**',
      'packages-idea-was-not-used/**',
    ],
  },

  // Only generate browser source maps when explicitly uploading (e.g., Sentry release build).
  // Saves ~1–2 min by not generating .map files that nobody consumes.
  productionBrowserSourceMaps: process.env.UPLOAD_SOURCEMAPS === 'true',

  // SEO: Normalize URLs to prevent duplicate content issues
  trailingSlash: false, // Canonical URLs without trailing slashes
  skipTrailingSlashRedirect: false, // Let Next.js handle trailing slash normalization

  // Type checking runs in pre-commit hooks and CI (npm run type-check).
  // Skipping during build saves ~2.5 min. CI must enforce type-check as a required merge gate.
  typescript: {
    ignoreBuildErrors: true,
  },

  // Externalize server-side packages that cause bundling issues
  serverExternalPackages: ['@opentelemetry/instrumentation'],

  // SWC-based console removal (replaces babel-plugin-transform-remove-console)
  compiler: {
    removeConsole: {
      exclude: ['error', 'warn'],
    },
  },

  // React Compiler — auto-memoizes components, eliminates unnecessary re-renders
  reactCompiler: true,

  // Experimental features
  experimental: {
    // Optimize imports for large packages to reduce build time and bundle size
    optimizePackageImports: ['lucide-react', 'date-fns', 'sonner', 'recharts'],
  },

  // MONOREPO CRITICAL: Must match outputFileTracingRoot above. See comment there.
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },

  // SEO & redirect configuration to fix Google Search Console "Duplicate without user-selected canonical"
  async redirects() {
    const WWW_DOMAIN = 'www.sheenapps.com'

    return [
      // 1. Force www subdomain (match Google Search Console property)
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'sheenapps.com' }],
        destination: `https://${WWW_DOMAIN}/:path*`,
        permanent: true,
      },

      // 2. Canonical locale redirects: Root (/) is canonical English
      // NOTE: Removed /en/* -> /* redirects as they break i18n routing
      // The middleware handles locale prefixes properly

      // 3. Collapse fr-ma into fr (unless truly regionally different)
      // TODO: If you want to keep fr-ma, ensure strong regional differences (currency, examples, etc.)
      {
        source: '/fr-ma',
        destination: '/fr',
        permanent: true,
      },
      {
        source: '/fr-ma/:path*',
        destination: '/fr/:path*',
        permanent: true,
      },

      // 4. Legacy auth routes (existing)
      {
        source: '/:locale/auth/reset-password',
        destination: '/:locale/auth/reset',
        permanent: true,
      },

      // 5. Trailing slash cleanup - simplified per expert recommendation
      {
        source: '/:path+/',
        destination: '/:path+',
        permanent: true,
      },

      // 6. Quick entry: /build → locale builder
      // REMOVED: These redirects are handled by proxy.ts with locale-aware logic
      // The config-level redirects were always sending to /en, ignoring user's locale
    ]
  },

  // Optimize images for different regions
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Enable compression for better performance in emerging markets
  compress: true,

  // Add security and cache headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      },
      // Cache static assets for 1 year
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
      // Cache built assets (JS, CSS) for 1 year
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
      // Cache images for 1 week
      {
        source: '/:path*.(jpg|jpeg|png|gif|ico|svg|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400'
          }
        ]
      },
      // IMPORTANT: Admin API routes should NEVER be cached
      // They handle sensitive data and need fresh auth checks
      {
        source: '/api/admin/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          },
          {
            key: 'Expires',
            value: '0'
          }
        ]
      },
      // Cache non-admin API routes for 5 minutes with stale-while-revalidate
      {
        source: '/api/:path((?!admin).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, stale-while-revalidate=60'
          }
        ]
      },
      // Cache HTML pages for 1 hour with stale-while-revalidate
      // IMPORTANT: This should not match API routes
      // EXPERT FIX: Disable HTML caching in development to prevent billing success page 404
      ...(process.env.NODE_ENV !== 'development' ? [{
        source: '/:locale((?!api).*)*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400'
          }
        ]
      }] : []),
      // Cache esbuild WASM file for 1 year (immutable)
      // {
      //   source: '/esbuild.wasm',
      //   headers: [
      //     {
      //       key: 'Cache-Control',
      //       value: 'public, immutable, max-age=31536000'
      //     }
      //   ]
      // },
      // Cache compiled components for 1 year (immutable)
      {
        source: '/compiled/:path*.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, immutable, max-age=31536000'
          }
        ]
      }
    ]
  }
};

// Build the config chain
const composedConfig = withNextIntl(withSentryConfig(withBundleAnalyzer(nextConfig)));

export default composedConfig;
