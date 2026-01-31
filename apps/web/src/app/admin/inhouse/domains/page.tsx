import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Domains',
  description: 'Manage email domains, registered domains, and mailboxes',
  load: () => import('@/components/admin/InhouseDomainsAdmin'),
  pick: (m) => m.InhouseDomainsAdmin,
})
