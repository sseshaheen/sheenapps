import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'KPI Health',
  description: 'Monitor KPI rollup health and data freshness across projects',
  load: () => import('@/components/admin/InhouseKpiHealthAdmin'),
  pick: (m) => m.InhouseKpiHealthAdmin,
})
