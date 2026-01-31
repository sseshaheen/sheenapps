import { faker } from '@faker-js/faker'
import type { User } from '@supabase/supabase-js'

// User factory
export const userFactory = {
  create: (overrides?: Partial<User>): User => ({
    id: faker.string.uuid(),
    email: faker.internet.email(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    role: 'authenticated',
    ...overrides
  }),
  
  createWithProfile: (overrides?: any) => ({
    ...userFactory.create(overrides),
    profile: {
      id: faker.string.uuid(),
      display_name: faker.person.fullName(),
      avatar_url: faker.image.avatar(),
      ...overrides?.profile
    }
  })
}

// Project factory
export const projectFactory = {
  create: (overrides?: any) => ({
    id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    name: faker.company.name(),
    description: faker.lorem.sentence(),
    template_id: faker.helpers.arrayElement(['restaurant', 'salon', 'fitness', 'retail']),
    logo: faker.image.url(),
    favicon: faker.image.url(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_public: false,
    content: {},
    style_config: {},
    seo_config: {},
    ...overrides
  }),
  
  createMultiple: (count: number, overrides?: any) => {
    return Array.from({ length: count }, () => projectFactory.create(overrides))
  }
}

// Subscription factory
export const subscriptionFactory = {
  create: (overrides?: any) => ({
    id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    stripe_customer_id: `cus_${faker.string.alphanumeric(14)}`,
    stripe_subscription_id: `sub_${faker.string.alphanumeric(14)}`,
    plan_id: faker.helpers.arrayElement(['free', 'pro', 'business']),
    status: faker.helpers.arrayElement(['active', 'trialing', 'past_due', 'canceled']),
    current_period_start: faker.date.recent().toISOString(),
    current_period_end: faker.date.future().toISOString(),
    cancel_at_period_end: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }),
  
  createActive: (planId: string = 'pro', overrides?: any) => 
    subscriptionFactory.create({
      plan_id: planId,
      status: 'active',
      ...overrides
    })
}

// Translation factory
export const translationFactory = {
  create: (locale: string, overrides?: any) => ({
    navigation: {
      howItWorks: `How It Works (${locale})`,
      pricing: `Pricing (${locale})`,
      about: `About (${locale})`,
      contact: `Contact (${locale})`,
      login: `Login (${locale})`,
      signup: `Sign Up (${locale})`,
      dashboard: `Dashboard (${locale})`,
      ...overrides?.navigation
    },
    hero: {
      badge: `AI-Powered (${locale})`,
      title: `Build Your Website (${locale})`,
      subtitle: `Create stunning websites (${locale})`,
      floatingBadges: {
        aiPowered: `AI-Powered (${locale})`,
        responsive: `Responsive (${locale})`,
        seoOptimized: `SEO Optimized (${locale})`
      },
      trustBar: {
        businesses: `10,000+ businesses (${locale})`,
        rating: `4.9/5 rating (${locale})`
      },
      ...overrides?.hero
    },
    common: {
      loading: `Loading... (${locale})`,
      error: `Error (${locale})`,
      success: `Success (${locale})`,
      cancel: `Cancel (${locale})`,
      save: `Save (${locale})`,
      delete: `Delete (${locale})`,
      ...overrides?.common
    },
    ...overrides
  }),
  
  createComplete: (locale: string) => {
    // Create a complete translation object matching the actual structure
    const isRTL = ['ar', 'ar-eg', 'ar-sa', 'ar-ae'].includes(locale)
    return {
      locale,
      direction: isRTL ? 'rtl' : 'ltr',
      ...translationFactory.create(locale)
    }
  }
}

// Builder content factory
export const builderContentFactory = {
  createSection: (overrides?: any) => ({
    id: faker.string.uuid(),
    type: faker.helpers.arrayElement(['hero', 'features', 'testimonials', 'cta', 'footer']),
    content: {
      title: faker.lorem.sentence(),
      subtitle: faker.lorem.paragraph(),
      buttons: [],
      ...overrides?.content
    },
    style: {
      backgroundColor: faker.color.rgb(),
      textColor: faker.color.rgb(),
      ...overrides?.style
    },
    ...overrides
  }),
  
  createPage: (sectionCount: number = 5) => ({
    sections: Array.from({ length: sectionCount }, () => 
      builderContentFactory.createSection()
    )
  })
}

// AI generation factory
export const aiGenerationFactory = {
  createPrompt: (overrides?: any) => ({
    business_type: faker.helpers.arrayElement(['restaurant', 'salon', 'fitness', 'retail']),
    business_name: faker.company.name(),
    target_audience: faker.lorem.words(3),
    unique_selling_points: [
      faker.lorem.sentence(),
      faker.lorem.sentence(),
      faker.lorem.sentence()
    ],
    ...overrides
  }),
  
  createResponse: (overrides?: any) => ({
    sections: builderContentFactory.createPage().sections,
    metadata: {
      generation_time: faker.number.int({ min: 1000, max: 5000 }),
      model: 'gpt-4',
      tokens_used: faker.number.int({ min: 1000, max: 10000 })
    },
    ...overrides
  })
}

// Event factory
export const eventFactory = {
  create: (eventType: string, overrides?: any) => ({
    type: eventType,
    timestamp: Date.now(),
    data: overrides?.data || {},
    metadata: {
      session_id: faker.string.uuid(),
      user_id: faker.string.uuid(),
      ...overrides?.metadata
    }
  }),
  
  createBuilderEvent: (action: string, data?: any) => 
    eventFactory.create(`builder.${action}`, { data }),
    
  createDashboardEvent: (action: string, data?: any) =>
    eventFactory.create(`dashboard.${action}`, { data })
}

// Billing factory for comprehensive billing tests
export const billingFactory = {
  // Customer factory
  createCustomer: (overrides?: any) => ({
    id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    stripe_customer_id: `cus_${faker.string.alphanumeric(14)}`,
    email: faker.internet.email(),
    billing_address: {
      line1: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      postal_code: faker.location.zipCode(),
      country: faker.location.countryCode()
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }),

  // Plan limits factory
  createPlanLimits: (planName: 'free' | 'pro' | 'business' = 'free', overrides?: any) => {
    const planConfigs = {
      free: {
        plan_name: 'free',
        max_ai_generations_per_month: 5,
        max_exports_per_month: 1,
        max_projects: 3,
        max_collaborators: 0,
        priority_support: false,
        custom_domain: false
      },
      pro: {
        plan_name: 'pro',
        max_ai_generations_per_month: 100,
        max_exports_per_month: 10,
        max_projects: -1, // unlimited
        max_collaborators: 5,
        priority_support: true,
        custom_domain: true
      },
      business: {
        plan_name: 'business',
        max_ai_generations_per_month: -1, // unlimited
        max_exports_per_month: -1,
        max_projects: -1,
        max_collaborators: -1,
        priority_support: true,
        custom_domain: true
      }
    }

    return {
      id: faker.string.uuid(),
      ...planConfigs[planName],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    }
  },

  // Usage tracking factory
  createUsageTracking: (overrides?: any) => {
    const currentDate = new Date()
    const periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    
    return {
      id: faker.string.uuid(),
      user_id: faker.string.uuid(),
      metric_name: faker.helpers.arrayElement(['ai_generations', 'exports', 'projects_created']),
      metric_value: faker.number.int({ min: 0, max: 100 }),
      period_start: periodStart.toISOString(),
      period_end: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString(),
      metadata: {
        feature: faker.helpers.arrayElement(['hero_generation', 'section_modification', 'bulk_export']),
        model: faker.helpers.arrayElement(['gpt-4', 'gpt-3.5-turbo', 'claude-3'])
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    }
  },

  // Transaction factory
  createTransaction: (overrides?: any) => ({
    id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    gateway: faker.helpers.arrayElement(['stripe', 'cashier']),
    gateway_transaction_id: `ch_${faker.string.alphanumeric(14)}`,
    status: faker.helpers.arrayElement(['pending', 'completed', 'failed', 'canceled']),
    amount_cents: faker.number.int({ min: 999, max: 99999 }),
    currency: faker.helpers.arrayElement(['USD', 'EUR', 'GBP']),
    plan_name: faker.helpers.arrayElement(['free', 'pro', 'business']),
    product_type: faker.helpers.arrayElement(['subscription', 'one_time', 'addon']),
    transaction_date: faker.date.recent().toISOString(),
    country: faker.location.countryCode(),
    utm_source: faker.helpers.arrayElement(['google', 'facebook', 'twitter', 'direct']),
    utm_medium: faker.helpers.arrayElement(['cpc', 'organic', 'social', 'email']),
    utm_campaign: faker.lorem.slug(),
    metadata: {
      subscription_id: `sub_${faker.string.alphanumeric(14)}`,
      customer_id: `cus_${faker.string.alphanumeric(14)}`,
      payment_intent_id: `pi_${faker.string.alphanumeric(14)}`
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }),

  // Payment factory
  createPayment: (overrides?: any) => ({
    id: faker.string.uuid(),
    customer_id: faker.string.uuid(),
    stripe_payment_intent_id: `pi_${faker.string.alphanumeric(14)}`,
    amount: faker.number.int({ min: 999, max: 99999 }),
    currency: faker.helpers.arrayElement(['USD', 'EUR', 'GBP']),
    status: faker.helpers.arrayElement(['succeeded', 'failed', 'pending', 'canceled']),
    stripe_invoice_id: `in_${faker.string.alphanumeric(14)}`,
    description: faker.lorem.sentence(),
    failure_code: null,
    failure_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }),

  // Bonus factory
  createBonus: (overrides?: any) => ({
    id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    metric: faker.helpers.arrayElement(['ai_generations', 'exports']),
    amount: faker.number.int({ min: 5, max: 50 }),
    consumed: faker.number.int({ min: 0, max: 10 }),
    reason: faker.helpers.arrayElement(['signup', 'referral', 'social_share', 'profile_complete']),
    expires_at: faker.date.future().toISOString(),
    redeemed_at: faker.datatype.boolean() ? faker.date.recent().toISOString() : null,
    expiry_notified: false,
    archived: false,
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }),

  // Webhook dead letter factory
  createWebhookDeadLetter: (overrides?: any) => ({
    id: faker.string.uuid(),
    gateway: faker.helpers.arrayElement(['stripe', 'cashier']),
    event_type: faker.helpers.arrayElement([
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'invoice.payment_succeeded',
      'invoice.payment_failed'
    ]),
    payload: {
      id: `evt_${faker.string.alphanumeric(14)}`,
      type: 'checkout.session.completed',
      data: { object: { id: `cs_${faker.string.alphanumeric(14)}` } }
    },
    error_message: faker.lorem.sentence(),
    retry_count: faker.number.int({ min: 0, max: 3 }),
    max_retries: 3,
    retry_history: [
      {
        timestamp: faker.date.recent(),
        error: faker.lorem.sentence(),
        status_code: faker.helpers.arrayElement([500, 502, 503, 504])
      }
    ],
    last_retry_at: faker.date.recent().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides
  }),

  // Stripe webhook event factory
  createStripeWebhookEvent: (eventType: string, data: any = {}, overrides?: any) => ({
    id: `evt_${faker.string.alphanumeric(14)}`,
    object: 'event',
    api_version: '2025-05-28.basil',
    created: Math.floor(Date.now() / 1000),
    type: eventType,
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${faker.string.alphanumeric(14)}`,
      idempotency_key: null
    },
    data: {
      object: data
    },
    ...overrides
  }),

  // Stripe checkout session factory
  createStripeCheckoutSession: (overrides?: any) => ({
    id: `cs_${faker.string.alphanumeric(14)}`,
    object: 'checkout.session',
    amount_total: faker.number.int({ min: 999, max: 99999 }),
    currency: 'usd',
    customer: `cus_${faker.string.alphanumeric(14)}`,
    customer_email: faker.internet.email(),
    metadata: {
      user_id: faker.string.uuid(),
      plan_name: faker.helpers.arrayElement(['pro', 'business'])
    },
    payment_intent: `pi_${faker.string.alphanumeric(14)}`,
    subscription: `sub_${faker.string.alphanumeric(14)}`,
    customer_details: {
      address: {
        country: faker.location.countryCode(),
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        postal_code: faker.location.zipCode()
      },
      email: faker.internet.email(),
      name: faker.person.fullName(),
      phone: faker.phone.number(),
      tax_exempt: 'none',
      tax_ids: []
    },
    payment_status: 'paid',
    status: 'complete',
    mode: 'subscription',
    created: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    livemode: false,
    url: null,
    ...overrides
  }),

  // Stripe subscription factory
  createStripeSubscription: (overrides?: any) => ({
    id: `sub_${faker.string.alphanumeric(14)}`,
    object: 'subscription',
    cancel_at_period_end: false,
    canceled_at: null,
    created: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days
    current_period_start: Math.floor(Date.now() / 1000),
    customer: `cus_${faker.string.alphanumeric(14)}`,
    items: {
      object: 'list',
      data: [{
        id: `si_${faker.string.alphanumeric(14)}`,
        object: 'subscription_item',
        created: Math.floor(Date.now() / 1000),
        metadata: {},
        price: {
          id: `price_${faker.string.alphanumeric(14)}`,
          object: 'price',
          active: true,
          billing_scheme: 'per_unit',
          created: Math.floor(Date.now() / 1000),
          currency: 'usd',
          livemode: false,
          lookup_key: null,
          metadata: {},
          nickname: null,
          product: `prod_${faker.string.alphanumeric(14)}`,
          recurring: {
            aggregate_usage: null,
            interval: 'month',
            interval_count: 1,
            usage_type: 'licensed'
          },
          tax_behavior: 'unspecified',
          tiers_mode: null,
          transform_quantity: null,
          type: 'recurring',
          unit_amount: faker.number.int({ min: 999, max: 99999 }),
          unit_amount_decimal: faker.number.int({ min: 999, max: 99999 }).toString()
        },
        quantity: 1,
        subscription: `sub_${faker.string.alphanumeric(14)}`,
        tax_rates: []
      }],
      has_more: false,
      total_count: 1,
      url: '/v1/subscription_items'
    },
    livemode: false,
    metadata: {
      user_id: faker.string.uuid(),
      plan_name: faker.helpers.arrayElement(['pro', 'business'])
    },
    status: faker.helpers.arrayElement(['active', 'trialing', 'past_due', 'canceled', 'incomplete']),
    trial_end: null,
    trial_start: null,
    currency: 'usd',
    ...overrides
  }),

  // Stripe invoice factory
  createStripeInvoice: (overrides?: any) => ({
    id: `in_${faker.string.alphanumeric(14)}`,
    object: 'invoice',
    amount_due: faker.number.int({ min: 999, max: 99999 }),
    amount_paid: faker.number.int({ min: 999, max: 99999 }),
    currency: 'usd',
    customer: `cus_${faker.string.alphanumeric(14)}`,
    description: faker.lorem.sentence(),
    lines: {
      object: 'list',
      data: [{
        id: `il_${faker.string.alphanumeric(14)}`,
        object: 'line_item',
        amount: faker.number.int({ min: 999, max: 99999 }),
        currency: 'usd',
        description: faker.lorem.sentence(),
        quantity: 1
      }],
      has_more: false,
      total_count: 1,
      url: '/v1/invoices/lines'
    },
    payment_intent: `pi_${faker.string.alphanumeric(14)}`,
    status: faker.helpers.arrayElement(['paid', 'open', 'draft', 'void']),
    subscription: `sub_${faker.string.alphanumeric(14)}`,
    created: Math.floor(Date.now() / 1000),
    ...overrides
  }),

  // Mock quota check scenarios
  createQuotaScenario: (scenario: 'under_limit' | 'at_limit' | 'over_limit' | 'unlimited', overrides?: any) => {
    const scenarios = {
      under_limit: {
        limit: 100,
        used: 25,
        remaining: 75,
        allowed: true,
        unlimited: false
      },
      at_limit: {
        limit: 100,
        used: 100,
        remaining: 0,
        allowed: false,
        unlimited: false
      },
      over_limit: {
        limit: 100,
        used: 150,
        remaining: 0,
        allowed: false,
        unlimited: false
      },
      unlimited: {
        limit: -1,
        used: 1000,
        remaining: -1,
        allowed: true,
        unlimited: true
      }
    }

    return {
      ...scenarios[scenario],
      bonusRemaining: faker.number.int({ min: 0, max: 50 }),
      totalRemaining: scenarios[scenario].unlimited ? -1 : scenarios[scenario].remaining + faker.number.int({ min: 0, max: 50 }),
      ...overrides
    }
  }
}

// Factories collection for easy import
export const factories = {
  user: userFactory,
  project: projectFactory,
  subscription: subscriptionFactory,
  translation: translationFactory,
  builderContent: builderContentFactory,
  aiGeneration: aiGenerationFactory,
  event: eventFactory,
  billing: billingFactory
}

// Type exports
export type TestUser = ReturnType<typeof userFactory.create>
export type TestProject = ReturnType<typeof projectFactory.create>
export type TestSubscription = ReturnType<typeof subscriptionFactory.create>
export type TestTranslation = ReturnType<typeof translationFactory.create>
export type TestSection = ReturnType<typeof builderContentFactory.createSection>
export type TestEvent = ReturnType<typeof eventFactory.create>
export type TestCustomer = ReturnType<typeof billingFactory.createCustomer>
export type TestPlanLimits = ReturnType<typeof billingFactory.createPlanLimits>
export type TestUsageTracking = ReturnType<typeof billingFactory.createUsageTracking>
export type TestTransaction = ReturnType<typeof billingFactory.createTransaction>
export type TestPayment = ReturnType<typeof billingFactory.createPayment>
export type TestBonus = ReturnType<typeof billingFactory.createBonus>
export type TestWebhookDeadLetter = ReturnType<typeof billingFactory.createWebhookDeadLetter>
export type TestStripeEvent = ReturnType<typeof billingFactory.createStripeWebhookEvent>
export type TestStripeSession = ReturnType<typeof billingFactory.createStripeCheckoutSession>
export type TestStripeSubscription = ReturnType<typeof billingFactory.createStripeSubscription>
export type TestStripeInvoice = ReturnType<typeof billingFactory.createStripeInvoice>
export type TestQuotaScenario = ReturnType<typeof billingFactory.createQuotaScenario>