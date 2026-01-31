'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { useEmailDomains, type EmailDomain } from '@/hooks/use-email-domains'
import { useRegisteredDomains } from '@/hooks/use-registered-domains'
import { DomainSetupWizard } from '@/components/project/email/DomainSetupWizard'
import { DomainRegistration } from '@/components/project/email/DomainRegistration'

interface DomainCardProps {
  projectId: string
  subdomain: string
  translations: {
    title: string
    subdomain: string
    customDomain: string
    addDomain: string
    buyDomain: string
    connected: string
    pending: string
    registered: string
    expiresAt: string
    noDomains: string
  }
}

export function DomainCard({ projectId, subdomain, translations }: DomainCardProps) {
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [showRegistration, setShowRegistration] = useState(false)

  const { data: emailDomainsData } = useEmailDomains(projectId)
  const { data: registeredDomainsData } = useRegisteredDomains(projectId)

  const domains: EmailDomain[] = emailDomainsData?.domains ?? []
  const purchased = registeredDomainsData?.domains ?? []
  const hasDomains = domains.length > 0 || purchased.length > 0

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Icon name="globe" className="w-4 h-4" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Current subdomain */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{translations.subdomain}</span>
            <span className="font-mono text-xs">{subdomain}.sheenapps.com</span>
          </div>

          {/* Connected custom domains */}
          {domains.length > 0 && (
            <div className="space-y-2">
              {domains.map((domain) => (
                <div key={domain.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{domain.domain}</span>
                  <Badge variant={domain.sendingReady ? 'default' : 'outline'} className="text-[10px]">
                    {domain.sendingReady ? translations.connected : translations.pending}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Registered domains */}
          {purchased.length > 0 && (
            <div className="space-y-2">
              {purchased.map((domain) => (
                <div key={domain.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <Icon name="shield-check" className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="font-medium">{domain.domain}</span>
                  </div>
                  <Badge variant="default" className="text-[10px]">
                    {translations.registered}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* No domains message */}
          {!hasDomains && (
            <div className="text-xs text-muted-foreground py-1">
              {translations.noDomains}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={() => setShowSetupWizard(true)}
            >
              <Icon name="link" className="w-3.5 h-3.5 mr-1.5" />
              {translations.addDomain}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={() => setShowRegistration(true)}
            >
              <Icon name="credit-card" className="w-3.5 h-3.5 mr-1.5" />
              {translations.buyDomain}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Domain Setup Wizard (connect existing domain) */}
      {showSetupWizard && (
        <DomainSetupWizard
          projectId={projectId}
          existingDomains={domains}
          onClose={() => setShowSetupWizard(false)}
        />
      )}

      {/* Domain Registration (buy new domain) */}
      {showRegistration && (
        <DomainRegistration
          projectId={projectId}
          onBack={() => setShowRegistration(false)}
        />
      )}
    </>
  )
}
