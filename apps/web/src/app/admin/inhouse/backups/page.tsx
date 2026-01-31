import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Backups',
  description: 'Monitor and trigger backups, and track restores',
  load: () => import('@/components/admin/InhouseBackupsAdmin'),
  pick: (m) => m.InhouseBackupsAdmin,
})
