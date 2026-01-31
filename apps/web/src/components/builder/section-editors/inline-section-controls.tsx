// Inline Section Controls - Undo/Redo buttons directly beside Edit button
// Clear, contextual, and section-specific

'use client'

import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { usePerSectionHistoryStore } from '@/stores/per-section-history-store'

interface InlineSectionControlsProps {
  layoutId: string
  sectionType: string
  sectionId: string
  sectionName: string
  onEdit: () => void
  onUndo: (content: any) => void
  onRedo: (content: any) => void
  className?: string
}

export function InlineSectionControls({
  layoutId,
  sectionType,
  sectionId,
  sectionName,
  onEdit,
  onUndo,
  onRedo,
  className = ''
}: InlineSectionControlsProps) {
  const { canUndo, canRedo, undo, redo, getHistoryInfo } = usePerSectionHistoryStore()
  
  const hasUndo = canUndo(layoutId, sectionType, sectionId)
  const hasRedo = canRedo(layoutId, sectionType, sectionId)
  const historyInfo = getHistoryInfo(layoutId, sectionType, sectionId)

  const handleUndo = () => {
    const previousEdit = undo(layoutId, sectionType, sectionId)
    if (previousEdit) {
      onUndo(previousEdit.content)
    }
  }

  const handleRedo = () => {
    const nextEdit = redo(layoutId, sectionType, sectionId)
    if (nextEdit) {
      onRedo(nextEdit.content)
    }
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Edit Button */}
      <m.button
        onClick={onEdit}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Icon name="edit" size={14}  />
        Edit
      </m.button>

      {/* Undo Button */}
      <AnimatePresence>
        {hasUndo && (
          <m.button
            initial={{ opacity: 0, scale: 0.8, width: 0 }}
            animate={{ opacity: 1, scale: 1, width: 'auto' }}
            exit={{ opacity: 0, scale: 0.8, width: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleUndo}
            className="group relative flex items-center justify-center w-8 h-8 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
            title={`Undo: ${historyInfo.lastAction || 'Previous change'}`}
          >
            <Icon name="undo-2" size={14}  />
            
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              Undo: {historyInfo.lastAction || 'Previous change'}
            </div>
          </m.button>
        )}
      </AnimatePresence>

      {/* Redo Button */}
      <AnimatePresence>
        {hasRedo && (
          <m.button
            initial={{ opacity: 0, scale: 0.8, width: 0 }}
            animate={{ opacity: 1, scale: 1, width: 'auto' }}
            exit={{ opacity: 0, scale: 0.8, width: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            onClick={handleRedo}
            className="group relative flex items-center justify-center w-8 h-8 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
            title="Redo next change"
          >
            <Icon name="redo-2" size={14}  />
            
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              Redo next change
            </div>
          </m.button>
        )}
      </AnimatePresence>

      {/* Visual indicator when history exists */}
      {(hasUndo || hasRedo) && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-1 h-1 bg-blue-400 rounded-full"
          title={`${sectionName} has edit history`}
        />
      )}
    </div>
  )
}