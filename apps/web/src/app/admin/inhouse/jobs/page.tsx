import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Jobs',
  description: 'Inspect and operate on background jobs for In-House projects',
  load: () => import('@/components/admin/InhouseJobsAdmin'),
  pick: (m) => m.InhouseJobsAdmin,
})
