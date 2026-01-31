'use client'

import React, { useState, useRef, useCallback } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getDirection } from '@/utils/rtl'

interface IdeaCaptureModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onIdeaSubmit: (idea: string, attachments?: File[]) => void
  locale: string
  translations: {
    title: string
    description: string
    placeholder: string
    submitButton: string
    voiceButton: string
    attachButton: string
    examples: string[]
  }
}

export function IdeaCaptureModal({
  open,
  onOpenChange,
  onIdeaSubmit,
  locale,
  translations,
}: IdeaCaptureModalProps) {
  const [idea, setIdea] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [focusedExample, setFocusedExample] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const direction = getDirection(locale)

  const handleSubmit = useCallback(async () => {
    if (!idea.trim() || isSubmitting) return

    setIsSubmitting(true)
    
    // Animate submit button
    await new Promise(resolve => setTimeout(resolve, 300))
    
    onIdeaSubmit(idea, attachments)
    
    // Reset state
    setIdea('')
    setAttachments([])
    setIsSubmitting(false)
  }, [idea, attachments, isSubmitting, onIdeaSubmit])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleExampleClick = (example: string) => {
    setIdea(example)
    textareaRef.current?.focus()
  }

  const toggleRecording = () => {
    setIsRecording(!isRecording)
    // Voice recording will be implemented later
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setAttachments(prev => [...prev, ...files])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-gray-950/98 border-gray-800/50 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
            <Icon name="sparkles" className="w-6 h-6 text-purple-400"  />
            {translations.title}
          </DialogTitle>
          <DialogDescription className="text-gray-400 mt-2">
            {translations.description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-4">
          {/* Example chips */}
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {translations.examples.map((example, index) => (
                <m.button
                  key={example}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleExampleClick(example)}
                  onMouseEnter={() => setFocusedExample(index)}
                  onMouseLeave={() => setFocusedExample(null)}
                  className={cn(
                    'px-3 py-1 rounded-full text-sm transition-all duration-200',
                    'bg-gray-800/50 border border-gray-700/50 hover:border-purple-500/50',
                    'hover:bg-gray-800 hover:shadow-lg hover:shadow-purple-500/10',
                    focusedExample === index && 'border-purple-500/50 bg-gray-800'
                  )}
                >
                  {example}
                </m.button>
              ))}
            </AnimatePresence>
          </div>

          {/* Main textarea */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              dir={direction}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={translations.placeholder}
              className={cn(
                'w-full min-h-[120px] p-4 rounded-lg resize-none',
                'bg-gray-900/50 border border-gray-800 focus:border-purple-500/50',
                'text-gray-100 placeholder-gray-500',
                'focus:outline-none focus:ring-2 focus:ring-purple-500/20',
                'transition-all duration-200',
                direction === 'rtl' && 'text-right'
              )}
              autoFocus
            />
            
            {/* Character count */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: idea.length > 0 ? 1 : 0 }}
              className="absolute bottom-2 right-2 text-xs text-gray-500"
            >
              {idea.length} / 500
            </m.div>
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex flex-wrap gap-2"
            >
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="px-3 py-1 rounded-full bg-gray-800 text-sm flex items-center gap-2"
                >
                  <Icon name="paperclip" className="w-3 h-3"  />
                  {file.name}
                </div>
              ))}
            </m.div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={toggleRecording}
                disabled
                className={cn(
                  'p-3 rounded-lg transition-all duration-200',
                  'bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50',
                  'hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed',
                  isRecording && 'bg-red-500/20 border-red-500/50'
                )}
                title="Voice input coming soon"
              >
                {isRecording ? (
                  <Icon name="mic" className="w-5 h-5 text-red-400"  />
                ) : (
                  <Icon name="mic-off" className="w-5 h-5 text-gray-400"  />
                )}
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'p-3 rounded-lg transition-all duration-200',
                  'bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50',
                  'hover:border-gray-600'
                )}
              >
                <Icon name="paperclip" className="w-5 h-5 text-gray-400"  />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,.pdf,.fig,.sketch"
                multiple
              />
            </div>

            <m.button
              onClick={handleSubmit}
              disabled={!idea.trim() || isSubmitting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'px-6 py-3 rounded-lg font-medium transition-all duration-200',
                'bg-gradient-to-r from-purple-600 to-pink-600',
                'hover:from-purple-500 hover:to-pink-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-2 group'
              )}
            >
              {isSubmitting ? (
                <m.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                />
              ) : (
                <>
                  {translations.submitButton}
                  <Icon name="arrow-right" className="w-4 h-4 group-hover:translate-x-1 transition-transform"  />
                </>
              )}
            </m.button>
          </div>

          {/* Shortcut hint */}
          <p className="text-xs text-gray-500 text-center">
            Press <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-400">⌘</kbd> + <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-400">Enter</kbd> to submit
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}