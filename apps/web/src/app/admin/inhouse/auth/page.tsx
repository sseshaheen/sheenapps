import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Auth',
  description: 'Manage users and sessions for In-House authentication',
  load: () => import('@/components/admin/InhouseAuthAdmin'),
  pick: (m) => m.InhouseAuthAdmin,
})
