/**
 * Match Decline Dialog
 *
 * Shows options after user declines a match:
 * 1. Find a different advisor (retry with exclusion)
 * 2. Browse all advisors (manual selection)
 * 3. Maybe later (dismiss)
 *
 * Following backend team's recommendation from ADVISOR_MATCHING_API_GUIDE.md
 */

'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'

export interface MatchDeclineOption {
  id: 'retry' | 'browse' | 'later'
  icon: string
  label: string
  description: string
}

export interface MatchDeclineDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelectOption: (optionId: 'retry' | 'browse' | 'later') => void
  translations: {
    title: string
    description: string
    retryLabel: string
    retryDescription: string
    browseLabel: string
    browseDescription: string
    laterLabel: string
    laterDescription: string
  }
}

export function MatchDeclineDialog({
  isOpen,
  onClose,
  onSelectOption,
  translations
}: MatchDeclineDialogProps) {
  const options: MatchDeclineOption[] = [
    {
      id: 'retry',
      icon: 'refresh-cw',
      label: translations.retryLabel,
      description: translations.retryDescription
    },
    {
      id: 'browse',
      icon: 'users',
      label: translations.browseLabel,
      description: translations.browseDescription
    },
    {
      id: 'later',
      icon: 'clock',
      label: translations.laterLabel,
      description: translations.laterDescription
    }
  ]

  const handleSelectOption = (optionId: 'retry' | 'browse' | 'later') => {
    onSelectOption(optionId)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translations.title}</DialogTitle>
          <DialogDescription>{translations.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSelectOption(option.id)}
              className={cn(
                'w-full text-start p-4 rounded-lg border-2 transition-all',
                'hover:border-primary hover:bg-accent',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'bg-card border-border'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
                    option.id === 'retry' && 'bg-blue-100 dark:bg-blue-900/20',
                    option.id === 'browse' && 'bg-purple-100 dark:bg-purple-900/20',
                    option.id === 'later' && 'bg-gray-100 dark:bg-gray-800'
                  )}
                >
                  <Icon
                    name={option.icon as any}
                    className={cn(
                      'h-5 w-5',
                      option.id === 'retry' && 'text-blue-600 dark:text-blue-400',
                      option.id === 'browse' && 'text-purple-600 dark:text-purple-400',
                      option.id === 'later' && 'text-gray-600 dark:text-gray-400'
                    )}
                  />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-foreground mb-1">{option.label}</h4>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
                <Icon name="chevron-right" className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}