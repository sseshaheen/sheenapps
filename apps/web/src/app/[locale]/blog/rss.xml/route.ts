import { type Locale, locales } from '@/i18n/config'
import { getBlogPosts } from '@/lib/sanity.client'
import { NextRequest, NextResponse } from 'next/server'

// RSS feed generator for each locale
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params

  // Validate locale (filter out development pseudo-locale)
  const supportedLocales = locales.filter(l => !l.includes('-XA'))
  if (!supportedLocales.includes(locale as Locale)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  try {
    const posts = await getBlogPosts(locale as Locale)
    const baseUrl = 'https://www.sheenapps.com'

    // RSS feed titles and descriptions per locale
    const feedTitles = {
      'en': 'SheenApps AI Blog - English',
      'ar': 'مدونة شين آبس للذكاء الاصطناعي - العربية',
      'ar-eg': 'مدونة شين آبس للذكاء الاصطناعي - العربية المصرية',
      'ar-sa': 'مدونة شين آبس للذكاء الاصطناعي - العربية السعودية',
      'ar-ae': 'مدونة شين آبس للذكاء الاصطناعي - العربية الإماراتية',
      'fr': 'Blog SheenApps IA - Français',
      'fr-ma': 'Blog SheenApps IA - Français (Maroc)',
      'es': 'Blog SheenApps IA - Español',
      'de': 'SheenApps KI-Blog - Deutsch'
    }

    const feedDescriptions = {
      'en': 'Latest insights on AI website builders and web development automation',
      'ar': 'أحدث الرؤى حول منشئات المواقع بالذكاء الاصطناعي وأتمتة تطوير الويب',
      'ar-eg': 'أحدث الرؤى حول منشئات المواقع بالذكاء الاصطناعي وأتمتة تطوير الويب',
      'ar-sa': 'أحدث الرؤى حول منشئات المواقع بالذكاء الاصطناعي وأتمتة تطوير الويب',
      'ar-ae': 'أحدث الرؤى حول منشئات المواقع بالذكاء الاصطناعي وأتمتة تطوير الويب',
      'fr': 'Dernières informations sur les créateurs de sites IA et l\'automatisation du développement web',
      'fr-ma': 'Dernières informations sur les créateurs de sites IA et l\'automatisation du développement web',
      'es': 'Últimas perspectivas sobre creadores de sitios web con IA y automatización del desarrollo web',
      'de': 'Neueste Erkenntnisse zu KI-Website-Buildern und Web-Entwicklungsautomatisierung'
    }

    const items = posts.slice(0, 50).map(post => {
      const postUrl = `${baseUrl}/${locale}/blog/${post.slug.current}`
      const pubDate = new Date(post.publishedAt).toUTCString()

      return `
        <item>
          <title><![CDATA[${post.title}]]></title>
          <link>${postUrl}</link>
          <guid>${postUrl}</guid>
          <pubDate>${pubDate}</pubDate>
          <description><![CDATA[${post.excerpt}]]></description>
          ${post.author ? `<author><![CDATA[${post.author.name}]]></author>` : ''}
          ${post.categories?.map(cat => `<category><![CDATA[${cat.title}]]></category>`).join('') || ''}
        </item>
      `.trim()
    }).join('\n')

    const feedTitle = feedTitles[locale as keyof typeof feedTitles] || feedTitles.en
    const feedDescription = feedDescriptions[locale as keyof typeof feedDescriptions] || feedDescriptions.en
    const feedUrl = `${baseUrl}/${locale}/blog`
    const lastBuildDate = posts.length > 0 ? new Date(posts[0].publishedAt).toUTCString() : new Date().toUTCString()

    const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${feedTitle}]]></title>
    <link>${feedUrl}</link>
    <description><![CDATA[${feedDescription}]]></description>
    <language>${locale}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${baseUrl}/${locale}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <generator>SheenApps Blog</generator>
    <webMaster>hello@sheenapps.com</webMaster>
    <managingEditor>hello@sheenapps.com</managingEditor>
    <copyright>© ${new Date().getFullYear()} SheenApps. All rights reserved.</copyright>
    <category>Technology</category>
    <category>AI</category>
    <category>Web Development</category>
    ${items}
  </channel>
</rss>`.trim()

    return new NextResponse(rss, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate'
      }
    })
  } catch (error) {
    console.error('RSS feed generation error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
