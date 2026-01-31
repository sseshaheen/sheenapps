'use client'

import React, { useCallback, useState } from 'react'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { IdeaCaptureModal } from './idea-capture-modal'
import { OrchestrationInterface } from './orchestration-interface'

interface BuilderWrapperProps {
  locale: string
  translations: {
    floatingButton: string
    ideaCapture: {
      title: string
      description: string
      placeholder: string
      submitButton: string
      voiceButton: string
      attachButton: string
      examples: string[]
    }
    builder: {
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
}

export function BuilderWrapper({ locale, translations }: BuilderWrapperProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [idea, setIdea] = useState<string | null>(null)

  const handleIdeaSubmit = useCallback((ideaText: string) => {
    setIdea(ideaText)
    setIsModalOpen(false)
    setIsBuilderOpen(true)
  }, [])

  const handleOpenBuilder = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  return (
    <>
      {/* Floating action button */}
      <m.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: 'spring' }}
        onClick={handleOpenBuilder}
        className="fixed bottom-6 right-6 z-40 group"
      >
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity" />
          
          {/* Button */}
          <div className="relative bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-full font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            {translations.floatingButton}
          </div>
        </div>
      </m.button>

      {/* Keyboard shortcut listener */}
      <div
        onKeyDown={(e) => {
          if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleOpenBuilder()
          }
        }}
        tabIndex={-1}
        className="sr-only"
      />

      {/* Idea capture modal */}
      <IdeaCaptureModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onIdeaSubmit={handleIdeaSubmit}
        locale={locale}
        translations={translations.ideaCapture}
      />

      {/* Builder interface */}
      <AnimatePresence>
        {isBuilderOpen && idea && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
          >
            <OrchestrationInterface
              initialIdea={idea}
              translations={translations.builder}
            />

            {/* Close button */}
            <button
              onClick={() => setIsBuilderOpen(false)}
              className="absolute top-4 right-4 z-50 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors"
              aria-label="Close builder"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}