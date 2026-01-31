'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'

interface Phase3PlaceholdersCardProps {
  translations: {
    title: string
    subtitle: string
    domains: string
    eject: string
    advancedDb: string
    comingSoon: string
  }
}

export function Phase3PlaceholdersCard({ translations }: Phase3PlaceholdersCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Icon name="rocket" className="w-4 h-4" />
          {translations.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{translations.subtitle}</p>
        <div className="grid gap-2">
          <div className="flex items-center justify-between rounded-md border border-border p-2">
            <span className="text-sm">{translations.domains}</span>
            <Badge variant="outline">{translations.comingSoon}</Badge>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-2">
            <span className="text-sm">{translations.eject}</span>
            <Badge variant="outline">{translations.comingSoon}</Badge>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-2">
            <span className="text-sm">{translations.advancedDb}</span>
            <Badge variant="outline">{translations.comingSoon}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
