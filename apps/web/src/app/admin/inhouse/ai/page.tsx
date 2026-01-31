import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'AI Usage',
  description: 'Monitor AI operations, token usage, and costs across In-House Mode projects',
  load: () => import('@/components/admin/InhouseAIAdmin'),
  pick: (m) => m.InhouseAIAdmin,
})
