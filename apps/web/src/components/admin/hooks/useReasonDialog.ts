/**
 * Hook for imperatively triggering ReasonDialog
 * Makes it easy to await a reason before performing an action
 */

'use client'

import { useCallback, useRef, useState } from 'react'

interface ReasonDialogOptions {
  title?: string
  description?: string
  placeholder?: string
  confirmText?: string
  confirmVariant?: 'default' | 'destructive'
  requireReason?: boolean
  multiline?: boolean
}

interface ReasonDialogState extends ReasonDialogOptions {
  open: boolean
}

/**
 * Hook for awaiting a reason before performing admin actions
 *
 * @example
 * const { askReason, dialogProps } = useReasonDialog()
 *
 * const handleDelete = async (id: string) => {
 *   const reason = await askReason({
 *     title: 'Delete item?',
 *     description: 'This action cannot be undone.',
 *     confirmText: 'Delete',
 *     confirmVariant: 'destructive',
 *   })
 *   if (!reason) return // User cancelled
 *
 *   await deleteItem(id, reason)
 * }
 *
 * return (
 *   <>
 *     <ReasonDialog {...dialogProps} />
 *     <Button onClick={() => handleDelete(item.id)}>Delete</Button>
 *   </>
 * )
 */
export function useReasonDialog() {
  const [state, setState] = useState<ReasonDialogState>({
    open: false,
    title: 'Provide a reason',
    confirmText: 'Confirm',
    confirmVariant: 'default',
    requireReason: true,
    multiline: false,
  })

  // Store the resolve function for the current promise
  const resolverRef = useRef<((value: string | null) => void) | null>(null)

  const askReason = useCallback((options: ReasonDialogOptions = {}) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve
      setState({
        open: true,
        title: options.title ?? 'Provide a reason',
        description: options.description,
        placeholder: options.placeholder,
        confirmText: options.confirmText ?? 'Confirm',
        confirmVariant: options.confirmVariant ?? 'default',
        requireReason: options.requireReason ?? true,
        multiline: options.multiline ?? false,
      })
    })
  }, [])

  const handleClose = useCallback(() => {
    setState((s) => ({ ...s, open: false }))
    resolverRef.current?.(null)
    resolverRef.current = null
  }, [])

  const handleConfirm = useCallback(async (reason: string) => {
    setState((s) => ({ ...s, open: false }))
    resolverRef.current?.(reason)
    resolverRef.current = null
  }, [])

  // Props to spread onto ReasonDialog
  const dialogProps = {
    open: state.open,
    title: state.title ?? 'Provide a reason',
    description: state.description,
    placeholder: state.placeholder,
    confirmText: state.confirmText,
    confirmVariant: state.confirmVariant,
    requireReason: state.requireReason,
    multiline: state.multiline,
    onClose: handleClose,
    onConfirm: handleConfirm,
  }

  return { askReason, dialogProps }
}
