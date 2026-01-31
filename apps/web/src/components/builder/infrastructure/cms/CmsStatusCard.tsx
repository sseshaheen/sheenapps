'use client'

import type { ComponentProps } from 'react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { useCmsContentTypes, useCmsEntries, useCmsMedia } from '@/hooks/useCmsAdmin'
import { CmsManagerDialog } from './CmsManagerDialog'

interface CmsStatusCardProps {
  projectId: string
  /** Live site URL for "View on site" links in CMS dialog */
  siteUrl?: string | null
  /** When true, uses simpleTitle instead of title */
  isSimpleMode?: boolean
  /** External control of dialog open state (for opening from onboarding) */
  dialogOpen?: boolean
  /** Callback when dialog open state changes */
  onDialogOpenChange?: (open: boolean) => void
  translations: {
    title: string
    /** Friendlier title for simple mode, e.g. "Content" instead of "CMS" */
    simpleTitle?: string
    subtitle: string
    typesLabel: string
    entriesLabel: string
    mediaLabel: string
    manage: string
    dialog: ComponentProps<typeof CmsManagerDialog>['translations']
  }
}

export function CmsStatusCard({ projectId, siteUrl, isSimpleMode, dialogOpen, onDialogOpenChange, translations }: CmsStatusCardProps) {
  // Use external state if provided, otherwise internal state
  const [internalOpen, setInternalOpen] = useState(false)
  const open = dialogOpen !== undefined ? dialogOpen : internalOpen
  const setOpen = onDialogOpenChange ?? setInternalOpen

  const typesQuery = useCmsContentTypes(projectId, open === false)
  const entriesQuery = useCmsEntries(projectId, {}, open === false)
  const mediaQuery = useCmsMedia(projectId, {}, open === false)

  const typesCount = typesQuery.data?.length ?? 0
  const entriesCount = entriesQuery.data?.length ?? 0
  const mediaCount = mediaQuery.data?.length ?? 0

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Icon name="layout-grid" className="w-4 h-4" />
            {isSimpleMode && translations.simpleTitle ? translations.simpleTitle : translations.title}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {translations.manage}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{translations.subtitle}</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-xs">
            <div className="rounded-md border px-1.5 sm:px-2 py-2 text-center min-w-0">
              <div className="text-base sm:text-lg font-semibold">{typesCount}</div>
              <div className="text-muted-foreground truncate">{translations.typesLabel}</div>
            </div>
            <div className="rounded-md border px-1.5 sm:px-2 py-2 text-center min-w-0">
              <div className="text-base sm:text-lg font-semibold">{entriesCount}</div>
              <div className="text-muted-foreground truncate">{translations.entriesLabel}</div>
            </div>
            <div className="rounded-md border px-1.5 sm:px-2 py-2 text-center min-w-0">
              <div className="text-base sm:text-lg font-semibold">{mediaCount}</div>
              <div className="text-muted-foreground truncate">{translations.mediaLabel}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <CmsManagerDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        siteUrl={siteUrl}
        translations={translations.dialog}
      />
    </>
  )
}
