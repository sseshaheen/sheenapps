import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Edge Functions',
  description: 'Monitor edge function deployments and execution across In-House Mode projects',
  load: () => import('@/components/admin/InhouseEdgeFunctionsAdmin'),
  pick: (m) => m.InhouseEdgeFunctionsAdmin,
})
