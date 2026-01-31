'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { DeployDialog } from './DeployDialog'

interface DeployButtonProps {
  projectId: string
  buildId: string | null
  subdomain: string
  isDeploying: boolean
  disabled?: boolean
  translations: {
    button: string
    deploying: string
    dialogTitle: string
    buildLabel: string
    createdLabel: string
    deployTo: string
    includes: string
    staticFiles: string
    ssrBundle: string
    envVars: string
    warning: string
    previousBuild: string
    actions: {
      cancel: string
      deployNow: string
    }
    progress: {
      uploadingAssets: string
      deployingBundle: string
      updatingRouting: string
      complete: string
    }
    success: string
    error: string
  }
}

/**
 * Deploy Button for Easy Mode Projects
 *
 * Opens DeployDialog when clicked
 * Shows deployment status
 * Disabled when no build or already deploying
 *
 * EXPERT FIX ROUND 2: Removed userId prop (API uses session)
 */
export function DeployButton({
  projectId,
  buildId,
  subdomain,
  isDeploying,
  disabled = false,
  translations
}: DeployButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const isDisabled = disabled || !buildId || isDeploying

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        disabled={isDisabled}
        className="w-full sm:w-auto"
      >
        {isDeploying ? (
          <>
            <Icon name="loader-2" className="w-4 h-4 me-2 animate-spin" />
            {translations.deploying}
          </>
        ) : (
          <>
            <Icon name="upload" className="w-4 h-4 me-2" />
            {translations.button}
          </>
        )}
      </Button>

      <DeployDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        buildId={buildId}
        subdomain={subdomain}
        translations={{
          dialogTitle: translations.dialogTitle,
          buildLabel: translations.buildLabel,
          createdLabel: translations.createdLabel,
          deployTo: translations.deployTo,
          includes: translations.includes,
          staticFiles: translations.staticFiles,
          ssrBundle: translations.ssrBundle,
          envVars: translations.envVars,
          warning: translations.warning,
          previousBuild: translations.previousBuild,
          actions: translations.actions,
          progress: translations.progress,
          success: translations.success,
          error: translations.error
        }}
      />
    </>
  )
}
