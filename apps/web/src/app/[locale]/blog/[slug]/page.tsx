import { PortableText } from '@/components/blog/portable-text'
import { locales, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { getBlogPost, isRTL, urlFor } from '@/lib/sanity.client'
import { toOgLocale } from '@/lib/seo/locale'
import { getLanguageFlag, getLanguageName } from '@/utils/language-names'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params

  if (!locales.includes(locale as Locale)) {
    return { title: 'Post Not Found' }
  }

  const post = await getBlogPost(slug, locale as Locale)

  if (!post) {
    return { title: 'Post Not Found' }
  }

  const baseUrl = 'https://www.sheenapps.com'
  // English canonical at root, others with locale prefix
  const currentUrl = locale === 'en'
    ? `${baseUrl}/blog/${slug}`
    : `${baseUrl}/${locale}/blog/${slug}`

  // Build hreflang alternates from translations
  // Use BCP-47 format for locale keys (ar-eg → ar-EG)
  const toBCP47 = (tag: string): string => {
    if (tag === 'x-default') return tag
    return tag.replace(/-([a-z]{2})$/i, (_, region) => `-${region.toUpperCase()}`)
  }

  const alternates: Record<string, string> = {}

  // Add current language (with proper BCP-47 key)
  alternates[toBCP47(locale)] = currentUrl

  // Add translations (excluding fr-ma which redirects to /fr/)
  post.translations?.forEach(({ language, slug: translatedSlug }) => {
    if (language === 'fr-ma') return // Skip fr-ma (redirects to /fr/)
    // English at root, others with locale prefix
    const url = language === 'en'
      ? `${baseUrl}/blog/${translatedSlug}`
      : `${baseUrl}/${language}/blog/${translatedSlug}`
    alternates[toBCP47(language)] = url
  })

  // x-default points to the canonical (English if available, otherwise current)
  const englishVersion = post.translations?.find(t => t.language === 'en')
  alternates['x-default'] = englishVersion
    ? `${baseUrl}/blog/${englishVersion.slug}`
    : (locale === 'en' ? currentUrl : `${baseUrl}/blog/${slug}`)

  return {
    title: post.seo?.metaTitle || post.title,
    description: post.seo?.metaDescription || post.excerpt,

    alternates: {
      canonical: currentUrl,
      languages: alternates
    },

    openGraph: {
      type: 'article',
      url: currentUrl,
      title: post.seo?.metaTitle || post.title,
      description: post.seo?.metaDescription || post.excerpt,
      images: post.seo?.openGraphImage ? [{
        url: post.seo.openGraphImage.asset.url,
        alt: post.title
      }] : undefined,
      locale: toOgLocale(locale),
      alternateLocale: post.translations?.map(t => toOgLocale(t.language)).filter(Boolean) || []
    },

    robots: post.seo?.noIndex ? {
      index: false,
      follow: false
    } : undefined
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params

  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  // Get the blog post
  const post = await getBlogPost(slug, locale as Locale)

  if (!post) {
    notFound()
  }

  const rtl = isRTL(locale)
  const backText = {
    'en': 'Back to Blog',
    'ar': 'العودة للمدونة',
    'ar-eg': 'ارجع للمدونة',
    'ar-sa': 'العودة للمدونة',
    'ar-ae': 'العودة للمدونة',
    'fr': 'Retour au Blog',
    'fr-ma': 'Retour au Blog',
    'es': 'Volver al Blog',
    'de': 'Zurück zum Blog'
  }

  // JSON-LD structured data for SEO (Enhanced with expert recommendations)
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt,
    "image": post.featuredImage ? urlFor(post.featuredImage).width(1200).height(630).url() : undefined,
    "author": post.author ? {
      "@type": "Person",
      "name": post.author.name
    } : undefined,
    "publisher": {
      "@type": "Organization",
      "name": "SheenApps",
      "logo": {
        "@type": "ImageObject",
        "url": "https://www.sheenapps.com/logo.png"
      }
    },
    "datePublished": post.publishedAt,
    "dateModified": post.publishedAt,
    "mainEntityOfPage": {
      "@type": "WebPage",
      // English at root, others with locale prefix
      "@id": locale === 'en'
        ? `https://www.sheenapps.com/blog/${slug}`
        : `https://www.sheenapps.com/${locale}/blog/${slug}`
    },
    "articleSection": post.categories?.[0]?.title || "Technology",
    "keywords": post.tags?.join(", ") || "AI, Website Builder, Technology",
    "inLanguage": locale,
    // English at root, others with locale prefix
    "url": locale === 'en'
      ? `https://www.sheenapps.com/blog/${slug}`
      : `https://www.sheenapps.com/${locale}/blog/${slug}`,
    "wordCount": post.readingTime ? post.readingTime * 225 : undefined,
    "timeRequired": post.readingTime ? `PT${post.readingTime}M` : undefined,
    // 🎯 Expert enhancements for AI/LLM crawler optimization
    "about": [
      {"@type": "Thing", "name": "AI Website Builder"},
      {"@type": "Thing", "name": "No-Code Development"},
      {"@type": "Thing", "name": "Artificial Intelligence"}
    ].concat(
      // Add Arabic-specific topics for Arabic content
      locale.startsWith('ar') ? [
        {"@type": "Thing", "name": "بناء المواقع بالذكاء الاصطناعي"},
        {"@type": "Thing", "name": "تطوير التطبيقات"},
        {"@type": "Thing", "name": "التكنولوجيا العربية"}
      ] : []
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl" dir={rtl ? 'rtl' : 'ltr'}>
      {/* JSON-LD Structured Data - BlogPosting */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData, null, 2)
        }}
      />

      {/* JSON-LD Structured Data - BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": "https://www.sheenapps.com"
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": "Blog",
                "item": locale === 'en'
                  ? "https://www.sheenapps.com/blog"
                  : `https://www.sheenapps.com/${locale}/blog`
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": post.title
              }
            ]
          }, null, 2)
        }}
      />

      {/* Back to blog link */}
      <div className={`mb-8 ${rtl ? 'text-right' : 'text-left'}`}>
        <Link
          href="/blog"
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className={`w-4 h-4 ${rtl ? 'ml-2 rotate-180' : 'mr-2'}`} />
          {backText[locale as keyof typeof backText] || backText.en}
        </Link>
      </div>

      {/* Article header */}
      <header className="mb-12">
        {post.featuredImage && (
          <div className="aspect-video bg-muted rounded-lg overflow-hidden mb-8">
            <Image
              src={urlFor(post.featuredImage).width(1200).height(630).url()}
              alt={post.featuredImage.alt || post.title}
              width={1200}
              height={630}
              className="w-full h-full object-cover"
              priority
            />
          </div>
        )}

        <h1 className="text-4xl font-bold text-foreground mb-6 leading-tight">
          {post.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-6">
          {post.author && (
            <div className="flex items-center gap-2">
              <span>{post.author.name}</span>
            </div>
          )}

          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString(locale, {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </time>

          {post.readingTime && (
            <span>
              {post.readingTime} {locale.startsWith('ar') ? 'دقائق للقراءة' :
                               locale.startsWith('fr') ? 'min de lecture' :
                               locale === 'es' ? 'min de lectura' :
                               locale === 'de' ? 'Min Lesezeit' : 'min read'}
            </span>
          )}
        </div>

        {post.categories && post.categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {post.categories.map((category) => (
              <span
                key={category.slug.current}
                className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-sm font-medium"
              >
                {category.title}
              </span>
            ))}
          </div>
        )}

        {post.excerpt && (
          <p className="text-xl text-muted-foreground leading-relaxed">
            {post.excerpt}
          </p>
        )}
      </header>

      {/* Article content */}
      <article>
        {post.body && post.body.length > 0 ? (
          <PortableText value={post.body} />
        ) : (
          <div className="bg-muted p-6 rounded-lg">
            <p className="text-muted-foreground mb-2">
              {locale.startsWith('ar') ? 'محتوى المقال سيظهر هنا بعد إضافة المحتوى في Sanity.' :
               locale.startsWith('fr') ? 'Le contenu de l\'article apparaîtra ici après l\'ajout du contenu dans Sanity.' :
               locale === 'es' ? 'El contenido del artículo aparecerá aquí después de agregar el contenido en Sanity.' :
               locale === 'de' ? 'Der Artikelinhalt wird hier angezeigt, nachdem der Inhalt in Sanity hinzugefügt wurde.' :
               'Article content will appear here after adding content in Sanity.'}
            </p>
            <p className="text-sm text-muted-foreground">
              {locale.startsWith('ar') ? 'يرجى إضافة محتوى المقال في Sanity Studio.' :
               locale.startsWith('fr') ? 'Veuillez ajouter le contenu de l\'article dans Sanity Studio.' :
               locale === 'es' ? 'Por favor, agregue el contenido del artículo en Sanity Studio.' :
               locale === 'de' ? 'Bitte fügen Sie den Artikelinhalt in Sanity Studio hinzu.' :
               'Please add article content in Sanity Studio.'}
            </p>
          </div>
        )}
      </article>

      {/* Language alternatives */}
      {post.translations && post.translations.length > 0 && (
        <div className="mt-12 pt-8 border-t border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {locale.startsWith('ar') ? 'اقرأ بلغات أخرى:' :
             locale.startsWith('fr') ? 'Lire dans d\'autres langues:' :
             locale === 'es' ? 'Leer en otros idiomas:' :
             locale === 'de' ? 'In anderen Sprachen lesen:' :
             'Read in other languages:'}
          </h3>
          <div className="flex flex-wrap gap-3">
            {post.translations
              .filter((translation) => translation && translation.slug && translation.slug.current && translation.language)
              .map((translation) => (
              <Link
                key={translation.language}
                href={`/blog/${translation.slug.current}`}
                locale={translation.language}
                className="px-4 py-2 bg-primary/5 hover:bg-primary/10 text-foreground hover:text-primary border border-border hover:border-primary/30 rounded-lg transition-all duration-200 text-sm flex items-center gap-2 font-medium"
              >
                <span>{getLanguageFlag(translation.language)}</span>
                <span>{getLanguageName(translation.language)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
