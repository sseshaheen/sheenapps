'use client'

import React, { useState } from 'react'
import { m } from '@/components/ui/motion-provider'
import { GeneratedBusinessContent, BusinessAnalysis } from '@/services/ai/types'
import { ChatInterface } from './orchestration/chat-interface'
import { ProgressTracker } from './orchestration/progress-tracker'
import { PreviewManager } from './orchestration/preview-manager'

interface OrchestrationInterfaceProps {
  initialIdea: string
  translations: {
    chat: {
      title: string
      thinking: string
    }
    preview: {
      title: string
      loading: string
    }
    buildLog: {
      title: string
      steps: {
        analyzing: string
        scaffolding: string
        generating: string
        styling: string
        deploying: string
      }
    }
  }
}

interface OrchestrationState {
  aiGeneratedContent: GeneratedBusinessContent | null
  aiAnalysis: BusinessAnalysis | null
  buildProgress: number
  isGenerating: boolean
}

export function OrchestrationInterface({ 
  initialIdea, 
  translations 
}: OrchestrationInterfaceProps) {
  const [orchestrationState, setOrchestrationState] = useState<OrchestrationState>({
    aiGeneratedContent: null,
    aiAnalysis: null,
    buildProgress: 0,
    isGenerating: false
  })

  // Handle analysis completion from chat interface
  const handleAnalysisComplete = (businessContent: GeneratedBusinessContent) => {
    setOrchestrationState(prev => ({
      ...prev,
      aiGeneratedContent: businessContent,
      aiAnalysis: businessContent.analysis,
      buildProgress: 50,
      isGenerating: false
    }))
  }

  // Handle progress updates
  const handleProgressUpdate = (progress: number) => {
    setOrchestrationState(prev => ({
      ...prev,
      buildProgress: progress
    }))
  }

  // Handle preview editing
  const handleEdit = (section: string) => {
    console.log('Edit section:', section)
    // TODO: Implement section editing logic
  }

  const handleRegenerate = (section: string) => {
    console.log('Regenerate section:', section)
    // TODO: Implement section regeneration logic
  }

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-screen bg-gray-950 text-white"
    >
      {/* Left Panel - Chat Interface */}
      <m.div
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
      >
        <ChatInterface
          initialIdea={initialIdea}
          onAnalysisComplete={handleAnalysisComplete}
          onProgressUpdate={handleProgressUpdate}
          translations={translations}
        />
      </m.div>

      {/* Center Panel - Preview Manager */}
      <PreviewManager
        content={orchestrationState.aiGeneratedContent}
        analysis={orchestrationState.aiAnalysis}
        isGenerating={orchestrationState.isGenerating}
        buildProgress={orchestrationState.buildProgress}
        onEdit={handleEdit}
        onRegenerate={handleRegenerate}
        translations={translations}
      />

      {/* Right Panel - Progress Tracker */}
      <ProgressTracker
        buildProgress={orchestrationState.buildProgress}
        onProgressUpdate={handleProgressUpdate}
        translations={translations}
      />
    </m.div>
  )
}