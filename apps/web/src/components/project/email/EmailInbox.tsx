'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow } from 'date-fns'
import {
  Mail, Paperclip, Circle, Archive, Trash2, Eye, EyeOff,
  MoreHorizontal, ChevronLeft, ChevronRight, Copy, Check,
  Inbox as InboxIcon, MessageSquare,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  useInboxMessages, useUpdateMessage, useDeleteMessage,
  type InboxMessage,
} from '@/hooks/use-inbox-messages'
import { useInboxThreads, useInboxThread, type InboxThread } from '@/hooks/use-inbox-threads'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useInboxConfig } from '@/hooks/use-inbox-config'
import { safeCopy } from '@/utils/clipboard'

interface EmailInboxProps {
  projectId: string
}

const PAGE_SIZE = 50

export function EmailInbox({ projectId }: EmailInboxProps) {
  const t = useTranslations('project-email')
  const [subTab, setSubTab] = useState<'messages' | 'threads'>('messages')

  const { data: config } = useInboxConfig(projectId)
  const [addressCopied, setAddressCopied] = useState(false)

  async function handleCopyAddress() {
    if (!config?.inboxAddress) return
    const ok = await safeCopy(config.inboxAddress)
    if (!ok) return toast.error(t('common.copyFailed'))
    setAddressCopied(true)
    setTimeout(() => setAddressCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Inbox address callout */}
      {config?.inboxAddress && (
        <div className="bg-muted/50 rounded-lg px-4 py-3 flex items-center gap-3">
          <InboxIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-mono text-foreground truncate">{config.inboxAddress}</span>
          <Button variant="ghost" size="sm" className="flex-shrink-0 h-7 px-2" onClick={handleCopyAddress}>
            {addressCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as 'messages' | 'threads')}>
        <div className="overflow-x-auto">
          <TabsList className="w-max min-w-full">
            <TabsTrigger value="messages" className="whitespace-nowrap">
              <Mail className="h-4 w-4 me-1.5" />
              {t('inbox.title')}
            </TabsTrigger>
            <TabsTrigger value="threads" className="whitespace-nowrap">
              <MessageSquare className="h-4 w-4 me-1.5" />
              {t('threads.title')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="messages" className="mt-4">
          <MessagesView projectId={projectId} />
        </TabsContent>
        <TabsContent value="threads" className="mt-4">
          <ThreadsView projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MessagesView({ projectId }: { projectId: string }) {
  const t = useTranslations('project-email')
  const [offset, setOffset] = useState(0)
  const [filterUnread, setFilterUnread] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null)

  const { data, isLoading } = useInboxMessages(projectId, {
    limit: PAGE_SIZE,
    offset,
    unreadOnly: filterUnread ? 'true' : undefined,
  })
  const updateMessage = useUpdateMessage(projectId)
  const deleteMessage = useDeleteMessage(projectId)

  const messages = data?.messages ?? []
  const total = data?.total ?? 0
  const hasNext = offset + PAGE_SIZE < total
  const hasPrev = offset > 0

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
  }

  if (messages.length === 0 && offset === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <InboxIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p>{t('inbox.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Button
          variant={filterUnread ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilterUnread(!filterUnread); setOffset(0) }}
        >
          {filterUnread ? t('inbox.unread', { count: total }) : t('inbox.title')}
        </Button>
      </div>

      {/* Messages list */}
      <div className="border border-border rounded-lg divide-y divide-border">
        {messages.map((msg) => (
          <button
            key={msg.id}
            type="button"
            className="w-full text-start px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
            onClick={() => {
              setSelectedMessage(msg)
              if (!msg.isRead) {
                updateMessage.mutate({ messageId: msg.id, updates: { isRead: true } })
              }
            }}
          >
            {!msg.isRead && (
              <Circle className="h-2.5 w-2.5 fill-primary text-primary flex-shrink-0" />
            )}
            {msg.isRead && <span className="w-2.5 flex-shrink-0" />}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm truncate ${msg.isRead ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>
                  {msg.from}
                </span>
                {msg.attachmentCount > 0 && (
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
              </div>
              <p className={`text-sm truncate ${msg.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>
                {msg.subject || '(no subject)'}
              </p>
              {msg.snippet && (
                <p className="text-xs text-muted-foreground truncate">{msg.snippet}</p>
              )}
            </div>

            <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
              {formatDistanceToNow(new Date(msg.receivedAt), { addSuffix: true })}
            </span>
          </button>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setOffset(offset - PAGE_SIZE)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setOffset(offset + PAGE_SIZE)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Message Detail Dialog */}
      {selectedMessage && (
        <MessageDetailDialog
          message={selectedMessage}
          projectId={projectId}
          onClose={() => setSelectedMessage(null)}
          onToggleRead={(id, isRead) => {
            updateMessage.mutate({ messageId: id, updates: { isRead } })
          }}
          onArchive={(id) => {
            updateMessage.mutate({ messageId: id, updates: { isArchived: true } })
            setSelectedMessage(null)
          }}
          onDelete={(id) => {
            deleteMessage.mutate(id)
            setSelectedMessage(null)
          }}
        />
      )}
    </div>
  )
}

function MessageDetailDialog({
  message,
  projectId,
  onClose,
  onToggleRead,
  onArchive,
  onDelete,
}: {
  message: InboxMessage
  projectId: string
  onClose: () => void
  onToggleRead: (id: string, isRead: boolean) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const t = useTranslations('project-email')
  const [showHtml, setShowHtml] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [allowRemoteImages, setAllowRemoteImages] = useState(false)

  const htmlTooLarge = message.htmlBody && message.htmlBody.length > 500_000

  // Default CSP blocks remote images (tracking pixels). User can opt-in.
  // sandbox="" blocks breakout/popups but in-iframe navigation can still occur.
  // navigate-to has no browser support yet but documents intent; base-uri/form-action are enforced.
  const csp = allowRemoteImages
    ? "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; navigate-to 'none';"
    : "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; navigate-to 'none';"

  const safeSrcDoc = message.htmlBody && !htmlTooLarge
    ? `<!doctype html><html><head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="${csp}" /></head><body>${message.htmlBody}</body></html>`
    : undefined

  return (
    <>
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{message.subject || '(no subject)'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Headers */}
          <div className="text-sm space-y-1">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-14 flex-shrink-0">{t('common.from')}</span>
              <span className="text-foreground">{message.from}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-14 flex-shrink-0">{t('common.to')}</span>
              <span className="text-foreground">{message.to}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-14 flex-shrink-0">{t('common.date')}</span>
              <span className="text-foreground">
                {new Date(message.receivedAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="border-t border-border pt-4">
            {showHtml && safeSrcDoc ? (
              <div className="space-y-1">
                <iframe
                  sandbox=""
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  srcDoc={safeSrcDoc}
                  className="w-full min-h-[300px] border border-border rounded"
                  title="Email HTML preview"
                />
                <p className="text-xs text-muted-foreground">{t('inbox.linksDisabled')}</p>
              </div>
            ) : (
              <pre className="text-sm whitespace-pre-wrap text-foreground font-sans">
                {message.textBody || '(no text content)'}
              </pre>
            )}
          </div>

          {/* HTML toggle */}
          {message.htmlBody && (
            <div className="flex items-center gap-2">
              {htmlTooLarge ? (
                <p className="text-xs text-muted-foreground">{t('inbox.htmlTooLarge')}</p>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setShowHtml(!showHtml)}>
                    {showHtml ? t('inbox.title') : t('inbox.viewHtml')}
                  </Button>
                  {showHtml && (
                    <Button
                      variant={allowRemoteImages ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAllowRemoteImages(v => !v)}
                    >
                      {allowRemoteImages ? t('inbox.remoteImagesOn') : t('inbox.remoteImagesOff')}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Attachments */}
          {message.attachmentCount > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t('inbox.attachments')}</h4>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: message.attachmentCount }, (_, i) => (
                  <Button key={i} variant="outline" size="sm" asChild>
                    <a
                      href={`/api/inhouse/projects/${projectId}/inbox/messages/${message.id}/attachments/${i}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Paperclip className="h-3.5 w-3.5 me-1.5" />
                      {t('inbox.download')} #{i + 1}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleRead(message.id, !message.isRead)}
            >
              {message.isRead ? (
                <><EyeOff className="h-4 w-4 me-1.5" />{t('inbox.markUnread')}</>
              ) : (
                <><Eye className="h-4 w-4 me-1.5" />{t('inbox.markRead')}</>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onArchive(message.id)}>
              <Archive className="h-4 w-4 me-1.5" />
              {t('inbox.archive')}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  {t('inbox.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={showDeleteConfirm}
      onOpenChange={setShowDeleteConfirm}
      title={t('inbox.delete')}
      description={t('inbox.deleteConfirm')}
      confirmLabel={t('inbox.delete')}
      cancelLabel={t('common.cancel')}
      variant="destructive"
      onConfirm={() => onDelete(message.id)}
    />
    </>
  )
}

function ThreadsView({ projectId }: { projectId: string }) {
  const t = useTranslations('project-email')
  const [offset, setOffset] = useState(0)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)

  const { data, isLoading } = useInboxThreads(projectId, {
    limit: PAGE_SIZE,
    offset,
  })

  const threads = data?.threads ?? []
  const total = data?.total ?? 0
  const hasNext = offset + PAGE_SIZE < total
  const hasPrev = offset > 0

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
  }

  if (threads.length === 0 && offset === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p>{t('threads.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-lg divide-y divide-border">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className="w-full text-start px-4 py-3 hover:bg-muted/50 transition-colors"
            onClick={() => setSelectedThreadId(thread.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {thread.subject || '(no subject)'}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {thread.unreadCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {thread.unreadCount}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {thread.messageCount} {t('threads.messages').toLowerCase()}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {thread.participants.join(', ')}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(thread.lastActivityAt), { addSuffix: true })}
            </p>
          </button>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setOffset(offset - PAGE_SIZE)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setOffset(offset + PAGE_SIZE)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Thread Detail Dialog */}
      {selectedThreadId && (
        <ThreadDetailDialog
          projectId={projectId}
          threadId={selectedThreadId}
          onClose={() => setSelectedThreadId(null)}
        />
      )}
    </div>
  )
}

function ThreadDetailDialog({
  projectId,
  threadId,
  onClose,
}: {
  projectId: string
  threadId: string
  onClose: () => void
}) {
  const t = useTranslations('project-email')
  const { data, isLoading } = useInboxThread(projectId, threadId)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {data?.thread?.subject || t('common.loading')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
        ) : (
          <div className="space-y-4">
            {data?.messages?.map((msg) => (
              <div key={msg.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{msg.from}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.receivedAt).toLocaleString()}
                  </span>
                </div>
                <pre className="text-sm whitespace-pre-wrap font-sans text-foreground">
                  {msg.textBody || '(no text content)'}
                </pre>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
