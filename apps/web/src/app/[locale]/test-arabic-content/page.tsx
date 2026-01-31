import { client } from '@/lib/sanity.client'
import Link from 'next/link'
import { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Test Arabic Content - All Created Pages',
  description: 'Test page showing all Arabic solution landing pages and blog posts',
}

interface ContentItem {
  _id: string
  _type: string
  slug: { current: string }
  title?: string
  industry_ar?: string
  city_ar?: string
  locale?: string
  language?: string
  hero_title_ar?: string
}

async function fetchArabicContent() {
  try {
    const solutionPages = await client.fetch<ContentItem[]>(`
      *[_type == "solutionLanding"] | order(city_ar asc, industry_ar asc) {
        _id,
        _type,
        slug,
        industry_ar,
        city_ar,
        locale,
        hero_title_ar
      }
    `)

    const blogPosts = await client.fetch<ContentItem[]>(`
      *[_type == "blogPost"] | order(publishedAt desc) {
        _id,
        _type,
        slug,
        title,
        language
      }
    `)

    return { solutionPages, blogPosts }
  } catch (error) {
    console.warn('Failed to fetch Arabic content:', error)
    return { solutionPages: [], blogPosts: [] }
  }
}

export default async function TestArabicContentPage() {
  const { solutionPages, blogPosts } = await fetchArabicContent()

  // Group solution pages by city
  const pagesByCity = solutionPages.reduce((acc, page) => {
    const city = page.city_ar || 'Unknown'
    if (!acc[city]) acc[city] = []
    acc[city].push(page)
    return acc
  }, {} as Record<string, typeof solutionPages>)

  // Count statistics
  const stats = {
    totalSolutions: solutionPages.length,
    totalBlogs: blogPosts.length,
    cities: Object.keys(pagesByCity).length,
    industries: [...new Set(solutionPages.map(p => p.industry_ar))].length
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Test Arabic Content</h1>
        
        {/* Statistics */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-card p-4 rounded-lg">
            <div className="text-2xl font-bold">{stats.totalSolutions}</div>
            <div className="text-muted-foreground">Solution Pages</div>
          </div>
          <div className="bg-card p-4 rounded-lg">
            <div className="text-2xl font-bold">{stats.totalBlogs}</div>
            <div className="text-muted-foreground">Blog Posts</div>
          </div>
          <div className="bg-card p-4 rounded-lg">
            <div className="text-2xl font-bold">{stats.cities}</div>
            <div className="text-muted-foreground">Cities</div>
          </div>
          <div className="bg-card p-4 rounded-lg">
            <div className="text-2xl font-bold">{stats.industries}</div>
            <div className="text-muted-foreground">Industries</div>
          </div>
        </div>

        {/* Solution Landing Pages */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Solution Landing Pages</h2>
          <div className="bg-card rounded-lg p-4">
            {Object.entries(pagesByCity).map(([city, pages]) => (
              <div key={city} className="mb-6">
                <h3 className="text-xl font-semibold mb-2 text-primary">{city}</h3>
                <div className="grid gap-2">
                  {pages.map((page) => (
                    <div key={page._id} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                      <div>
                        <span className="font-medium">{page.industry_ar}</span>
                        <span className="text-muted-foreground mx-2">•</span>
                        <span className="text-sm text-muted-foreground">
                          Slug: {page.slug?.current}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/${page.locale || 'ar-eg'}/solutions/${page.slug?.current}`}
                          className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
                          target="_blank"
                        >
                          Open Page
                        </Link>
                        <code className="px-2 py-1 bg-muted rounded text-xs">
                          /{page.locale || 'ar-eg'}/solutions/{page.slug?.current}
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Blog Posts */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Blog Posts</h2>
          <div className="bg-card rounded-lg p-4">
            {blogPosts.map((post) => (
              <div key={post._id} className="flex items-center justify-between p-2 hover:bg-muted rounded mb-2">
                <div>
                  <span className="font-medium">{post.title}</span>
                  <span className="text-muted-foreground mx-2">•</span>
                  <span className="text-sm text-muted-foreground">
                    Language: {post.language}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/${post.language || 'ar'}/blog/${post.slug?.current}`}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
                    target="_blank"
                  >
                    Open Post
                  </Link>
                  <code className="px-2 py-1 bg-muted rounded text-xs">
                    /{post.language || 'ar'}/blog/{post.slug?.current}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Links */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Quick Test Links</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card rounded-lg p-4">
              <h3 className="font-semibold mb-2">Main Pages</h3>
              <div className="space-y-2">
                <Link href="/ar/solutions" className="block text-primary hover:underline">
                  → All Solutions (Arabic)
                </Link>
                <Link href="/ar-eg/solutions" className="block text-primary hover:underline">
                  → All Solutions (Egypt)
                </Link>
                <Link href="/ar-sa/solutions" className="block text-primary hover:underline">
                  → All Solutions (Saudi)
                </Link>
                <Link href="/ar-ae/solutions" className="block text-primary hover:underline">
                  → All Solutions (UAE)
                </Link>
              </div>
            </div>
            
            <div className="bg-card rounded-lg p-4">
              <h3 className="font-semibold mb-2">Sample Solution Pages</h3>
              <div className="space-y-2">
                <Link href="/ar-eg/solutions/عيادة-أسنان-القاهرة" className="block text-primary hover:underline">
                  → Dental Clinic - Cairo
                </Link>
                <Link href="/ar-sa/solutions/مطعم-الرياض" className="block text-primary hover:underline">
                  → Restaurant - Riyadh
                </Link>
                <Link href="/ar-ae/solutions/صالون-دبي" className="block text-primary hover:underline">
                  → Beauty Salon - Dubai
                </Link>
                <Link href="/ar-eg/solutions/محل-ورد-الإسكندرية" className="block text-primary hover:underline">
                  → Flower Shop - Alexandria
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Raw Data */}
        <details className="mb-8">
          <summary className="cursor-pointer text-lg font-semibold mb-2">
            View Raw Data (Debug)
          </summary>
          <pre className="bg-muted p-4 rounded overflow-x-auto text-xs">
            {JSON.stringify({ solutionPages: solutionPages.slice(0, 5), blogPosts }, null, 2)}
          </pre>
        </details>
      </div>
    </main>
  )
}
