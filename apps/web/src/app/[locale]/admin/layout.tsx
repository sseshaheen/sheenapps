/**
 * Locale Admin Layout
 * Forces dynamic rendering to prevent SSG multiplication (9 locales × N pages)
 * See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function LocaleAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
