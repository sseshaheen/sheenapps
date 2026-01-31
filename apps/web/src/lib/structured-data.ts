/**
 * Structured Data Helpers for SEO
 * Generates JSON-LD structured data for various content types
 */

export interface FAQItem {
  question: string
  answer: string
}

export interface HowToStep {
  name: string
  text: string
  image?: string
  url?: string
}

export interface HowToSupply {
  name: string
  image?: string
}

export interface HowToTool {
  name: string
  image?: string
}

/**
 * Generate FAQPage structured data
 */
export function generateFAQSchema(
  faqs: FAQItem[],
  locale: string = 'ar'
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    })),
    inLanguage: locale
  }
}

/**
 * Generate HowTo structured data
 */
export function generateHowToSchema(
  title: string,
  description: string,
  steps: HowToStep[],
  locale: string = 'ar',
  options?: {
    totalTime?: string // ISO 8601 duration format, e.g., "PT5M" for 5 minutes
    estimatedCost?: {
      currency: string
      value: string | number
    }
    supply?: HowToSupply[]
    tool?: HowToTool[]
    image?: string
    video?: {
      name: string
      description: string
      thumbnailUrl: string
      contentUrl: string
      embedUrl?: string
      uploadDate: string
      duration?: string
    }
  }
): object {
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: title,
    description: description,
    inLanguage: locale,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      name: step.name,
      text: step.text,
      position: index + 1,
      ...(step.image && { image: step.image }),
      ...(step.url && { url: step.url })
    }))
  }

  if (options?.totalTime) {
    schema.totalTime = options.totalTime
  }

  if (options?.estimatedCost) {
    schema.estimatedCost = {
      '@type': 'MonetaryAmount',
      currency: options.estimatedCost.currency,
      value: options.estimatedCost.value
    }
  }

  if (options?.supply && options.supply.length > 0) {
    schema.supply = options.supply.map(item => ({
      '@type': 'HowToSupply',
      name: item.name,
      ...(item.image && { image: item.image })
    }))
  }

  if (options?.tool && options.tool.length > 0) {
    schema.tool = options.tool.map(item => ({
      '@type': 'HowToTool',
      name: item.name,
      ...(item.image && { image: item.image })
    }))
  }

  if (options?.image) {
    schema.image = options.image
  }

  if (options?.video) {
    schema.video = {
      '@type': 'VideoObject',
      ...options.video
    }
  }

  return schema
}

/**
 * Generate WebApplication structured data
 */
export function generateWebApplicationSchema(
  name: string,
  description: string,
  locale: string,
  options?: {
    applicationCategory?: string
    operatingSystem?: string | string[]
    offers?: {
      price: string | number
      priceCurrency: string
    }
    aggregateRating?: {
      ratingValue: number
      reviewCount: number
    }
    screenshot?: string | string[]
    featureList?: string[]
    softwareVersion?: string
    applicationSubCategory?: string
    permissions?: string[]
    countriesSupported?: string[]
  }
): object {
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: name,
    description: description,
    inLanguage: locale,
    applicationCategory: options?.applicationCategory || 'BusinessApplication',
    operatingSystem: options?.operatingSystem || 'Any'
  }

  if (options?.offers) {
    schema.offers = {
      '@type': 'Offer',
      price: options.offers.price,
      priceCurrency: options.offers.priceCurrency
    }
  }

  if (options?.aggregateRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: options.aggregateRating.ratingValue,
      reviewCount: options.aggregateRating.reviewCount
    }
  }

  if (options?.screenshot) {
    schema.screenshot = options.screenshot
  }

  if (options?.featureList) {
    schema.featureList = options.featureList
  }

  if (options?.softwareVersion) {
    schema.softwareVersion = options.softwareVersion
  }

  if (options?.applicationSubCategory) {
    schema.applicationSubCategory = options.applicationSubCategory
  }

  if (options?.permissions) {
    schema.permissions = options.permissions.join(', ')
  }

  if (options?.countriesSupported) {
    schema.countriesSupported = options.countriesSupported
  }

  return schema
}

/**
 * Generate LocalBusiness structured data
 */
export function generateLocalBusinessSchema(
  name: string,
  description: string,
  options: {
    address: {
      streetAddress?: string
      addressLocality: string
      addressRegion?: string
      postalCode?: string
      addressCountry: string
    }
    telephone?: string
    email?: string
    url?: string
    image?: string | string[]
    priceRange?: string
    openingHours?: string[]
    paymentAccepted?: string[]
    currenciesAccepted?: string
    areaServed?: string | string[]
    hasMap?: string
  }
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: name,
    description: description,
    address: {
      '@type': 'PostalAddress',
      ...options.address
    },
    ...(options.telephone && { telephone: options.telephone }),
    ...(options.email && { email: options.email }),
    ...(options.url && { url: options.url }),
    ...(options.image && { image: options.image }),
    ...(options.priceRange && { priceRange: options.priceRange }),
    ...(options.openingHours && { openingHoursSpecification: options.openingHours }),
    ...(options.paymentAccepted && { paymentAccepted: options.paymentAccepted }),
    ...(options.currenciesAccepted && { currenciesAccepted: options.currenciesAccepted }),
    ...(options.areaServed && { areaServed: options.areaServed }),
    ...(options.hasMap && { hasMap: options.hasMap })
  }
}

/**
 * Generate Product structured data for pricing/features
 */
export function generateProductSchema(
  name: string,
  description: string,
  locale: string,
  options: {
    image?: string | string[]
    brand?: string
    offers: {
      price: string | number
      priceCurrency: string
      availability?: string
      priceValidUntil?: string
      itemCondition?: string
    }
    aggregateRating?: {
      ratingValue: number
      reviewCount: number
    }
    review?: Array<{
      author: string
      reviewRating: number
      reviewBody: string
      datePublished: string
    }>
  }
): object {
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: name,
    description: description,
    inLanguage: locale
  }

  if (options.image) {
    schema.image = options.image
  }

  if (options.brand) {
    schema.brand = {
      '@type': 'Brand',
      name: options.brand
    }
  }

  schema.offers = {
    '@type': 'Offer',
    price: options.offers.price,
    priceCurrency: options.offers.priceCurrency,
    availability: options.offers.availability || 'https://schema.org/InStock',
    ...(options.offers.priceValidUntil && { priceValidUntil: options.offers.priceValidUntil }),
    ...(options.offers.itemCondition && { itemCondition: options.offers.itemCondition })
  }

  if (options.aggregateRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: options.aggregateRating.ratingValue,
      reviewCount: options.aggregateRating.reviewCount
    }
  }

  if (options.review && options.review.length > 0) {
    schema.review = options.review.map(r => ({
      '@type': 'Review',
      author: {
        '@type': 'Person',
        name: r.author
      },
      reviewRating: {
        '@type': 'Rating',
        ratingValue: r.reviewRating
      },
      reviewBody: r.reviewBody,
      datePublished: r.datePublished
    }))
  }

  return schema
}

/**
 * Generate Organization structured data
 * Used on homepage for brand knowledge panel
 * Enhanced with Arabic SEO properties: areaServed, knowsLanguage, slogan
 */
export function generateOrganizationSchema(options?: {
  sameAs?: string[]
  contactPoint?: {
    contactType: string
    availableLanguage?: string[]
    email?: string
    telephone?: string
  }
  areaServed?: Array<{ name: string; alternateName?: string }>
  knowsLanguage?: string[]
  slogan?: string
  locale?: string
}): object {
  const isArabic = options?.locale?.startsWith('ar')

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SheenApps',
    url: 'https://www.sheenapps.com',
    logo: 'https://www.sheenapps.com/logo.png',
    description: isArabic
      ? 'منصة بناء تطبيقات بدون كود بالذكاء الاصطناعي. فريقك التقني الدائم يجمع بين الذكاء الاصطناعي والخبرة البشرية.'
      : 'AI-powered no-code platform for building business applications. Your permanent tech team combining AI + human expertise.',
  }

  if (options?.sameAs && options.sameAs.length > 0) {
    schema.sameAs = options.sameAs
  }

  if (options?.contactPoint) {
    schema.contactPoint = {
      '@type': 'ContactPoint',
      contactType: options.contactPoint.contactType,
      ...(options.contactPoint.availableLanguage && { availableLanguage: options.contactPoint.availableLanguage }),
      ...(options.contactPoint.email && { email: options.contactPoint.email }),
      ...(options.contactPoint.telephone && { telephone: options.contactPoint.telephone }),
    }
  }

  // Arabic SEO: Add areaServed for regional targeting
  if (options?.areaServed && options.areaServed.length > 0) {
    schema.areaServed = options.areaServed.map(area => ({
      '@type': 'Country',
      name: area.name,
      ...(area.alternateName && { alternateName: area.alternateName }),
    }))
  }

  // Arabic SEO: Add knowsLanguage for multilingual signals
  if (options?.knowsLanguage && options.knowsLanguage.length > 0) {
    schema.knowsLanguage = options.knowsLanguage
  }

  // Arabic SEO: Add slogan (localized)
  if (options?.slogan) {
    schema.slogan = options.slogan
  }

  return schema
}

/**
 * Generate SoftwareApplication structured data
 * Used on homepage and solutions pages
 */
export function generateSoftwareApplicationSchema(
  locale: string,
  options?: {
    applicationCategory?: string
    operatingSystem?: string
    featureList?: string[]
  }
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SheenApps',
    description: 'Build powerful business apps without code. AI platform helps startups and enterprises launch faster.',
    applicationCategory: options?.applicationCategory || 'BusinessApplication',
    operatingSystem: options?.operatingSystem || 'Web',
    inLanguage: locale,
    url: 'https://www.sheenapps.com',
    ...(options?.featureList && { featureList: options.featureList }),
  }
}

/**
 * Generate BreadcrumbList structured data
 * Used on content pages (blog, careers, solutions)
 */
export function generateBreadcrumbSchema(
  items: Array<{ name: string; url?: string }>
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url && { item: item.url }),
    })),
  }
}

/**
 * Generate Article structured data
 * Used on blog posts
 */
export function generateArticleSchema(options: {
  headline: string
  description: string
  image?: string
  datePublished: string
  dateModified?: string
  author: {
    name: string
    url?: string
  }
  locale: string
}): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: options.headline,
    description: options.description,
    ...(options.image && { image: options.image }),
    datePublished: options.datePublished,
    ...(options.dateModified && { dateModified: options.dateModified }),
    author: {
      '@type': 'Person',
      name: options.author.name,
      ...(options.author.url && { url: options.author.url }),
    },
    publisher: {
      '@type': 'Organization',
      name: 'SheenApps',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.sheenapps.com/logo.png',
      },
    },
    inLanguage: options.locale,
  }
}

/**
 * Combine multiple schemas into a single JSON-LD script
 */
export function combineSchemas(...schemas: object[]): string {
  return JSON.stringify(schemas.length === 1 ? schemas[0] : schemas, null, 2)
}