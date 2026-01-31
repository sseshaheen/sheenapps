import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

/**
 * E2E Mode Middleware
 *
 * Enables deterministic behavior for Playwright E2E tests:
 * - Activated via X-E2E-Mode header when E2E_MODE=true env var is set
 * - Tags resources with e2e_run_id for cleanup
 * - Provides helpers for fixture responses and fast build paths
 *
 * Activation Contract:
 * - Server must have E2E_MODE=true environment variable
 * - Request must include X-E2E-Mode: true header (lowercased by Node)
 * - Request should include X-E2E-Run-Id header for resource tagging
 */

declare module 'fastify' {
  interface FastifyRequest {
    isE2ERequest: boolean;
    e2eRunId: string | null;
  }
}

/**
 * Known fast build project ideas that trigger deterministic builds
 */
export const FAST_BUILD_PROJECTS: Record<
  string,
  {
    buildTime: number;
    alwaysSucceeds: boolean;
    error?: string;
  }
> = {
  'e2e-coffee-shop': { buildTime: 5000, alwaysSucceeds: true },
  'e2e-failing-app': {
    buildTime: 2000,
    alwaysSucceeds: false,
    error: 'Invalid configuration: Missing required field "name" in config',
  },
  'e2e-simple-landing': { buildTime: 3000, alwaysSucceeds: true },
};

/**
 * Deterministic AI fixture responses for chat
 */
export const AI_FIXTURES: Record<
  string,
  {
    response: string;
    streamDelay: number;
  }
> = {
  'improve-landing-page': {
    response: `Here are 3 suggestions to improve your landing page:

1. **Add a clear call-to-action (CTA)** - Make your primary button stand out with contrasting colors and compelling text like "Get Started Free" instead of just "Submit".

2. **Optimize for mobile** - Ensure your layout is responsive and buttons are easily tappable on smaller screens.

3. **Include social proof** - Add customer testimonials, trust badges, or usage statistics to build credibility.

Would you like me to implement any of these improvements?`,
    streamDelay: 50,
  },
  'help-with-styling': {
    response: `I'd be happy to help with styling! Here are some improvements:

1. **Typography** - Use a clear hierarchy with distinct heading sizes
2. **Spacing** - Add consistent padding and margins
3. **Colors** - Ensure good contrast for accessibility

What specific styling changes would you like me to make?`,
    streamDelay: 50,
  },
};

/**
 * Fast migration domains with deterministic verification results
 */
export const FAST_MIGRATION_DOMAINS: Record<
  string,
  {
    analysisTime: number;
    transformTime: number;
    gates: {
      typescript: { status: string; errors?: string[]; reason?: string };
      build: { status: string; warnings?: string[]; reason?: string };
      accessibility: { status: string; issues?: Array<{ type: string; file: string; line?: number; message?: string }>; reason?: string };
      seo: { status: string; issues?: string[]; reason?: string };
    };
    assets?: {
      processed: number;
      skipped: number;
      failed: number;
      skippedReasons?: Array<{ url: string; reason: string }>;
    };
  }
> = {
  'e2e-clean-site.test': {
    analysisTime: 2000,
    transformTime: 3000,
    gates: {
      typescript: { status: 'pass', errors: [] },
      build: { status: 'pass', warnings: [] },
      accessibility: { status: 'pass', issues: [] },
      seo: { status: 'pass', issues: [] },
    },
    assets: {
      processed: 5,
      skipped: 0,
      failed: 0,
    },
  },
  'e2e-a11y-issues.test': {
    analysisTime: 2000,
    transformTime: 3000,
    gates: {
      typescript: { status: 'pass', errors: [] },
      build: { status: 'pass', warnings: [] },
      accessibility: {
        status: 'pass', // Advisory, won't fail
        issues: [
          { type: 'missing-alt', file: 'app/page.tsx', line: 15 },
          { type: 'input-missing-label', file: 'app/contact/page.tsx', line: 42 },
          { type: 'heading-skip', file: 'app/about/page.tsx', message: 'h1 -> h3' },
        ],
      },
      seo: { status: 'pass', issues: [] },
    },
  },
  'e2e-ts-failing.test': {
    analysisTime: 2000,
    transformTime: 3000,
    gates: {
      typescript: {
        status: 'fail',
        errors: ['page.tsx(10,5): TS2322: Type string not assignable to number'],
      },
      build: { status: 'skip', reason: 'Previous blocking gate failed' },
      accessibility: { status: 'skip', reason: 'Previous blocking gate failed' },
      seo: { status: 'skip', reason: 'Previous blocking gate failed' },
    },
  },
  'e2e-large-assets.test': {
    analysisTime: 2000,
    transformTime: 3000,
    gates: {
      typescript: { status: 'pass', errors: [] },
      build: { status: 'pass', warnings: [] },
      accessibility: { status: 'pass', issues: [] },
      seo: { status: 'pass', issues: [] },
    },
    assets: {
      processed: 3,
      skipped: 2,
      failed: 0,
      skippedReasons: [
        { url: 'https://shutterstock.com/image.jpg', reason: 'Blocklisted domain' },
        { url: 'https://example.com/huge.png', reason: 'File too large: 12.5MB' },
      ],
    },
  },
};

/**
 * Feature flags pinned for E2E tests (no experiments)
 */
export const E2E_FEATURE_FLAGS: Record<string, boolean> = {
  newBuilder: true,
  aiRecommendations: true,
  persistentChat: true,
  websiteMigration: true,
  advisorNetwork: true,
};

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Check if E2E mode is enabled at the server level
 */
export function isE2EModeEnabled(): boolean {
  return process.env.E2E_MODE === 'true';
}

/**
 * Check if a specific request is an E2E request
 */
export function isE2ERequest(req: FastifyRequest): boolean {
  return req.isE2ERequest === true;
}

/**
 * Get the E2E run ID from the request
 */
export function getE2ERunId(req: FastifyRequest): string | null {
  return req.e2eRunId ?? null;
}

/**
 * Tag metadata for E2E cleanup
 */
export function tagForE2ECleanup(
  req: FastifyRequest,
  metadata: Record<string, unknown> = {}
): Record<string, unknown> {
  if (!isE2ERequest(req)) {
    return metadata;
  }

  return {
    ...metadata,
    e2e_run_id: getE2ERunId(req),
    e2e_created_at: Date.now(),
  };
}

/**
 * Get fast build config if project idea matches
 */
export function getFastBuildConfig(
  req: FastifyRequest,
  projectIdea: string
): (typeof FAST_BUILD_PROJECTS)[string] | null {
  if (!isE2ERequest(req)) {
    return null;
  }

  // Check for exact match or partial match
  for (const [key, config] of Object.entries(FAST_BUILD_PROJECTS)) {
    if (projectIdea.includes(key)) {
      return config;
    }
  }

  return null;
}

/**
 * Get AI fixture response if prompt matches
 */
export function getAIFixture(
  req: FastifyRequest,
  prompt: string
): (typeof AI_FIXTURES)[string] | null {
  if (!isE2ERequest(req)) {
    return null;
  }

  const promptLower = prompt.toLowerCase();

  for (const [key, fixture] of Object.entries(AI_FIXTURES)) {
    if (promptLower.includes(key.replace(/-/g, ' '))) {
      return fixture;
    }
  }

  return null;
}

/**
 * Get fast migration config if domain matches
 */
export function getFastMigrationConfig(
  req: FastifyRequest,
  domain: string
): (typeof FAST_MIGRATION_DOMAINS)[string] | null {
  if (!isE2ERequest(req)) {
    return null;
  }

  return FAST_MIGRATION_DOMAINS[domain] ?? null;
}

/**
 * Get pinned feature flags for E2E
 */
export function getE2EFeatureFlags(
  req: FastifyRequest
): Record<string, boolean> | null {
  if (!isE2ERequest(req)) {
    return null;
  }

  return { ...E2E_FEATURE_FLAGS };
}

// ============================================================================
// Fastify Plugin
// ============================================================================

/**
 * E2E Mode Fastify Plugin
 *
 * Decorates requests with E2E properties and sets them based on headers.
 * Must be registered before routes that need E2E detection.
 */
export const e2eModePlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate request with E2E properties (required for TypeScript + Fastify)
  fastify.decorateRequest('isE2ERequest', false);
  fastify.decorateRequest('e2eRunId', null);

  fastify.addHook('onRequest', async (request) => {
    // Node/Fastify headers are lowercased
    const e2eHeader = request.headers['x-e2e-mode'];
    const runIdHeader = request.headers['x-e2e-run-id'];

    const enabled = isE2EModeEnabled() && e2eHeader === 'true';

    request.isE2ERequest = enabled;
    request.e2eRunId =
      enabled && typeof runIdHeader === 'string' && runIdHeader.trim()
        ? runIdHeader.trim()
        : null;
  });
};

// Export as Fastify plugin with metadata
export default fp(e2eModePlugin, { name: 'e2e-mode' });
