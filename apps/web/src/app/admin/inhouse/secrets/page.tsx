import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Secrets',
  description: 'Read-only inventory and audit trail for project secrets',
  load: () => import('@/components/admin/InhouseSecretsAdmin'),
  pick: (m) => m.InhouseSecretsAdmin,
})
