import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Workflows',
  description: 'Monitor and manage workflow runs across In-House projects',
  load: () => import('@/components/admin/InhouseWorkflowsAdmin'),
  pick: (m) => m.InhouseWorkflowsAdmin,
})
