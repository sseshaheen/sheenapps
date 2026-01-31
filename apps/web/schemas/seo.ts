// SEO fields schema
import { defineType } from 'sanity'

export default defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    {
      name: 'metaTitle',
      title: 'Meta Title',
      type: 'string',
      description: 'Title for search engines (50-60 characters)',
      validation: Rule => Rule.max(60).warning('Recommended: 50-60 characters')
    },
    {
      name: 'metaDescription',
      title: 'Meta Description', 
      type: 'text',
      rows: 3,
      description: 'Description for search engines (150-160 characters)',
      validation: Rule => Rule.max(160).warning('Recommended: 150-160 characters')
    },
    {
      name: 'openGraphImage',
      title: 'Open Graph Image',
      type: 'image',
      description: 'Image for social media sharing (1200x630px recommended)',
      options: { hotspot: true },
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alt text',
          validation: Rule => Rule.required()
        }
      ]
    },
    {
      name: 'noIndex',
      title: 'Hide from search engines',
      type: 'boolean',
      description: 'Check this to prevent search engines from indexing this page',
      initialValue: false
    }
  ],
  preview: {
    select: {
      title: 'metaTitle',
      subtitle: 'metaDescription'
    },
    prepare({ title, subtitle }) {
      return {
        title: title || 'No meta title',
        subtitle: subtitle || 'No meta description'
      }
    }
  }
})