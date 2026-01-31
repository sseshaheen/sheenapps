/**
 * Voice Command Action Executor
 *
 * Executes matched voice commands by triggering appropriate UI actions.
 * Works with Next.js App Router and existing hooks/mutations.
 */

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { VoiceAction } from './command-definitions'

/**
 * Context required to execute voice commands.
 * Passed from the component that owns the voice input.
 */
export interface VoiceCommandContext {
  /** Project ID for project-scoped actions */
  projectId: string
  /** Next.js App Router instance for navigation */
  router: AppRouterInstance
  /** Current locale for route construction */
  locale: string
  /** Callbacks for specific actions */
  callbacks?: {
    /** Trigger a build */
    onStartBuild?: () => void
    /** Stop current build */
    onStopBuild?: () => void
    /** Open infrastructure settings drawer */
    onOpenSettings?: () => void
    /** Open preview/site */
    onOpenPreview?: () => void
    /** Trigger deploy */
    onDeploy?: () => void
    /** Open CMS manager */
    onOpenCms?: () => void
    /** Open CMS with new content form */
    onAddContent?: () => void
    /** Open helper chat */
    onOpenHelper?: () => void
    /** Close helper chat */
    onCloseHelper?: () => void
  }
}

/**
 * Result of executing a voice command.
 */
export interface ExecutionResult {
  /** Whether the action was executed successfully */
  success: boolean
  /** The action that was executed */
  action: VoiceAction
  /** Human-readable message about what happened */
  message?: string
  /** Error message if failed */
  error?: string
}

/**
 * Execute a matched voice command.
 *
 * @param action - The action to execute
 * @param context - Context with router, projectId, and callbacks
 * @returns ExecutionResult indicating success/failure
 */
export function executeVoiceCommand(
  action: VoiceAction,
  context: VoiceCommandContext
): ExecutionResult {
  const { projectId, router, callbacks } = context

  try {
    switch (action) {
      // Navigation
      case 'navigate_back':
        router.back()
        return { success: true, action, message: 'Navigating back' }

      case 'navigate_home':
        router.push('/dashboard')
        return { success: true, action, message: 'Going to dashboard' }

      // Build actions
      case 'start_build':
        if (callbacks?.onStartBuild) {
          callbacks.onStartBuild()
          return { success: true, action, message: 'Starting build' }
        }
        return {
          success: false,
          action,
          error: 'Build action not available in this context'
        }

      case 'stop_build':
        if (callbacks?.onStopBuild) {
          callbacks.onStopBuild()
          return { success: true, action, message: 'Stopping build' }
        }
        return {
          success: false,
          action,
          error: 'Stop action not available in this context'
        }

      // UI actions
      case 'open_settings':
        if (callbacks?.onOpenSettings) {
          callbacks.onOpenSettings()
          return { success: true, action, message: 'Opening settings' }
        }
        // Fallback: navigate to infra drawer via query param
        router.push(`/builder/workspace/${projectId}?infra=open`)
        return { success: true, action, message: 'Opening settings' }

      case 'open_preview':
        if (callbacks?.onOpenPreview) {
          callbacks.onOpenPreview()
          return { success: true, action, message: 'Opening preview' }
        }
        return {
          success: false,
          action,
          error: 'Preview not available in this context'
        }

      case 'deploy':
        if (callbacks?.onDeploy) {
          callbacks.onDeploy()
          return { success: true, action, message: 'Deploying site' }
        }
        return {
          success: false,
          action,
          error: 'Deploy not available in this context'
        }

      // CMS actions
      case 'open_cms':
        if (callbacks?.onOpenCms) {
          callbacks.onOpenCms()
          return { success: true, action, message: 'Opening content manager' }
        }
        // Fallback: navigate to CMS section via query param
        router.push(`/builder/workspace/${projectId}?infra=cms`)
        return { success: true, action, message: 'Opening content manager' }

      case 'add_content':
        if (callbacks?.onAddContent) {
          callbacks.onAddContent()
          return { success: true, action, message: 'Opening content form' }
        }
        // Fallback to opening CMS
        router.push(`/builder/workspace/${projectId}?infra=cms`)
        return { success: true, action, message: 'Opening content manager' }

      // Helper actions
      case 'open_helper':
        if (callbacks?.onOpenHelper) {
          callbacks.onOpenHelper()
          return { success: true, action, message: 'Opening AI helper' }
        }
        return {
          success: false,
          action,
          error: 'Helper not available in this context'
        }

      case 'close_helper':
        if (callbacks?.onCloseHelper) {
          callbacks.onCloseHelper()
          return { success: true, action, message: 'Closing AI helper' }
        }
        return {
          success: false,
          action,
          error: 'Helper not available in this context'
        }

      default:
        return {
          success: false,
          action,
          error: `Unknown action: ${action}`
        }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[VoiceCommand] Failed to execute ${action}:`, err)
    return {
      success: false,
      action,
      error: errorMessage
    }
  }
}

/**
 * Check if a given action requires specific callbacks to be available.
 * Useful for disabling certain voice commands in contexts where they can't work.
 */
export function actionRequiresCallback(action: VoiceAction): boolean {
  const callbackRequiredActions: VoiceAction[] = [
    'start_build',
    'stop_build',
    'deploy',
    'open_preview',
    'open_helper',
    'close_helper'
  ]
  return callbackRequiredActions.includes(action)
}

/**
 * Get the callback key name for a given action.
 */
export function getCallbackKeyForAction(action: VoiceAction): keyof NonNullable<VoiceCommandContext['callbacks']> | null {
  const mapping: Record<VoiceAction, keyof NonNullable<VoiceCommandContext['callbacks']> | null> = {
    'navigate_back': null,
    'navigate_home': null,
    'start_build': 'onStartBuild',
    'stop_build': 'onStopBuild',
    'open_settings': 'onOpenSettings',
    'open_preview': 'onOpenPreview',
    'deploy': 'onDeploy',
    'open_cms': 'onOpenCms',
    'add_content': 'onAddContent',
    'open_helper': 'onOpenHelper',
    'close_helper': 'onCloseHelper'
  }
  return mapping[action]
}
