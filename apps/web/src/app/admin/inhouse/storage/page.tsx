import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Storage',
  description: 'Inspect storage usage and manage project files',
  load: () => import('@/components/admin/InhouseStorageAdmin'),
  pick: (m) => m.InhouseStorageAdmin,
})
