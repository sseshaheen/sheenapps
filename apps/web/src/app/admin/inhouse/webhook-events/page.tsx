import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'Webhook Events',
  description: 'Monitor and manage webhook events from OpenSRS, Stripe, and other sources',
  load: () => import('@/components/admin/InhouseWebhookEventsAdmin'),
  pick: (m) => m.InhouseWebhookEventsAdmin,
})
