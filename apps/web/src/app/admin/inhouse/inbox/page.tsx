import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Inbox',
  description: 'Monitor inbound email messages and threads',
  load: () => import('@/components/admin/InhouseInboxAdmin'),
  pick: (m) => m.InhouseInboxAdmin,
})
