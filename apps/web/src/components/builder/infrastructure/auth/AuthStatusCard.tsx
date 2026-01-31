'use client'

import type { ComponentProps } from 'react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { AuthKitDialog } from './AuthKitDialog'

interface AuthStatusCardProps {
  publicKey: string
  translations: {
    title: string
    subtitle: string
    cta: string
    dialog: ComponentProps<typeof AuthKitDialog>['translations']
  }
}

export function AuthStatusCard({ publicKey, translations }: AuthStatusCardProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Icon name="lock" className="w-4 h-4" />
            {translations.title}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {translations.cta}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{translations.subtitle}</p>
        </CardContent>
      </Card>

      <AuthKitDialog
        open={open}
        onOpenChange={setOpen}
        publicKey={publicKey}
        translations={translations.dialog}
      />
    </>
  )
}
