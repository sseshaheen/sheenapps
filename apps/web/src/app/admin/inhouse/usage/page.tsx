import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Usage',
  description: 'Usage totals, trends, and approaching limits',
  load: () => import('@/components/admin/InhouseUsageAdmin'),
  pick: (m) => m.InhouseUsageAdmin,
})
