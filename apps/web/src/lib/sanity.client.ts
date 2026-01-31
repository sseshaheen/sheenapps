// Sanity client configuration for blog
import { createClient } from 'next-sanity'
import imageUrlBuilder from '@sanity/image-url'

import { type Locale } from '@/i18n/config'

export const SUPPORTED_LOCALES = ['en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de'] as const

// RTL detection aligned with backend logic
export function isRTL(locale: string): boolean {
  return locale.startsWith('ar')
}

// Sanity client configuration
export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'your-project-id',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  useCdn: process.env.NODE_ENV === 'production',
  apiVersion: '2025-01-01'
})

// Image URL builder
const builder = imageUrlBuilder(client)
export function urlFor(source: any) {
  return builder.image(source)
}

// Blog post types
export interface BlogPost {
  _id: string
  title: string
  slug: { current: string }
  excerpt: string
  publishedAt: string
  featuredImage: {
    asset: {
      _ref: string
      url: string
    }
    alt: string
  } | null
  author: {
    name: string
    slug: { current: string }
  } | null
  categories: Array<{
    title: string
    slug: { current: string }
  }>
  body: any[]
  seo: {
    metaTitle?: string
    metaDescription?: string
    openGraphImage?: any
    noIndex?: boolean
  } | null
  readingTime: number
  tags?: string[]
  language: string
  translations?: Array<{
    language: string
    slug: { current: string }
  }>
}

// GROQ queries for blog content
const LIST_POSTS_QUERY = `
  *[(_type == "post" || _type == "blogPost") && language == $lang && !(_id in path("drafts.**"))] | order(publishedAt desc) {
    _id,
    title,
    slug,
    excerpt,
    publishedAt,
    featuredImage{
      alt,
      asset->{
        _ref,
        url
      }
    },
    author-> {
      name,
      slug
    },
    categories[]-> {
      title,
      slug
    },
    seo,
    readingTime,
    language,
    "translations": coalesce(
      translations[] {
        language,
        slug
      },
      []
    )
  }
`

const SINGLE_POST_QUERY = `
  *[(_type == "post" || _type == "blogPost") && slug.current == $slug && language == $lang && !(_id in path("drafts.**"))][0] {
    _id,
    title,
    slug,
    excerpt,
    publishedAt,
    body,
    seo,
    featuredImage{
      alt,
      asset->{
        _ref,
        url
      }
    },
    author-> {
      name,
      slug,
      bio,
      "image": image.asset->url
    },
    categories[]-> {
      title,
      slug
    },
    tags,
    readingTime,
    language,
    "translations": coalesce(
      translations[] {
        language,
        slug
      },
      []
    )
  }
`

// Blog post functions
export async function getBlogPosts(locale: Locale): Promise<BlogPost[]> {
  try {
    const posts = await client.fetch(LIST_POSTS_QUERY, { lang: locale })
    return posts || []
  } catch (error) {
    console.warn('Failed to fetch blog posts:', error)
    return []
  }
}

export async function getBlogPost(slug: string, locale: Locale): Promise<BlogPost | null> {
  try {
    const post = await client.fetch(SINGLE_POST_QUERY, { slug, lang: locale })
    return post || null
  } catch (error) {
    console.warn('Failed to fetch blog post:', error)
    return null
  }
}

// Generate static params for blog posts (for static generation)
export async function getAllBlogSlugs(): Promise<Array<{ params: { locale: string; slug: string } }>> {
  try {
    const slugs = await client.fetch(`
      *[_type == "post" && defined(slug.current) && !(_id in path("drafts.**"))] {
        "slug": slug.current,
        language
      }
    `)
    
    return slugs.map((item: { slug: string; language: string }) => ({
      params: {
        locale: item.language,
        slug: item.slug
      }
    }))
  } catch (error) {
    console.warn('Failed to fetch blog slugs:', error)
    return []
  }
}