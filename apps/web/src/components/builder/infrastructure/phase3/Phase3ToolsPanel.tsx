'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Icon from '@/components/ui/icon'

interface Phase3ToolsPanelProps {
  projectId: string
  translations: {
    title: string
    subtitle: string
    comingSoon?: string
    notifyMe?: string
    notified?: string
    domains: {
      title: string
      placeholder: string
      add: string
      note: string
    }
    eject: {
      title: string
      description: string
      action: string
    }
    export: {
      title: string
      description: string
      action: string
    }
    table: {
      title: string
      description: string
      action: string
    }
  }
}

export function Phase3ToolsPanel({ projectId, translations }: Phase3ToolsPanelProps) {
  // projectId will be used when notify API is implemented
  void projectId

  const [notifyStatus, setNotifyStatus] = useState<Record<string, boolean>>({})

  const comingSoonLabel = translations.comingSoon ?? 'Coming soon'
  const notifyMeLabel = translations.notifyMe ?? 'Notify me when available'
  const notifiedLabel = translations.notified ?? 'Registered'

  const handleNotifyMe = (feature: string) => {
    // In a real implementation, this would call an API to register interest
    setNotifyStatus(prev => ({ ...prev, [feature]: true }))
  }

  const renderFeatureItem = (
    title: string,
    description: string,
    featureKey: string
  ) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-sm font-medium">{title}</div>
        <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
          {comingSoonLabel}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex gap-2">
        <Button variant="outline" disabled className="opacity-50">
          {comingSoonLabel}
        </Button>
        {notifyStatus[featureKey] ? (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <Icon name="check" className="w-3 h-3" />
            {notifiedLabel}
          </span>
        ) : (
          <Button variant="ghost" onClick={() => handleNotifyMe(featureKey)}>
            <Icon name="bell" className="w-3 h-3 me-1" />
            {notifyMeLabel}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Icon name="settings" className="w-4 h-4" />
          {translations.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{translations.subtitle}</p>

        {renderFeatureItem(
          translations.domains.title,
          translations.domains.note,
          'domains'
        )}

        {renderFeatureItem(
          translations.export.title,
          translations.export.description,
          'export'
        )}

        {renderFeatureItem(
          translations.table.title,
          translations.table.description,
          'table'
        )}

        {renderFeatureItem(
          translations.eject.title,
          translations.eject.description,
          'eject'
        )}
      </CardContent>
    </Card>
  )
}
