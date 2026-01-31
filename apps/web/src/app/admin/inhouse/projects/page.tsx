import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'In-House Projects',
  description: 'Manage In-House Mode SDK projects, view usage, and perform admin actions',
  load: () => import('@/components/admin/InhouseProjectsList'),
  pick: (m) => m.InhouseProjectsList,
})
