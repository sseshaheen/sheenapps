import { NextResponse } from 'next/server'
import { client } from '@/lib/sanity.client'

export async function GET() {
  try {
    // Fetch all solutions from both schemas
    const [oldSolutions, newSolutions] = await Promise.all([
      // Old solutionLanding schema (industry-city)
      client.fetch(`
        *[_type == "solutionLanding"] | order(city_ar asc, industry_ar asc) {
          "kind": "industryCity",
          "slug": slug.current,
          industry_ar,
          city_ar,
          locale,
          currency,
          features_ar,
          hero_image {
            asset-> {
              url
            },
            alt
          }
        }
      `),
      // New solution schema (all types)
      client.fetch(`
        *[_type == "solution"] | order(kind asc, title_ar asc) {
          kind,
          website_type,
          migration_from,
          title_ar,
          subtitle_ar,
          industry_ar,
          city_ar,
          "slug": slug.current,
          locale,
          currency,
          features_ar,
          hero_image {
            asset-> {
              url
            },
            alt
          }
        }
      `)
    ])

    return NextResponse.json({
      oldSolutions,
      newSolutions
    })
  } catch (error) {
    console.error('Error fetching solutions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch solutions' },
      { status: 500 }
    )
  }
}