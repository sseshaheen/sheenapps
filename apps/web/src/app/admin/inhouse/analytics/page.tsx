import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Analytics',
  description: 'Track events and usage analytics',
  load: () => import('@/components/admin/InhouseAnalyticsAdmin'),
  pick: (m) => m.InhouseAnalyticsAdmin,
})
