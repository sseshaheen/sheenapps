'use client'

import React, { useEffect } from 'react'
import { useBuilderStore, selectors } from '@/store/builder-store'
import { useQuestionFlowStore, useCurrentQuestion, useQuestionFlowActions } from '@/store/question-flow-store'
import { apiPost } from '@/lib/client/api-fetch'
import { logger } from '@/utils/logger'

interface WorkspaceCoreProps {
  projectId: string
  initialIdea?: string
  children: React.ReactNode
  projectData?: any
}

export function WorkspaceCore({
  projectId,
  children,
  projectData
}: WorkspaceCoreProps) {
  const currentQuestion = useCurrentQuestion()
  const { startQuestionFlow } = useQuestionFlowActions()

  // Unified store - production ready
  const isStoreReady = useBuilderStore(selectors.isStoreReady)
  const { initializeProject, loadProjectData } = useBuilderStore()

  // Question flow state
  const businessContext = useQuestionFlowStore(state => state.businessContext)

  // Initialize builder store for this project
  useEffect(() => {
    if (projectId && !isStoreReady) {
      logger.info(`🏪 Initializing builder store for project: ${projectId}`)
      initializeProject(projectId)
    }
  }, [projectId, initializeProject, isStoreReady])

  // Handle project data loading
  useEffect(() => {
    if (projectData && projectId && isStoreReady) {
      logger.info(`📦 Loading project data into store:`, projectData)
      logger.info(`📦 Project data type:`, typeof projectData)
      logger.info(`📦 Project data keys:`, Object.keys(projectData))
      logger.info(`📦 templateData value:`, projectData.templateData)
      logger.info(`📦 Has templateData:`, !!projectData.templateData)
      logger.info(`📦 Has template:`, projectData.hasTemplate)
      loadProjectData(projectData)
      
      // If there's template data, check if we need to build (only for new projects)
      // For existing projects, don't auto-trigger builds to avoid unnecessary 402 errors
      if (projectData.templateData && !projectData.buildId) {
        logger.info('🚀 New project with template data found, triggering initial build')
        logger.info('🚀 Template name:', projectData.templateData.name)
        
        // Use API route for deployment
        apiPost('/api/projects', {
          projectId,
          templateData: projectData.templateData,
          isNewProject: true
        })
          .then(response => {
            if (response.success) {
              logger.info('✅ Initial preview deployment initiated:', response.previewUrl)
            } else {
              logger.error('❌ Initial preview deployment failed:', response.error)
            }
          })
          .catch(error => {
            logger.error('❌ Initial preview deployment error:', error)
          })
      } else if (projectData.templateData && projectData.buildId) {
        logger.info('📋 Existing project loaded, skipping auto-build to prevent 402 errors')
      }
    }
  }, [projectId, isStoreReady, projectData, loadProjectData])

  // Initialize question flow if no business context exists
  useEffect(() => {
    if (!businessContext && !currentQuestion && startQuestionFlow) {
      logger.info('🎯 No business context found, starting question flow')
      startQuestionFlow('', projectId)
    }
  }, [businessContext, currentQuestion, startQuestionFlow, projectId])

  return (
    <div className="flex flex-col h-app overflow-hidden">
      {children}
    </div>
  )
}