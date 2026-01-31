'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { LoadingSpinner } from '@/components/ui/loading'
import { useProjectExport } from '@/hooks/use-project-export'
import { toast } from '@/components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ExportEjectCardTranslations {
  title: string
  export: {
    title: string
    description: string
    action: string
    exporting: string
    success: string
    error: string
  }
  eject: {
    title: string
    description: string
    action: string
    confirmTitle: string
    confirmDescription: string
    confirmWarning: string
    cancel: string
    confirm: string
    submitting: string
    success: string
    error: string
  }
}

interface ExportEjectCardProps {
  projectId: string
  translations: ExportEjectCardTranslations
}

export function ExportEjectCard({ projectId, translations }: ExportEjectCardProps) {
  const { downloadProject, isDownloading } = useProjectExport()
  const [ejectDialogOpen, setEjectDialogOpen] = useState(false)
  const [ejectSubmitting, setEjectSubmitting] = useState(false)

  const handleExport = async () => {
    try {
      await downloadProject(projectId, { format: 'zip', includeAssets: true })
      toast.success(translations.export.success)
    } catch {
      toast.error(translations.export.error)
    }
  }

  const handleEjectSubmit = async () => {
    setEjectSubmitting(true)
    try {
      const res = await fetch(`/api/inhouse/projects/${projectId}/eject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        if (data?.error?.code === 'EJECT_DISABLED') {
          toast.error(translations.eject.error)
        } else {
          throw new Error(data?.error?.message || 'Eject failed')
        }
        return
      }
      toast.success(translations.eject.success)
      setEjectDialogOpen(false)
    } catch {
      toast.error(translations.eject.error)
    } finally {
      setEjectSubmitting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Icon name="package" className="w-4 h-4" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Export */}
          <div className="space-y-1.5">
            <div className="text-sm font-medium">{translations.export.title}</div>
            <p className="text-xs text-muted-foreground">{translations.export.description}</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-8"
              onClick={handleExport}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-1.5" />
                  {translations.export.exporting}
                </>
              ) : (
                <>
                  <Icon name="download" className="w-3.5 h-3.5 mr-1.5" />
                  {translations.export.action}
                </>
              )}
            </Button>
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Eject */}
          <div className="space-y-1.5">
            <div className="text-sm font-medium">{translations.eject.title}</div>
            <p className="text-xs text-muted-foreground">{translations.eject.description}</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-8"
              onClick={() => setEjectDialogOpen(true)}
            >
              <Icon name="arrow-right" className="w-3.5 h-3.5 mr-1.5" />
              {translations.eject.action}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Eject Confirmation Dialog */}
      <Dialog open={ejectDialogOpen} onOpenChange={setEjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translations.eject.confirmTitle}</DialogTitle>
            <DialogDescription>{translations.eject.confirmDescription}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {translations.eject.confirmWarning}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEjectDialogOpen(false)}
              disabled={ejectSubmitting}
            >
              {translations.eject.cancel}
            </Button>
            <Button
              onClick={handleEjectSubmit}
              disabled={ejectSubmitting}
            >
              {ejectSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-1.5" />
                  {translations.eject.submitting}
                </>
              ) : (
                translations.eject.confirm
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
