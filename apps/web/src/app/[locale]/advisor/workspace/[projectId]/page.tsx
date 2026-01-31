/**
 * Advisor Workspace Page
 *
 * Main workspace interface for advisors to view project files and logs
 * Follows the shared component architecture from implementation plan
 */

import { notFound } from 'next/navigation'
import { makeUserCtx } from '@/lib/db'
import { ProjectRepository } from '@/lib/server/repositories/project-repository'
import { logger } from '@/utils/logger'
import { AdvisorWorkspace } from '@/components/advisor/advisor-workspace'
import { loadNamespace } from '@/i18n/message-loader'

interface PageProps {
  params: Promise<{
    locale: string
    projectId: string
  }>
}

export default async function AdvisorWorkspacePage(props: PageProps) {
  const params = await props.params;
  const { locale, projectId } = params

  try {
    // Load workspace translations
    const messages = { workspace: await loadNamespace(locale, 'workspace') }

    // Get user context and verify project access
    const userCtx = await makeUserCtx()

    // Get current user (advisor)
    const { data: { user } } = await userCtx.client.auth.getUser()
    if (!user) {
      notFound()
    }

    // Verify project exists and advisor has access
    const project = await ProjectRepository.findById(projectId)
    if (!project) {
      notFound()
    }

    // Check advisor access permissions
    const advisorAccess = await userCtx.client
      .from('project_advisors')
      .select(`
        status,
        workspace_permissions (
          view_code,
          view_logs,
          manage_sessions
        )
      `)
      .eq('project_id', projectId)
      .eq('advisor_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!advisorAccess?.workspace_permissions?.view_code) {
      logger.warn('Access denied', {
        projectId,
        advisorId: user.id,
        reason: 'No workspace permissions'
      }, 'advisor-workspace')
      notFound()
    }

    // Check project-level workspace access
    const projectSettings = await userCtx.client
      .from('projects')
      .select('advisor_code_access, name, framework')
      .eq('id', projectId)
      .single()

    if (!projectSettings?.advisor_code_access) {
      logger.warn('Access denied', {
        projectId,
        advisorId: user.id,
        reason: 'Project disabled advisor code access'
      }, 'advisor-workspace')
      notFound()
    }

    logger.info('Workspace access granted', {
      projectId,
      advisorId: user.id,
      projectName: projectSettings.name
    }, 'advisor-workspace')

    // Prepare translations for the workspace
    const translations = {
      workspace: {
        title: messages.workspace?.title || 'Project Workspace',
        files: messages.workspace?.files || 'Files',
        logs: messages.workspace?.logs || 'Logs',
        session: messages.workspace?.session || 'Session',
        loading: messages.workspace?.loading || 'Loading...',
        accessDenied: messages.workspace?.accessDenied || 'Access denied',
        connectionStatus: {
          connected: messages.workspace?.connectionStatus?.connected || 'Connected',
          connecting: messages.workspace?.connectionStatus?.connecting || 'Connecting...',
          disconnected: messages.workspace?.connectionStatus?.disconnected || 'Disconnected',
          error: messages.workspace?.connectionStatus?.error || 'Connection error'
        }
      }
    }

    return (
      <AdvisorWorkspace
        projectId={projectId}
        advisorId={user.id}
        project={{
          id: project.id,
          name: projectSettings.name || 'Untitled Project',
          framework: projectSettings.framework || 'unknown'
        }}
        permissions={{
          view_code: advisorAccess.workspace_permissions.view_code,
          view_logs: advisorAccess.workspace_permissions.view_logs,
          manage_sessions: advisorAccess.workspace_permissions.manage_sessions
        }}
        translations={translations}
      />
    )

  } catch (error) {
    logger.error('Page load failed', {
      projectId,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 'advisor-workspace')

    notFound()
  }
}