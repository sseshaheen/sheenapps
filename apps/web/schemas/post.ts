// Blog post schema with internationalization support
import { defineType, defineField } from 'sanity'

// Validate slug uniqueness per language (not globally)
const isUniqueAcrossLanguages = async (slug: any, context: any) => {
  const { document, getClient } = context
  if (!document || !slug?.current) return true

  const client = getClient({ apiVersion: '2025-01-01' })
  const id = document._id.replace(/^drafts\./, '')
  
  const params = {
    type: 'post',
    lang: document.language,
    slug: slug.current,
    id
  }

  const query = `count(*[_type == $type && language == $lang && slug.current == $slug && !(_id in [$id, "drafts." + $id])])`
  
  try {
    const count = await client.fetch(query, params)
    return count === 0
  } catch (error) {
    console.warn('Slug validation error:', error)
    return true // Allow on error to prevent blocking
  }
}

// Calculate reading time based on content
const calculateReadingTime = (body: any[]): number => {
  if (!body || !Array.isArray(body)) return 0
  
  let wordCount = 0
  
  body.forEach(block => {
    if (block._type === 'block' && block.children) {
      block.children.forEach((child: any) => {
        if (child.text) {
          wordCount += child.text.split(/\s+/).length
        }
      })
    }
  })
  
  // Average reading speed: 200-250 words per minute, using 225
  return Math.ceil(wordCount / 225)
}

export default defineType({
  name: 'post',
  title: 'Blog Post',
  type: 'document',
  fields: [
    // Language field managed by i18n plugin
    defineField({
      name: 'language',
      title: 'Language',
      type: 'string',
      readOnly: true,
      hidden: true,
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required().max(100).warning('Keep titles under 100 characters for better SEO')
    }),

    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
        isUnique: isUniqueAcrossLanguages
      },
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 4,
      description: 'Brief description of the post for listings and SEO',
      validation: Rule => Rule.required().max(200).warning('Keep excerpts under 200 characters')
    }),

    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'featuredImage',
      title: 'Featured Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alt text',
          description: 'Important for SEO and accessibility',
          validation: Rule => Rule.required()
        }
      ]
    }),

    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: { type: 'author' },
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{ type: 'reference', to: { type: 'category' } }],
      validation: Rule => Rule.max(3).warning('Consider using fewer categories for better organization')
    }),

    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        layout: 'tags'
      },
      validation: Rule => Rule.max(10).warning('Consider using fewer tags for better organization')
    }),

    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      description: 'Search engine optimization settings'
    }),

    defineField({
      name: 'readingTime',
      title: 'Reading Time (minutes)',
      type: 'number',
      description: 'Automatically calculated from content',
      readOnly: true
    }),

    defineField({
      name: 'featured',
      title: 'Featured Post',
      type: 'boolean',
      description: 'Mark as featured to highlight in listings',
      initialValue: false
    }),

    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Draft', value: 'draft' },
          { title: 'Published', value: 'published' },
          { title: 'Archived', value: 'archived' }
        ]
      },
      initialValue: 'draft',
      validation: Rule => Rule.required()
    })
  ],

  preview: {
    select: {
      title: 'title',
      author: 'author.name',
      media: 'featuredImage',
      status: 'status',
      language: 'language'
    },
    prepare(selection) {
      const { author, status, language } = selection
      return Object.assign({}, selection, {
        subtitle: `${author ? `by ${author}` : 'No author'} • ${status} • ${language?.toUpperCase()}`
      })
    }
  },

  orderings: [
    {
      title: 'Published Date, New',
      name: 'publishedAtDesc',
      by: [{ field: 'publishedAt', direction: 'desc' }]
    },
    {
      title: 'Published Date, Old',
      name: 'publishedAtAsc', 
      by: [{ field: 'publishedAt', direction: 'asc' }]
    },
    {
      title: 'Title A-Z',
      name: 'titleAsc',
      by: [{ field: 'title', direction: 'asc' }]
    }
  ]
})

// Hook to calculate reading time when body changes
export const postHooks = {
  beforeCreate: async (props: any) => {
    const { document } = props
    if (document.body) {
      document.readingTime = calculateReadingTime(document.body)
    }
    return document
  },
  beforeUpdate: async (props: any) => {
    const { document } = props
    if (document.body) {
      document.readingTime = calculateReadingTime(document.body)
    }
    return document
  }
}