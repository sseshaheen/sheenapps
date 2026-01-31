'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import Icon from '@/components/ui/icon'
import { useToastWithUndo } from '@/components/ui/toast-with-undo'
import {
  buildWhatsAppShareUrl,
  copyToClipboard,
  getShareText,
  tryNativeShare
} from '@/lib/share/share-utils'
import { cn } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'

// Lazy load QRCode to avoid SSR issues
const QRCodeSVG = dynamic(
  () => import('qrcode.react').then(mod => mod.QRCodeSVG),
  { ssr: false, loading: () => <div className="w-24 h-24 bg-gray-200 animate-pulse rounded" /> }
)

interface PublishSuccessModalProps {
  isOpen: boolean
  onClose: () => void
  isFirstPublish: boolean
  liveUrl: string
  versionLabel: string
  projectName: string
}

/**
 * Publish Success Modal
 *
 * Shows celebration for first publish, utility for subsequent publishes.
 * Features: URL copy, QR code, WhatsApp share (MENA priority), native share API.
 *
 * See: WORKSPACE_SIMPLIFICATION_PLAN.md Phase 4 - Publish Success Flow
 */
export function PublishSuccessModal({
  isOpen,
  onClose,
  isFirstPublish,
  liveUrl,
  versionLabel,
  projectName
}: PublishSuccessModalProps) {
  const locale = useLocale()
  const t = useTranslations('builder.workspace.publishSuccess')
  const { success: showSuccessToast, error: showErrorToast } = useToastWithUndo()
  const [copied, setCopied] = useState(false)

  const isRTL = locale.startsWith('ar')
  const shareText = getShareText(liveUrl, locale)

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(liveUrl)
    if (success) {
      setCopied(true)
      showSuccessToast(t('copied'))
      setTimeout(() => setCopied(false), 2000)
    } else {
      showErrorToast(t('copyFailed'))
    }
  }, [liveUrl, showSuccessToast, showErrorToast, t])

  const handleShare = useCallback(async () => {
    // Try native share first (mobile)
    const shared = await tryNativeShare({
      title: projectName,
      text: shareText,
      url: liveUrl
    })

    if (shared) return

    // Desktop fallback: WhatsApp is king for MENA
    window.open(buildWhatsAppShareUrl(shareText), '_blank', 'noreferrer')
  }, [projectName, shareText, liveUrl])

  const handleOpenSite = useCallback(() => {
    window.open(liveUrl, '_blank', 'noreferrer')
  }, [liveUrl])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn('max-w-lg', isRTL && 'text-right')}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
              <Icon name="check" className="h-5 w-5 text-green-600" />
            </span>
            <span className="text-xl">
              {isFirstPublish ? t('titleFirst') : t('titleSuccess')}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* URL Section */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
            <div className="text-xs text-muted-foreground mb-2">{versionLabel}</div>
            <div className="flex items-center justify-between gap-3">
              <code className="text-sm break-all font-mono flex-1 text-gray-900 dark:text-gray-100">
                {liveUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="shrink-0"
              >
                <Icon
                  name={copied ? 'check' : 'copy'}
                  className={cn('h-4 w-4', !isRTL && 'mr-1.5', isRTL && 'ml-1.5')}
                />
                {copied ? t('copied') : t('copy')}
              </Button>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="shrink-0 bg-white p-2 rounded-lg">
              <QRCodeSVG
                value={liveUrl}
                size={96}
                level="M"
                includeMargin={false}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {t('qrDescription')}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleOpenSite} className="flex-1">
              <Icon
                name="external-link"
                className={cn('h-4 w-4', !isRTL && 'mr-2', isRTL && 'ml-2')}
              />
              {t('viewSite')}
            </Button>

            <Button variant="outline" onClick={handleShare} className="flex-1">
              <Icon
                name="share-2"
                className={cn('h-4 w-4', !isRTL && 'mr-2', isRTL && 'ml-2')}
              />
              {t('share')}
            </Button>
          </div>

          {/* First publish celebration message */}
          {isFirstPublish && (
            <div className="text-sm text-muted-foreground text-center pt-2 border-t border-gray-200 dark:border-gray-700">
              {t('celebrationMessage')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
