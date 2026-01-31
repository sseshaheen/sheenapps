import { createInhouseAdminPage } from '../_lib/create-inhouse-admin-page'

export default createInhouseAdminPage({
  title: 'AI Assistant',
  description: 'Manage OpenClaw AI Assistant for customer support across channels',
  load: () => import('@/components/admin/InhouseAIAssistant'),
  pick: (m) => m.InhouseAIAssistant,
})
