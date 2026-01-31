import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Emails',
  description: 'Monitor email delivery status across projects',
  load: () => import('@/components/admin/InhouseEmailsAdmin'),
  pick: (m) => m.InhouseEmailsAdmin,
})
