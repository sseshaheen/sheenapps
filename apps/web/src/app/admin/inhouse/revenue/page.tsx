import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Revenue',
  description: 'Revenue reporting for in-house customers',
  load: () => import('@/components/admin/InhouseRevenueAdmin'),
  pick: (m) => m.InhouseRevenueAdmin,
})
