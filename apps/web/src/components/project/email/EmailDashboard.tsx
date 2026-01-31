'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Mail, Settings, Globe, Send, Inbox } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { EmailOverview } from './EmailOverview'
import { EmailInbox } from './EmailInbox'
import { EmailDomains } from './EmailDomains'
import { EmailSettings } from './EmailSettings'
import { EmailOutboundHistory } from './EmailOutboundHistory'

interface EmailDashboardProps {
  projectId: string
}

export function EmailDashboard({ projectId }: EmailDashboardProps) {
  const t = useTranslations('project-email')
  const [activeTab, setActiveTab] = useState('overview')
  const [domainsSubTab, setDomainsSubTab] = useState<'custom' | 'registered' | 'mailboxes'>('custom')

  function handleNavigate(target: string) {
    if (target === 'mailboxes') {
      setActiveTab('domains')
      setDomainsSubTab('mailboxes')
    } else {
      setActiveTab(target)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-border px-4 py-3 sm:px-6">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {t('title')}
        </h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="flex-shrink-0 border-b border-border px-4 sm:px-6">
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
            <TabsList className="bg-transparent h-auto p-0 gap-0 w-max min-w-full">
              <TabsTrigger
                value="overview"
                className="whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2.5 text-sm"
              >
                {t('overview.title')}
              </TabsTrigger>
              <TabsTrigger
                value="inbox"
                className="whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2.5 text-sm"
              >
                <Inbox className="h-4 w-4 me-1.5" />
                {t('inbox.title')}
              </TabsTrigger>
              <TabsTrigger
                value="domains"
                className="whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2.5 text-sm"
              >
                <Globe className="h-4 w-4 me-1.5" />
                {t('domains.title')}
              </TabsTrigger>
              <TabsTrigger
                value="outbound"
                className="whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2.5 text-sm"
              >
                <Send className="h-4 w-4 me-1.5" />
                {t('outbound.title')}
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2.5 text-sm"
              >
                <Settings className="h-4 w-4 me-1.5" />
                {t('settings.title')}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="overview" className="mt-0 p-4 sm:p-6">
            <EmailOverview projectId={projectId} onNavigate={handleNavigate} />
          </TabsContent>
          <TabsContent value="inbox" className="mt-0 p-4 sm:p-6">
            <EmailInbox projectId={projectId} />
          </TabsContent>
          <TabsContent value="domains" className="mt-0 p-4 sm:p-6">
            <EmailDomains projectId={projectId} initialSubTab={domainsSubTab} onSubTabChange={setDomainsSubTab} />
          </TabsContent>
          <TabsContent value="outbound" className="mt-0 p-4 sm:p-6">
            <EmailOutboundHistory projectId={projectId} />
          </TabsContent>
          <TabsContent value="settings" className="mt-0 p-4 sm:p-6">
            <EmailSettings projectId={projectId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
