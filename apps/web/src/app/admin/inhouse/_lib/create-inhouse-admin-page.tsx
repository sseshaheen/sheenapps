import { requireInhousePageAccess } from '@/lib/admin/require-admin'
import dynamic from 'next/dynamic'
import { AdminLoading, AdminPageShell } from '@/components/admin/shared'
import type { ComponentType } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
type CreatePageArgs = {
  title: string
  description: string
  load: () => Promise<any>
  pick?: (mod: any) => ComponentType<any>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Factory to create inhouse admin pages with consistent structure.
 * Reduces boilerplate from ~30 lines to ~7 lines per page.
 *
 * @example
 * // pages that export named component
 * export default createInhouseAdminPage({
 *   title: 'Jobs',
 *   description: 'Manage background jobs',
 *   load: () => import('@/components/admin/InhouseJobsAdmin'),
 *   pick: (m) => m.InhouseJobsAdmin,
 * })
 *
 * @example
 * // pages with default export
 * export default createInhouseAdminPage({
 *   title: 'Jobs',
 *   description: 'Manage background jobs',
 *   load: () => import('@/components/admin/InhouseJobsAdmin'),
 * })
 */
export function createInhouseAdminPage({ title, description, load, pick }: CreatePageArgs) {
  const PageClient = dynamic(
    async () => {
      const mod = await load()
      return pick ? pick(mod) : mod.default
    },
    { loading: () => <AdminLoading /> }
  )

  return async function InhouseAdminPage() {
    await requireInhousePageAccess()
    return (
      <AdminPageShell title={title} description={description}>
        <PageClient />
      </AdminPageShell>
    )
  }
}
