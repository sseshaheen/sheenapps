/**
 * Structured Data Component
 *
 * Renders JSON-LD structured data for SEO.
 * Use this component on pages to inject schema.org data.
 */

import Script from 'next/script'

interface StructuredDataProps {
  /** JSON-LD data object or array of objects */
  data: object | object[]
  /** Optional key for React rendering */
  id?: string
}

/**
 * Renders JSON-LD structured data as a script tag
 *
 * @example
 * ```tsx
 * <StructuredData
 *   data={generateOrganizationSchema()}
 *   id="organization-schema"
 * />
 * ```
 */
export function StructuredData({ data, id }: StructuredDataProps) {
  return (
    <Script
      id={id ?? 'structured-data'}
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
      strategy="afterInteractive"
    />
  )
}

/**
 * Renders multiple JSON-LD schemas
 *
 * @example
 * ```tsx
 * <MultiStructuredData
 *   schemas={[
 *     { id: 'org', data: generateOrganizationSchema() },
 *     { id: 'app', data: generateSoftwareApplicationSchema('en') },
 *   ]}
 * />
 * ```
 */
export function MultiStructuredData({
  schemas,
}: {
  schemas: Array<{ id: string; data: object }>
}) {
  return (
    <>
      {schemas.map(({ id, data }) => (
        <StructuredData key={id} id={id} data={data} />
      ))}
    </>
  )
}
