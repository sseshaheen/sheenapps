import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Feature Flags',
  description: 'Manage feature flags and rollout rules across In-House Mode projects',
  load: () => import('@/components/admin/InhouseFlagsAdmin'),
  pick: (m) => m.InhouseFlagsAdmin,
})
