import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Monitoring',
  description: 'Service health overview and actionable signals',
  load: () => import('@/components/admin/InhouseMonitoringAdmin'),
  pick: (m) => m.InhouseMonitoringAdmin,
})
