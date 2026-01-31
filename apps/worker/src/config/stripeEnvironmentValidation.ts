/**
 * Stripe Environment Validation
 *
 * Validates all required Stripe-related environment variables with fail-fast behavior.
 * Ensures production-ready configuration and prevents runtime errors from missing credentials.
 *
 * Security Features:
 * - Validates key formats to prevent configuration errors
 * - Fails fast on startup to prevent partial functionality
 * - Provides clear error messages for missing configuration
 * - Supports webhook secret rotation with primary/backup
 */

export interface StripeEnvironmentConfig {
  secretKey: string;
  primaryWebhookSecret: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  backupWebhookSecret?: string | undefined;
  prices: {
    liteUSD: string;
    starterUSD: string;
    builderUSD: string;
    proUSD: string;
    ultraUSD: string;
  };
  isLiveMode: boolean;
}

/**
 * Validates all Stripe environment variables and returns validated configuration
 * Throws error and exits process if validation fails
 */
export function validateStripeEnvironment(): StripeEnvironmentConfig {
  console.log('🔍 Validating Stripe environment configuration...');

  // Required environment variables for Stripe functionality
  const required = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET_PRIMARY',
    'STRIPE_PRICE_LITE_USD',
    'STRIPE_PRICE_STARTER_USD',
    'STRIPE_PRICE_BUILDER_USD',
    'STRIPE_PRICE_PRO_USD',
    'STRIPE_PRICE_ULTRA_USD'
  ];

  // Check for missing required variables
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ FATAL: Missing required Stripe environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n💡 Required Stripe configuration:');
    console.error('   STRIPE_SECRET_KEY=sk_test_... or sk_live_...');
    console.error('   STRIPE_WEBHOOK_SECRET_PRIMARY=whsec_...');
    console.error('   STRIPE_WEBHOOK_SECRET_BACKUP=whsec_... (optional)');
    console.error('   STRIPE_PRICE_LITE_USD=price_...');
    console.error('   STRIPE_PRICE_STARTER_USD=price_...');
    console.error('   STRIPE_PRICE_BUILDER_USD=price_...');
    console.error('   STRIPE_PRICE_PRO_USD=price_...');
    console.error('   STRIPE_PRICE_ULTRA_USD=price_...');
    console.error('\n📝 Add these to your .env file and restart the worker');
    process.exit(1);
  }

  // Validate Stripe secret key format
  const secretKey = process.env.STRIPE_SECRET_KEY!;
  if (!secretKey.startsWith('sk_')) {
    console.error('❌ FATAL: STRIPE_SECRET_KEY must start with "sk_"');
    console.error('   Example: sk_test_... (test mode) or sk_live_... (live mode)');
    console.error('   Current value does not match expected format');
    process.exit(1);
  }

  // Validate webhook secret format
  const primaryWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET_PRIMARY!;
  if (!primaryWebhookSecret.startsWith('whsec_')) {
    console.error('❌ FATAL: STRIPE_WEBHOOK_SECRET_PRIMARY must start with "whsec_"');
    console.error('   Get this from your Stripe Dashboard > Webhooks > [endpoint] > Signing secret');
    console.error('   Example: whsec_1234...');
    process.exit(1);
  }

  // Validate backup webhook secret format (optional)
  const backupWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET_BACKUP;
  if (backupWebhookSecret && !backupWebhookSecret.startsWith('whsec_')) {
    console.error('❌ FATAL: STRIPE_WEBHOOK_SECRET_BACKUP must start with "whsec_" if provided');
    console.error('   This is optional but useful for webhook secret rotation');
    process.exit(1);
  }

  // Validate price ID formats
  const prices = {
    liteUSD: process.env.STRIPE_PRICE_LITE_USD!,
    starterUSD: process.env.STRIPE_PRICE_STARTER_USD!,
    builderUSD: process.env.STRIPE_PRICE_BUILDER_USD!,
    proUSD: process.env.STRIPE_PRICE_PRO_USD!,
    ultraUSD: process.env.STRIPE_PRICE_ULTRA_USD!
  };

  // Check all price IDs have correct format
  Object.entries(prices).forEach(([planName, priceId]) => {
    if (!priceId.startsWith('price_')) {
      console.error(`❌ FATAL: STRIPE_PRICE_${planName.toUpperCase().replace('USD', '_USD')} must start with "price_"`);
      console.error(`   Current value: ${priceId}`);
      console.error(`   Example: price_1234...`);
      console.error(`   Get this from Stripe Dashboard > Products > [product] > Pricing > Price ID`);
      process.exit(1);
    }
  });

  // Determine if we're in live mode
  const isLiveMode = secretKey.startsWith('sk_live_');

  // Production safety checks
  if (isLiveMode) {
    console.log('🔴 LIVE MODE DETECTED - Production Stripe configuration');

    // Ensure we have proper production configuration
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️  WARNING: Live Stripe keys detected but NODE_ENV is not "production"');
      console.warn('   This may be intentional for staging, but verify your configuration');
    }

    // Check for test price IDs in live mode (common mistake)
    Object.entries(prices).forEach(([planName, priceId]) => {
      if (priceId.includes('test')) {
        console.error(`❌ FATAL: Test price ID detected in live mode for ${planName}`);
        console.error(`   Price ID: ${priceId}`);
        console.error(`   Live mode requires live price IDs, not test ones`);
        process.exit(1);
      }
    });

  } else {
    console.log('🟡 TEST MODE - Development/testing Stripe configuration');
  }

  // Optional: Validate webhook endpoint URL if provided
  const webhookEndpoint = process.env.STRIPE_WEBHOOK_ENDPOINT_URL;
  if (webhookEndpoint) {
    try {
      new URL(webhookEndpoint);
      console.log(`📡 Webhook endpoint configured: ${webhookEndpoint}`);
    } catch (error) {
      console.error('❌ FATAL: STRIPE_WEBHOOK_ENDPOINT_URL is not a valid URL');
      console.error(`   Current value: ${webhookEndpoint}`);
      console.error(`   Example: https://worker.yourdomain.com/v1/payments/webhooks`);
      process.exit(1);
    }
  }

  // Success - log configuration summary
  console.log('✅ Stripe environment validation passed');
  console.log(`🔧 Mode: ${isLiveMode ? 'LIVE' : 'TEST'}`);
  console.log(`🎯 Plans configured: Lite, Starter, Builder, Pro, Ultra (USD)`);
  console.log(`🔐 Webhook secrets: Primary${backupWebhookSecret ? ' + Backup' : ' only'}`);
  if (webhookEndpoint) {
    console.log(`📡 Webhook URL: ${webhookEndpoint}`);
  }

  // Return validated configuration object
  return {
    secretKey,
    primaryWebhookSecret,
    backupWebhookSecret,
    prices,
    isLiveMode
  };
}

/**
 * Get Stripe configuration (assumes validation already passed)
 * Use this to access validated Stripe config throughout the application
 */
export function getStripeConfig(): StripeEnvironmentConfig {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    primaryWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET_PRIMARY!,
    backupWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET_BACKUP,
    prices: {
      liteUSD: process.env.STRIPE_PRICE_LITE_USD!,
      starterUSD: process.env.STRIPE_PRICE_STARTER_USD!,
      builderUSD: process.env.STRIPE_PRICE_BUILDER_USD!,
      proUSD: process.env.STRIPE_PRICE_PRO_USD!,
      ultraUSD: process.env.STRIPE_PRICE_ULTRA_USD!
    },
    isLiveMode: process.env.STRIPE_SECRET_KEY!.startsWith('sk_live_')
  };
}

/**
 * Utility to check if Stripe is properly configured
 * Returns true if all required variables are present (doesn't validate formats)
 */
export function isStripeConfigured(): boolean {
  const required = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET_PRIMARY',
    'STRIPE_PRICE_LITE_USD',
    'STRIPE_PRICE_STARTER_USD',
    'STRIPE_PRICE_BUILDER_USD',
    'STRIPE_PRICE_PRO_USD',
    'STRIPE_PRICE_ULTRA_USD'
  ];

  return required.every(key => Boolean(process.env[key]));
}

/**
 * Get all configured price IDs as a Set for security validation
 * Used by payment provider to validate against price manipulation
 */
export function getAllowedPriceIds(): Set<string> {
  if (!isStripeConfigured()) {
    throw new Error('Stripe not configured - call validateStripeEnvironment() first');
  }

  return new Set([
    process.env.STRIPE_PRICE_LITE_USD!,
    process.env.STRIPE_PRICE_STARTER_USD!,
    process.env.STRIPE_PRICE_BUILDER_USD!,
    process.env.STRIPE_PRICE_PRO_USD!,
    process.env.STRIPE_PRICE_ULTRA_USD!
    // Add additional currencies/plans here as needed
    // process.env.STRIPE_PRICE_LITE_EUR!,
    // process.env.STRIPE_PRICE_STARTER_EUR!,
  ]);
}
