import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Notifications',
  description: 'Monitor notification delivery, templates, and user preferences across In-House Mode projects',
  load: () => import('@/components/admin/InhouseNotificationsAdmin'),
  pick: (m) => m.InhouseNotificationsAdmin,
})
