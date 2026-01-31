import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Realtime',
  description: 'Monitor realtime channels, connections, and messages across In-House Mode projects',
  load: () => import('@/components/admin/InhouseRealtimeAdmin'),
  pick: (m) => m.InhouseRealtimeAdmin,
})
