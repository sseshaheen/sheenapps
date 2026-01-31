import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'solutionLanding',
  title: 'AR Solution Landing',
  type: 'document',
  fields: [
    defineField({ 
      name: 'industry_ar', 
      title: 'Industry (Arabic)',
      type: 'string', 
      validation: r => r.required().min(2).max(50),
      description: 'e.g., عيادة أسنان, مطعم, صالون'
    }),
    defineField({ 
      name: 'city_ar', 
      title: 'City (Arabic)',
      type: 'string', 
      validation: r => r.required().min(2).max(50),
      description: 'e.g., القاهرة, الرياض, دبي'
    }),
    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
      options: { 
        source: (doc: any) => `${doc.industry_ar}-${doc.city_ar}`.replace(/\s+/g, '-'), 
        maxLength: 96,
        slugify: (input: string) => input
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\u0600-\u06FF\u0750-\u077F\w-]+/g, '') // Keep Arabic chars
      },
      validation: r => r.required()
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
      initialValue: 'ar-eg'
    }),
    defineField({ 
      name: 'currency', 
      title: 'Currency',
      type: 'string', 
      options: { 
        list: [
          {title: 'Egyptian Pound (EGP)', value: 'EGP'},
          {title: 'Saudi Riyal (SAR)', value: 'SAR'},
          {title: 'UAE Dirham (AED)', value: 'AED'}
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
          {title: 'PayTabs (Regional)', value: 'PayTabs'}
        ] 
      },
      validation: r => r.min(1).max(6)
    }),
    defineField({ 
      name: 'features_ar', 
      title: 'Key Features (Arabic)',
      type: 'array', 
      of: [{type:'string'}], 
      validation: r => r.min(3).max(10),
      description: 'List key features in Arabic, e.g., حجز أونلاين, واتساب, RTL'
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
      validation: r => r.min(3).max(10)
    }),
    defineField({ 
      name: 'hero_title_ar',
      title: 'Hero Title (Arabic)',
      type: 'string',
      validation: r => r.required().min(10).max(100),
      description: 'Main headline for the page'
    }),
    defineField({ 
      name: 'hero_subtitle_ar',
      title: 'Hero Subtitle (Arabic)',
      type: 'text',
      rows: 2,
      validation: r => r.required().min(20).max(200),
      description: 'Supporting text under the headline'
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
      name: 'cta_text_ar',
      title: 'CTA Button Text (Arabic)',
      type: 'string',
      validation: r => r.required().min(2).max(30),
      initialValue: 'ابدأ في ٥ دقائق'
    }),
    defineField({ 
      name: 'price_range',
      title: 'Price Range',
      type: 'object',
      fields: [
        {name: 'min', type: 'number', title: 'Minimum Price', validation: r => r.required().min(0)},
        {name: 'max', type: 'number', title: 'Maximum Price', validation: r => r.required().min(0)}
      ]
    }),
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
      title: 'industry_ar', 
      subtitle: 'city_ar', 
      media: 'hero_image',
      locale: 'locale'
    },
    prepare(selection: any) {
      const {title, subtitle, media, locale} = selection
      return {
        title: `${title} - ${subtitle}`,
        subtitle: locale?.toUpperCase() || 'AR',
        media
      }
    }
  }
})