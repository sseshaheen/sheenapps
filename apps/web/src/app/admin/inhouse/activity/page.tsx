import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'In-House Activity',
  description: 'Monitor activity across all In-House Mode projects',
  load: () => import('@/components/admin/InhouseActivityDashboard'),
  pick: (m) => m.InhouseActivityDashboard,
})
