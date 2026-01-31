/**
 * Question Response Display Component
 * Renders Q&A responses with code references and related questions
 */

'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UsageFooter } from './usage-footer'
import { 
  MessageCircleQuestion, 
  Code, 
  ExternalLink, 
  ChevronRight, 
  Copy,
  Check,
  FileText,
  ArrowRight
} from 'lucide-react'
import { type QuestionResponse } from '@/types/chat-plan'

interface QuestionResponseProps {
  response: QuestionResponse
  onRelatedQuestion?: (question: string) => void
  className?: string
  translations?: {
    title?: string
    codeReferences?: string
    relatedQuestions?: string
    lineNumber?: string
    lines?: string
    viewFile?: string
    askRelated?: string
    copied?: string
    copy?: string
  }
}

const defaultTranslations = {
  title: 'Answer',
  codeReferences: 'Code References',
  relatedQuestions: 'Related Questions',
  lineNumber: 'Line',
  lines: 'Lines',
  viewFile: 'View File',
  askRelated: 'Ask this',
  copied: 'Copied!',
  copy: 'Copy'
}

export function QuestionResponse({
  response,
  onRelatedQuestion,
  className = '',
  translations = defaultTranslations
}: QuestionResponseProps) {
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})

  const t = { ...defaultTranslations, ...translations }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedStates(prev => ({ ...prev, [id]: true }))
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [id]: false }))
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <Card className={`p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30">
          <MessageCircleQuestion className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t.title}
          </h3>
          
          {/* Main Answer */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <div 
              className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: response.answer.replace(/\n/g, '<br />')
              }}
            />
          </div>
        </div>
      </div>

      {/* Code References */}
      {response.code_references && response.code_references.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Code className="w-5 h-5" />
            {t.codeReferences}
          </h4>

          <div className="space-y-3">
            {response.code_references.map((ref, index) => (
              <div 
                key={index}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                {/* File header */}
                <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                      {ref.file}
                    </span>
                    
                    {/* Line numbers */}
                    <Badge variant="outline">
                      {ref.line_end ? (
                        `${t.lines} ${ref.line_start}-${ref.line_end}`
                      ) : (
                        `${t.lineNumber} ${ref.line_start}`
                      )}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(ref.file, `file-${index}`)}
                    >
                      {copiedStates[`file-${index}`] ? (
                        <>
                          <Check className="w-3 h-3 mr-1" />
                          {t.copied}
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 mr-1" />
                          {t.copy}
                        </>
                      )}
                    </Button>
                    
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {t.viewFile}
                    </Button>
                  </div>
                </div>

                {/* Code snippet */}
                {/* Removed explanation field as it doesn't exist in the type */}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Questions */}
      {response.related_questions && response.related_questions.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <MessageCircleQuestion className="w-5 h-5" />
            {t.relatedQuestions}
          </h4>

          <div className="space-y-2">
            {response.related_questions.map((question, index) => (
              <div
                key={index}
                className="group flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="text-gray-700 dark:text-gray-300 text-sm flex-1 pr-3">
                  {question}
                </span>

                {onRelatedQuestion && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRelatedQuestion(question)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {t.askRelated}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage Footer */}
      <UsageFooter metadata={response.metadata} />
    </Card>
  )
}

/**
 * Compact question response for timeline view
 */
export function CompactQuestionResponse({ 
  response, 
  onExpand,
  onRelatedQuestion
}: { 
  response: QuestionResponse
  onExpand?: () => void
  onRelatedQuestion?: (question: string) => void
}) {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
          <MessageCircleQuestion className="w-4 h-4" />
          Question Answered
        </h4>
      </div>

      <p className="text-blue-800 dark:text-blue-300 text-sm line-clamp-3">
        {response.answer}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-blue-700 dark:text-blue-400">
          {response.code_references && response.code_references.length > 0 && (
            <span>{response.code_references.length} code refs</span>
          )}
          {response.related_questions && response.related_questions.length > 0 && (
            <span>{response.related_questions.length} related</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {response.related_questions && response.related_questions.length > 0 && onRelatedQuestion && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onRelatedQuestion(response.related_questions![0])}
            >
              Ask Related
            </Button>
          )}
          
          {onExpand && (
            <Button variant="ghost" size="sm" onClick={onExpand}>
              View Full
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Quick question component for asking follow-up questions
 */
interface QuickQuestionProps {
  questions: string[]
  onSelect: (question: string) => void
  className?: string
}

export function QuickQuestions({ questions, onSelect, className = '' }: QuickQuestionProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <h5 className="text-sm font-medium text-gray-600 dark:text-gray-400">
        Quick questions:
      </h5>
      
      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            onClick={() => onSelect(question)}
            className="text-left h-auto py-2 px-3 whitespace-normal"
          >
            <ChevronRight className="w-3 h-3 mr-1 flex-shrink-0" />
            <span className="text-xs">{question}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}