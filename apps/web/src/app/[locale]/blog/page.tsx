import { locales, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { getBlogPosts } from '@/lib/sanity.client'
import { toOgLocale } from '@/lib/seo/locale'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params

  const titles = {
    'en': 'Blog - AI Website Builder Insights | SheenApps',
    'ar-eg': 'المدونة - رؤى منشئ المواقع بالذكاء الاصطناعي | شين آبس',
    'ar-sa': 'المدونة - رؤى منشئ المواقع بالذكاء الاصطناعي | شين آبس',
    'ar-ae': 'المدونة - رؤى منشئ المواقع بالذكاء الاصطناعي | شين آبس',
    'ar': 'المدونة - رؤى منشئ المواقع بالذكاء الاصطناعي | شين آبس',
    'fr': 'Blog - Insights sur les Créateurs de Sites IA | SheenApps',
    'fr-ma': 'Blog - Insights sur les Créateurs de Sites IA | SheenApps',
    'es': 'Blog - Información sobre Creadores de Sitios con IA | SheenApps',
    'de': 'Blog - KI-Website-Builder Insights | SheenApps'
  }

  const descriptions = {
    'en': 'Discover the future of web development with AI. Learn about AI website builders, best practices, and industry trends.',
    'ar-eg': 'اكتشف مستقبل تطوير الويب بالذكاء الاصطناعي. تعلم عن منشئات المواقع بالذكاء الاصطناعي وأفضل الممارسات.',
    'ar-sa': 'اكتشف مستقبل تطوير الويب بالذكاء الاصطناعي. تعلم عن منشئات المواقع بالذكاء الاصطناعي وأفضل الممارسات.',
    'ar-ae': 'اكتشف مستقبل تطوير الويب بالذكاء الاصطناعي. تعلم عن منشئات المواقع بالذكاء الاصطناعي وأفضل الممارسات.',
    'ar': 'اكتشف مستقبل تطوير الويب بالذكاء الاصطناعي. تعلم عن منشئات المواقع بالذكاء الاصطناعي وأفضل الممارسات.',
    'fr': 'Découvrez l\'avenir du développement web avec l\'IA. Apprenez sur les créateurs de sites IA et les meilleures pratiques.',
    'fr-ma': 'Découvrez l\'avenir du développement web avec l\'IA. Apprenez sur les créateurs de sites IA et les meilleures pratiques.',
    'es': 'Descubre el futuro del desarrollo web con IA. Aprende sobre creadores de sitios con IA y mejores prácticas.',
    'de': 'Entdecken Sie die Zukunft der Webentwicklung mit KI. Lernen Sie über KI-Website-Builder und Best Practices.'
  }

  return {
    title: titles[locale as keyof typeof titles] || titles.en,
    description: descriptions[locale as keyof typeof descriptions] || descriptions.en,

    openGraph: {
      title: titles[locale as keyof typeof titles] || titles.en,
      description: descriptions[locale as keyof typeof descriptions] || descriptions.en,
      url: locale === 'en' ? 'https://www.sheenapps.com/blog' : `https://www.sheenapps.com/${locale}/blog`,
      siteName: 'SheenApps',
      locale: toOgLocale(locale),
      type: 'website',
    },

    alternates: {
      // English canonical at root, others with locale prefix
      canonical: locale === 'en' ? 'https://www.sheenapps.com/blog' : `https://www.sheenapps.com/${locale}/blog`,
      languages: {
        // English at root (canonical)
        'en': 'https://www.sheenapps.com/blog',
        // Other locales with prefix (excluding fr-ma which redirects, en-XA which is dev-only)
        'ar-EG': 'https://www.sheenapps.com/ar-eg/blog',
        'ar-SA': 'https://www.sheenapps.com/ar-sa/blog',
        'ar-AE': 'https://www.sheenapps.com/ar-ae/blog',
        'ar': 'https://www.sheenapps.com/ar/blog',
        'fr': 'https://www.sheenapps.com/fr/blog',
        'es': 'https://www.sheenapps.com/es/blog',
        'de': 'https://www.sheenapps.com/de/blog',
        'x-default': 'https://www.sheenapps.com/blog',
      }
    }
  }
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params

  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  // Get blog posts for this locale
  const posts = await getBlogPosts(locale as Locale)

  // JSON-LD structured data for blog listing page
  // English canonical at root, others with locale prefix
  const baseUrl = 'https://www.sheenapps.com'
  const blogUrl = locale === 'en' ? `${baseUrl}/blog` : `${baseUrl}/${locale}/blog`

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": `SheenApps AI Blog${locale !== 'en' ? ` - ${locale.toUpperCase()}` : ''}`,
    "description": locale.startsWith('ar') ? 'اكتشف مستقبل تطوير الويب بالذكاء الاصطناعي' :
                   locale.startsWith('fr') ? 'Découvrez l\'avenir du développement web avec l\'IA' :
                   locale === 'es' ? 'Descubre el futuro del desarrollo web con IA' :
                   locale === 'de' ? 'Entdecken Sie die Zukunft der Webentwicklung mit KI' :
                   'Discover the future of web development with AI',
    "url": blogUrl,
    "inLanguage": locale,
    "publisher": {
      "@type": "Organization",
      "name": "SheenApps",
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/logo.png`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": blogUrl
    },
    "blogPost": posts.slice(0, 10).map(post => ({
      "@type": "BlogPosting",
      "headline": post.title,
      "description": post.excerpt,
      "url": locale === 'en' ? `${baseUrl}/blog/${post.slug.current}` : `${baseUrl}/${locale}/blog/${post.slug.current}`,
      "datePublished": post.publishedAt,
      "author": post.author ? {
        "@type": "Person",
        "name": post.author.name
      } : undefined
    }))
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header spacer - semantic approach */}
      <div className="header-spacer" aria-hidden="true" />

      <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData, null, 2)
        }}
      />
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          {locale.startsWith('ar') ? 'المدونة' :
           locale.startsWith('fr') ? 'Blog' :
           locale === 'es' ? 'Blog' :
           locale === 'de' ? 'Blog' : 'Blog'}
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          {locale.startsWith('ar') ? 'اكتشف مستقبل تطوير الويب بالذكاء الاصطناعي' :
           locale.startsWith('fr') ? 'Découvrez l\'avenir du développement web avec l\'IA' :
           locale === 'es' ? 'Descubre el futuro del desarrollo web con IA' :
           locale === 'de' ? 'Entdecken Sie die Zukunft der Webentwicklung mit KI' :
           'Discover the future of web development with AI'}
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg">
            {locale.startsWith('ar') ? 'لا توجد مقالات متاحة حالياً' :
             locale.startsWith('fr') ? 'Aucun article disponible pour le moment' :
             locale === 'es' ? 'No hay artículos disponibles actualmente' :
             locale === 'de' ? 'Derzeit sind keine Artikel verfügbar' :
             'No articles available yet'}
          </p>
          <p className="text-muted-foreground mt-2">
            {locale.startsWith('ar') ? 'سنقوم بنشر محتوى رائع قريباً!' :
             locale.startsWith('fr') ? 'Nous publierons bientôt du contenu génial !' :
             locale === 'es' ? '¡Pronto publicaremos contenido increíble!' :
             locale === 'de' ? 'Wir werden bald großartige Inhalte veröffentlichen!' :
             'We\'ll be publishing great content soon!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <Link
              key={post._id}
              href={`/blog/${post.slug.current}`}
              className="block bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow hover:scale-105 duration-200"
            >
              <article>
                {post.featuredImage && (
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    {/* TODO: Add next/image when Sanity is fully configured */}
                    <div className="w-full h-full bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 flex items-center justify-center">
                      <span className="text-muted-foreground">Featured Image</span>
                    </div>
                  </div>
                )}
                <div className="p-6">
                  <h2 className="text-xl font-bold text-foreground mb-2 line-clamp-2 hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-muted-foreground mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <time dateTime={post.publishedAt}>
                      {new Date(post.publishedAt).toLocaleDateString(locale)}
                    </time>
                    {post.readingTime && (
                      <span>
                        {post.readingTime} {locale.startsWith('ar') ? 'دقائق' :
                                           locale.startsWith('fr') ? 'min' :
                                           locale === 'es' ? 'min' :
                                           locale === 'de' ? 'Min' : 'min'}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 text-primary text-sm font-medium">
                    {locale.startsWith('ar') ? 'اقرأ المزيد ←' :
                     locale.startsWith('fr') ? 'Lire la suite →' :
                     locale === 'es' ? 'Leer más →' :
                     locale === 'de' ? 'Weiterlesen →' : 'Read more →'}
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
