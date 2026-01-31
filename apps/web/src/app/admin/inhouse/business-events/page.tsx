import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Business Events',
  description: 'Explore and debug business events used for KPI computation',
  load: () => import('@/components/admin/InhouseBusinessEventsAdmin'),
  pick: (m) => m.InhouseBusinessEventsAdmin,
})
