import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Payments',
  description: 'Monitor payment events and customer records',
  load: () => import('@/components/admin/InhousePaymentsAdmin'),
  pick: (m) => m.InhousePaymentsAdmin,
})
