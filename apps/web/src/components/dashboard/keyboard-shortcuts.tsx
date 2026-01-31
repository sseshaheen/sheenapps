'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const shortcuts = [
  { keys: ['/', 'Search'], description: 'Focus search box' },
  { keys: ['Esc'], description: 'Clear search / Close dialogs' },
  { keys: ['↑', '↓', '←', '→'], description: 'Navigate projects' },
  { keys: ['Enter', 'Space'], description: 'Open selected project' },
  { keys: ['⌘/Ctrl', 'R'], description: 'Rename selected project' },
  { keys: ['⌘/Ctrl', 'D'], description: 'Duplicate selected project' },
  { keys: ['Delete'], description: 'Delete selected project' },
  { keys: ['Home'], description: 'Jump to first project' },
  { keys: ['End'], description: 'Jump to last project' },
]

export function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="hidden lg:flex"
        title="Keyboard shortcuts"
      >
        <Icon name="settings" className="w-4 h-4" />
        <span className="sr-only">Keyboard shortcuts</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {shortcuts.map((shortcut, index) => (
              <div key={index} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600">{shortcut.description}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, i) => (
                    <kbd
                      key={i}
                      className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}