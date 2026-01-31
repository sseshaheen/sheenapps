import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Alerts',
  description: 'Configure in-house alert rules and acknowledge incidents',
  load: () => import('@/components/admin/InhouseAlertsAdmin'),
  pick: (m) => m.InhouseAlertsAdmin,
})
