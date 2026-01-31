import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'solution',
  title: 'Solution Page',
  type: 'document',
  fields: [
    // Discriminator field
    defineField({
      name: 'kind',
      title: 'Solution Type',
      type: 'string',
      options: {
        list: [
          {title: 'Industry × City', value: 'industryCity'},
          {title: 'Website Type', value: 'type'},
          {title: 'Migration', value: 'migration'}
        ],
        layout: 'radio'
      },
      validation: r => r.required(),
      initialValue: 'industryCity'
    }),

    // Core fields (always visible)
    defineField({ 
      name: 'title_ar', 
      title: 'Title (Arabic)',
      type: 'string', 
      validation: r => r.required().min(10).max(70),
      description: 'Main title for the solution page'
    }),
    
    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
      options: { 
        source: 'title_ar',
        maxLength: 96,
        slugify: (input: string) => input
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\u0600-\u06FF\u0750-\u077F\w-]+/g, '') // Keep Arabic chars
      },
      validation: r => r.required()
    }),

    // Type-specific fields (shown when kind === 'type')
    defineField({
      name: 'website_type',
      title: 'Website Type',
      type: 'string',
      hidden: ({parent}) => parent?.kind !== 'type',
      options: {
        list: [
          {title: 'Portfolio', value: 'portfolio'},
          {title: 'Company Website', value: 'company-website'},
          {title: 'Online Store', value: 'online-store'},
          {title: 'Blog Website', value: 'blog-website'},
          {title: 'Landing Page', value: 'landing-page'},
          {title: 'News Portal', value: 'news-portal'},
          {title: 'Marketplace', value: 'marketplace'},
          {title: 'Community Platform', value: 'community'},
          {title: 'Educational Platform', value: 'educational'},
          {title: 'Consultant Website', value: 'consultant-website'},
          {title: 'Agency Website', value: 'agency-website'},
          {title: 'Personal Brand', value: 'personal-brand'}
        ]
      },
      validation: r => r.custom((value, context) => {
        if ((context.parent as any)?.kind === 'type' && !value) {
          return 'Website type is required for type solutions'
        }
        return true
      })
    }),

    // Migration-specific fields (shown when kind === 'migration')
    defineField({
      name: 'migration_from',
      title: 'Migrate From Platform',
      type: 'string',
      hidden: ({parent}) => parent?.kind !== 'migration',
      options: {
        list: [
          {title: 'WordPress', value: 'wordpress'},
          {title: 'Wix', value: 'wix'},
          {title: 'Squarespace', value: 'squarespace'},
          {title: 'Shopify', value: 'shopify'},
          {title: 'Webflow', value: 'webflow'}
        ]
      },
      validation: r => r.custom((value, context) => {
        if ((context.parent as any)?.kind === 'migration' && !value) {
          return 'Platform is required for migration solutions'
        }
        return true
      })
    }),

    // Industry-City specific fields (shown when kind === 'industryCity')
    defineField({ 
      name: 'industry_ar', 
      title: 'Industry (Arabic)',
      type: 'string', 
      hidden: ({parent}) => parent?.kind !== 'industryCity',
      validation: r => r.custom((value, context) => {
        if ((context.parent as any)?.kind === 'industryCity' && !value) {
          return 'Industry is required for industry-city solutions'
        }
        return true
      }),
      description: 'e.g., عيادة أسنان, مطعم, صالون'
    }),
    
    defineField({ 
      name: 'city_ar', 
      title: 'City (Arabic)',
      type: 'string', 
      hidden: ({parent}) => parent?.kind !== 'industryCity',
      validation: r => r.custom((value, context) => {
        if ((context.parent as any)?.kind === 'industryCity' && !value) {
          return 'City is required for industry-city solutions'
        }
        return true
      }),
      description: 'e.g., القاهرة, الرياض, دبي'
    }),

    // Shared content fields
    defineField({ 
      name: 'subtitle_ar',
      title: 'Subtitle (Arabic)',
      type: 'text',
      rows: 2,
      validation: r => r.required().min(20).max(200),
      description: 'Supporting text under the headline'
    }),

    defineField({ 
      name: 'locale',
      title: 'Locale',
      type: 'string', 
      options: { 
        list: [
          {title: 'Egyptian Arabic', value: 'ar-eg'},
          {title: 'Saudi Arabic', value: 'ar-sa'},
          {title: 'UAE Arabic', value: 'ar-ae'},
          {title: 'Standard Arabic', value: 'ar'}
        ] 
      }, 
      validation: r => r.required(),
      initialValue: 'ar'
    }),

    defineField({ 
      name: 'currency', 
      title: 'Currency',
      type: 'string', 
      options: { 
        list: [
          {title: 'Egyptian Pound (EGP)', value: 'EGP'},
          {title: 'Saudi Riyal (SAR)', value: 'SAR'},
          {title: 'UAE Dirham (AED)', value: 'AED'},
          {title: 'US Dollar (USD)', value: 'USD'}
        ] 
      }, 
      validation: r => r.required(),
      initialValue: 'EGP'
    }),

    defineField({
      name: 'payment_gateways',
      title: 'Payment Gateways',
      type: 'array',
      of: [{type: 'string'}],
      options: { 
        list: [
          {title: 'Fawry (Egypt)', value: 'Fawry'},
          {title: 'Paymob (Egypt)', value: 'Paymob'},
          {title: 'HyperPay (GCC)', value: 'HyperPay'},
          {title: 'Tap (GCC)', value: 'Tap'},
          {title: 'Moyasar (Saudi)', value: 'Moyasar'},
          {title: 'PayTabs (Regional)', value: 'PayTabs'},
          {title: 'Stripe', value: 'Stripe'},
          {title: 'PayPal', value: 'PayPal'}
        ] 
      },
      validation: r => r.min(1).max(8)
    }),

    defineField({ 
      name: 'features_ar', 
      title: 'Key Features (Arabic)',
      type: 'array', 
      of: [{type:'string'}], 
      validation: r => r.required().min(3).max(12),
      description: 'List key features in Arabic'
    }),

    defineField({
      name: 'use_cases',
      title: 'Use Cases / Examples',
      type: 'array',
      of: [{type: 'string'}],
      validation: r => r.min(0).max(6),
      description: 'Examples of who uses this type of website'
    }),

    defineField({
      name: 'faq_ar',
      title: 'FAQ Section (Arabic)',
      type: 'array',
      of: [{ 
        type:'object', 
        fields:[
          {
            name:'question', 
            title: 'Question',
            type:'string', 
            validation: r=>r.required().min(6).max(200)
          },
          {
            name:'answer', 
            title: 'Answer',
            type:'text', 
            rows:3, 
            validation: r=>r.required().min(20).max(500)
          }
        ]
      }],
      validation: r => r.required().min(3).max(10)
    }),

    // Builder preset for deep linking
    defineField({
      name: 'builder_preset',
      title: 'Builder Preset',
      type: 'string',
      description: 'Preset to use in builder, e.g., "company", "migrate:wordpress"',
      validation: r => r.max(30)
    }),

    // Hero and meta content
    defineField({ 
      name: 'hero_title_ar',
      title: 'Hero Title (Arabic)',
      type: 'string',
      validation: r => r.required().min(10).max(100),
      description: 'Main headline for the page'
    }),

    defineField({ 
      name: 'meta_description_ar',
      title: 'Meta Description (Arabic)',
      type: 'text',
      rows: 2,
      validation: r => r.required().min(50).max(160),
      description: 'SEO meta description for search results'
    }),

    defineField({ 
      name: 'hero_image', 
      title: 'Hero Image',
      type: 'image', 
      options: {
        hotspot: true,
        metadata: ['blurhash', 'lqip', 'palette']
      },
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alternative text',
          validation: r => r.required()
        }
      ]
    }),

    defineField({
      name: 'examples_gallery',
      title: 'Examples Gallery',
      type: 'array',
      of: [{ 
        type: 'image',
        options: {
          hotspot: true
        },
        fields: [
          {
            name: 'alt',
            type: 'string',
            title: 'Alternative text',
            validation: r => r.required()
          },
          {
            name: 'caption',
            type: 'string',
            title: 'Caption'
          }
        ]
      }],
      validation: r => r.max(6)
    }),

    defineField({ 
      name: 'cta_text_ar',
      title: 'CTA Button Text (Arabic)',
      type: 'string',
      validation: r => r.required().min(2).max(30),
      initialValue: 'ابدأ الآن'
    }),

    defineField({ 
      name: 'cta_secondary_ar',
      title: 'Secondary CTA Text (Arabic)',
      type: 'string',
      validation: r => r.min(2).max(30),
      initialValue: 'جرّب المنشئ'
    }),

    defineField({ 
      name: 'cta_whatsapp_ar',
      title: 'WhatsApp CTA Text (Arabic)',
      type: 'string',
      validation: r => r.min(2).max(30),
      initialValue: 'تحدث على واتساب'
    }),

    // Comparison data for migrations
    defineField({
      name: 'comparison_table',
      title: 'Comparison Table',
      type: 'array',
      hidden: ({parent}) => parent?.kind !== 'migration',
      of: [{
        type: 'object',
        fields: [
          {name: 'feature', type: 'string', title: 'Feature'},
          {name: 'competitor', type: 'string', title: 'Competitor'},
          {name: 'sheenapps', type: 'string', title: 'SheenApps'}
        ]
      }],
      validation: r => r.max(10)
    }),

    defineField({ 
      name: 'price_range',
      title: 'Price Range',
      type: 'object',
      fields: [
        {name: 'min', type: 'number', title: 'Minimum Price', validation: r => r.min(0)},
        {name: 'max', type: 'number', title: 'Maximum Price', validation: r => r.min(0)}
      ]
    }),

    // Timestamps
    defineField({ 
      name: 'publishedAt', 
      title: 'Published At',
      type: 'datetime',
      initialValue: () => new Date().toISOString()
    }),

    defineField({ 
      name: 'updatedAt', 
      title: 'Last Updated',
      type: 'datetime'
    }),
  ],
  preview: { 
    select: { 
      title: 'title_ar',
      kind: 'kind',
      industry: 'industry_ar',
      city: 'city_ar',
      type: 'website_type',
      platform: 'migration_from',
      media: 'hero_image'
    },
    prepare(selection: any) {
      const {title, kind, industry, city, type, platform, media} = selection
      let subtitle = ''
      
      if (kind === 'industryCity') {
        subtitle = `${industry} - ${city}`
      } else if (kind === 'type') {
        subtitle = `Type: ${type}`
      } else if (kind === 'migration') {
        subtitle = `Migrate from: ${platform}`
      }
      
      return {
        title: title || 'Untitled Solution',
        subtitle: subtitle || kind,
        media
      }
    }
  }
})