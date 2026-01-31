import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Connectors',
  description: 'Monitor third-party integrations and connector health across In-House Mode projects',
  load: () => import('@/components/admin/InhouseConnectorsAdmin'),
  pick: (m) => m.InhouseConnectorsAdmin,
})
