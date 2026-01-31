/**
 * In-House Project Details Page
 * Admin view of a single In-House Mode project
 */

import { requireInhousePageAccess } from '@/lib/admin/require-admin'
import dynamic from 'next/dynamic'
import { AdminLoading } from '@/components/admin/shared'

// Dynamic import to reduce build-time module graph
const InhouseProjectDetails = dynamic(
  () => import('@/components/admin/InhouseProjectDetails').then(m => m.InhouseProjectDetails),
  { loading: () => <AdminLoading /> }
)

export default async function InhouseProjectDetailsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  await requireInhousePageAccess()
  const { projectId } = await params

  return <InhouseProjectDetails projectId={projectId} />
}
