/**
 * Project Settings Panel - Enhanced Integration Command Center
 *
 * Replaced with Integration Command Center (Phase 3) while maintaining
 * backward compatibility. Falls back to legacy interface if feature flags disabled.
 */

'use client'

import { IntegrationCommandCenter } from '@/components/workspace/integration-command-center'

interface ProjectSettingsPanelProps {
  projectId: string
  projectName: string
  className?: string
}

export function ProjectSettingsPanel({ projectId, projectName, className }: ProjectSettingsPanelProps) {
  return (
    <IntegrationCommandCenter
      projectId={projectId}
      projectName={projectName}
      className={className}
    />
  )
}