import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Quotas',
  description: 'Manage overrides and usage adjustments',
  load: () => import('@/components/admin/InhouseQuotasAdmin'),
  pick: (m) => m.InhouseQuotasAdmin,
})
