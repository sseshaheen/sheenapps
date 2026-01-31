'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw, Inbox, MessageSquare, Mail, Paperclip, Eye, Archive, Trash2, Download } from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { ProjectPicker } from '@/components/admin/shared/ProjectPicker'
import { CopyButton } from '@/components/admin/shared/CopyButton'

// =============================================================================
// TYPES
// =============================================================================

interface InboxConfig {
  inboxAddress?: string
  displayName?: string
  autoReplyEnabled?: boolean
  autoReplyMessage?: string
  forwardTo?: string
  retentionDays?: number
}

interface InboxMessage {
  id: string
  project_id: string
  from_email: string
  from_name?: string
  to_email: string
  subject: string
  snippet?: string
  text_body?: string
  html_body?: string
  thread_id?: string
  tag?: string
  attachments?: Attachment[]
  is_read: boolean
  is_archived: boolean
  is_spam: boolean
  headers?: Record<string, string>
  received_at: string
  created_at: string
}

interface Attachment {
  filename: string
  contentType: string
  size: number
  contentId?: string
  storageKey?: string
}

interface InboxThread {
  id: string
  project_id: string
  subject: string
  participants?: string[]
  message_count: number
  unread_count: number
  last_message_at: string
  created_at: string
}

// =============================================================================
// HELPERS
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const HTML_SIZE_LIMIT = 500 * 1024 // 500KB

// =============================================================================
// COMPONENT
// =============================================================================

export function InhouseInboxAdmin() {
  const searchParams = useSearchParams()
  const initialProjectId = searchParams.get('projectId') || ''

  const [projectId, setProjectId] = useState(initialProjectId)
  const [activeTab, setActiveTab] = useState('messages')

  // Config state
  const [config, setConfig] = useState<InboxConfig | null>(null)
  const [aliases, setAliases] = useState<any[]>([])

  // Messages state
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesTotal, setMessagesTotal] = useState(0)
  const [messagesOffset, setMessagesOffset] = useState(0)
  const [readFilter, setReadFilter] = useState('all')
  const [fromFilter, setFromFilter] = useState('')

  // Threads state
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [threadsTotal, setThreadsTotal] = useState(0)
  const [threadsOffset, setThreadsOffset] = useState(0)

  // Message detail
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null)
  const [messageDetailOpen, setMessageDetailOpen] = useState(false)
  const [showHtml, setShowHtml] = useState(false)

  // Thread detail
  const [selectedThread, setSelectedThread] = useState<InboxThread | null>(null)
  const [threadDetailOpen, setThreadDetailOpen] = useState(false)
  const [threadMessages, setThreadMessages] = useState<InboxMessage[]>([])

  const abortRef = useRef<AbortController | null>(null)

  // ------- FETCH CONFIG -------

  const fetchConfig = useCallback(async () => {
    if (!projectId) return
    try {
      const params = new URLSearchParams({ projectId })
      const response = await fetch(`/api/admin/inhouse/inbox/config?${params}`)
      if (!response.ok) return
      const data = await response.json()
      setConfig(data.data?.config || null)
      setAliases(data.data?.aliases || [])
    } catch {
      // non-critical
    }
  }, [projectId])

  // ------- FETCH MESSAGES -------

  const fetchMessages = useCallback(async () => {
    if (!projectId) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setMessagesLoading(true)
    try {
      const params = new URLSearchParams({ projectId, limit: '50', offset: String(messagesOffset) })
      if (readFilter === 'unread') params.set('unreadOnly', 'true')
      if (fromFilter.trim()) params.set('from', fromFilter.trim())

      const response = await fetch(`/api/admin/inhouse/inbox/messages?${params}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Failed to fetch messages')
      const data = await response.json()
      setMessages(data.data?.messages || [])
      setMessagesTotal(data.data?.total || 0)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Failed to load messages')
      }
    } finally {
      setMessagesLoading(false)
    }
  }, [projectId, messagesOffset, readFilter, fromFilter])

  // ------- FETCH THREADS -------

  const fetchThreads = useCallback(async () => {
    if (!projectId) return
    setThreadsLoading(true)
    try {
      const params = new URLSearchParams({ projectId, limit: '50', offset: String(threadsOffset) })
      const response = await fetch(`/api/admin/inhouse/inbox/threads?${params}`)
      if (!response.ok) throw new Error('Failed to fetch threads')
      const data = await response.json()
      setThreads(data.data?.threads || [])
      setThreadsTotal(data.data?.total || 0)
    } catch {
      toast.error('Failed to load threads')
    } finally {
      setThreadsLoading(false)
    }
  }, [projectId, threadsOffset])

  // ------- LOAD ON PROJECT CHANGE -------

  useEffect(() => {
    if (!projectId) return
    fetchConfig()
    fetchMessages()
    fetchThreads()
    return () => { abortRef.current?.abort() }
  }, [fetchConfig, fetchMessages, fetchThreads, projectId])

  const handleRefresh = () => {
    fetchConfig()
    fetchMessages()
    fetchThreads()
  }

  // ------- MESSAGE DETAIL -------

  const handleViewMessage = async (msg: InboxMessage) => {
    setShowHtml(false)
    try {
      const params = new URLSearchParams({ projectId })
      const response = await fetch(`/api/admin/inhouse/inbox/messages/${msg.id}?${params}`)
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      setSelectedMessage(data.data || msg)
    } catch {
      setSelectedMessage(msg)
    }
    setMessageDetailOpen(true)
  }

  const handleMarkRead = async (messageId: string, isRead: boolean) => {
    try {
      const response = await fetch(`/api/admin/inhouse/inbox/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, isRead }),
      })
      if (!response.ok) throw new Error('Failed')
      toast.success(isRead ? 'Marked as read' : 'Marked as unread')
      fetchMessages()
    } catch {
      toast.error('Failed to update message')
    }
  }

  const handleArchive = async (messageId: string, isArchived: boolean) => {
    try {
      const response = await fetch(`/api/admin/inhouse/inbox/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, isArchived }),
      })
      if (!response.ok) throw new Error('Failed')
      toast.success(isArchived ? 'Archived' : 'Unarchived')
      fetchMessages()
    } catch {
      toast.error('Failed to update message')
    }
  }

  const handleDelete = async (messageId: string) => {
    if (!window.confirm('Delete this message permanently?')) return
    try {
      const response = await fetch(`/api/admin/inhouse/inbox/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok && response.status !== 204) throw new Error('Failed')
      toast.success('Message deleted')
      setMessageDetailOpen(false)
      fetchMessages()
    } catch {
      toast.error('Failed to delete message')
    }
  }

  // ------- THREAD DETAIL -------

  const handleViewThread = async (thread: InboxThread) => {
    setSelectedThread(thread)
    setThreadDetailOpen(true)
    setThreadMessages([])
    try {
      const params = new URLSearchParams({ projectId })
      const response = await fetch(`/api/admin/inhouse/inbox/threads/${thread.id}?${params}`)
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      setThreadMessages(data.data?.messages || [])
    } catch {
      toast.error('Failed to load thread messages')
    }
  }

  // ------- ATTACHMENT DOWNLOAD -------

  const handleDownloadAttachment = async (messageId: string, index: number) => {
    try {
      const params = new URLSearchParams({ projectId })
      const response = await fetch(`/api/admin/inhouse/inbox/messages/${messageId}/attachments/${index}?${params}`)
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      if (data.data?.url) {
        window.open(data.data.url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      toast.error('Failed to get download URL')
    }
  }

  // ------- RENDER -------

  return (
    <div className="space-y-6">
      {/* Project Picker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Inbox
          </CardTitle>
          <CardDescription>Monitor inbound email messages and threads</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <ProjectPicker value={projectId} onChange={setProjectId} />
          <Button variant="outline" onClick={handleRefresh} disabled={!projectId}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Config Summary */}
      {projectId && config && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {config.inboxAddress && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Inbox:</span>
                  <span className="font-mono text-xs">{config.inboxAddress}</span>
                  <CopyButton value={config.inboxAddress} size="icon" showToast={false} />
                </div>
              )}
              {config.displayName && (
                <div>
                  <span className="text-muted-foreground">Name:</span> {config.displayName}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Auto-reply:</span>{' '}
                <Badge variant={config.autoReplyEnabled ? 'default' : 'outline'}>
                  {config.autoReplyEnabled ? 'On' : 'Off'}
                </Badge>
              </div>
              {config.forwardTo && (
                <div>
                  <span className="text-muted-foreground">Forward to:</span> {config.forwardTo}
                </div>
              )}
              {config.retentionDays != null && (
                <div>
                  <span className="text-muted-foreground">Retention:</span> {config.retentionDays} days
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!projectId && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Select a project to view its inbox
          </CardContent>
        </Card>
      )}

      {projectId && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="messages">
              <Mail className="h-4 w-4 mr-1" />
              Messages ({messagesTotal})
            </TabsTrigger>
            <TabsTrigger value="threads">
              <MessageSquare className="h-4 w-4 mr-1" />
              Threads ({threadsTotal})
            </TabsTrigger>
          </TabsList>

          {/* ============= MESSAGES TAB ============= */}
          <TabsContent value="messages">
            <Card>
              <CardHeader>
                <CardTitle>Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 mb-4">
                  <Select value={readFilter} onValueChange={(v) => { setReadFilter(v); setMessagesOffset(0) }}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Read status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="unread">Unread only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Filter by sender..."
                    value={fromFilter}
                    onChange={(e) => setFromFilter(e.target.value)}
                    className="w-[200px]"
                    onKeyDown={(e) => { if (e.key === 'Enter') { setMessagesOffset(0); fetchMessages() } }}
                  />
                </div>

                {messagesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">No messages found</div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[16px]" />
                          <TableHead>From</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Attachments</TableHead>
                          <TableHead>Received</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {messages.map((msg) => (
                          <TableRow
                            key={msg.id}
                            className="cursor-pointer hover:bg-accent"
                            onClick={() => handleViewMessage(msg)}
                          >
                            <TableCell>
                              {!msg.is_read && (
                                <span className="inline-block h-2 w-2 rounded-full bg-blue-500" title="Unread" />
                              )}
                            </TableCell>
                            <TableCell>
                              <div className={`text-sm ${!msg.is_read ? 'font-semibold' : ''}`}>
                                {msg.from_name || msg.from_email}
                              </div>
                              {msg.from_name && (
                                <div className="text-xs text-muted-foreground">{msg.from_email}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className={`text-sm ${!msg.is_read ? 'font-semibold' : ''}`}>
                                {msg.subject || '(no subject)'}
                              </div>
                              {msg.snippet && (
                                <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                                  {msg.snippet}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {(msg.attachments?.length || 0) > 0 && (
                                <Badge variant="outline" className="gap-1">
                                  <Paperclip className="h-3 w-3" />
                                  {msg.attachments!.length}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(msg.received_at), { addSuffix: true })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {messagesTotal > 50 && (
                      <div className="flex items-center justify-between mt-4 text-sm">
                        <span className="text-muted-foreground">
                          Showing {messagesOffset + 1}–{Math.min(messagesOffset + 50, messagesTotal)} of {messagesTotal}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={messagesOffset === 0}
                            onClick={() => setMessagesOffset(Math.max(0, messagesOffset - 50))}
                          >
                            Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={messagesOffset + 50 >= messagesTotal}
                            onClick={() => setMessagesOffset(messagesOffset + 50)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============= THREADS TAB ============= */}
          <TabsContent value="threads">
            <Card>
              <CardHeader>
                <CardTitle>Threads</CardTitle>
              </CardHeader>
              <CardContent>
                {threadsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : threads.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">No threads found</div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead>Participants</TableHead>
                          <TableHead>Messages</TableHead>
                          <TableHead>Unread</TableHead>
                          <TableHead>Last Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {threads.map((thread) => (
                          <TableRow
                            key={thread.id}
                            className="cursor-pointer hover:bg-accent"
                            onClick={() => handleViewThread(thread)}
                          >
                            <TableCell className={`text-sm ${thread.unread_count > 0 ? 'font-semibold' : ''}`}>
                              {thread.subject || '(no subject)'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {(thread.participants || []).join(', ') || '—'}
                            </TableCell>
                            <TableCell>{thread.message_count}</TableCell>
                            <TableCell>
                              {thread.unread_count > 0 && (
                                <Badge variant="default">{thread.unread_count}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {thread.last_message_at
                                ? formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {threadsTotal > 50 && (
                      <div className="flex items-center justify-between mt-4 text-sm">
                        <span className="text-muted-foreground">
                          Showing {threadsOffset + 1}–{Math.min(threadsOffset + 50, threadsTotal)} of {threadsTotal}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={threadsOffset === 0}
                            onClick={() => setThreadsOffset(Math.max(0, threadsOffset - 50))}
                          >
                            Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={threadsOffset + 50 >= threadsTotal}
                            onClick={() => setThreadsOffset(threadsOffset + 50)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ============= MESSAGE DETAIL DIALOG ============= */}
      <Dialog open={messageDetailOpen} onOpenChange={setMessageDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Message</DialogTitle>
            <DialogDescription>{selectedMessage?.subject || '(no subject)'}</DialogDescription>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              {/* Headers */}
              <div className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                <span className="text-muted-foreground">From:</span>
                <span>{selectedMessage.from_name ? `${selectedMessage.from_name} <${selectedMessage.from_email}>` : selectedMessage.from_email}</span>
                <span className="text-muted-foreground">To:</span>
                <span>{selectedMessage.to_email}</span>
                <span className="text-muted-foreground">Date:</span>
                <span>{format(new Date(selectedMessage.received_at), 'PPpp')}</span>
                {selectedMessage.thread_id && (
                  <>
                    <span className="text-muted-foreground">Thread:</span>
                    <span className="font-mono text-xs">{selectedMessage.thread_id}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedMessage.is_read ? (
                  <Badge variant="outline">Read</Badge>
                ) : (
                  <Badge variant="default">Unread</Badge>
                )}
                {selectedMessage.is_archived && <Badge variant="outline">Archived</Badge>}
                {selectedMessage.is_spam && <Badge variant="destructive">Spam</Badge>}
              </div>

              {/* Body */}
              <div>
                {!showHtml ? (
                  <div className="rounded-md border p-4 text-sm whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto">
                    {selectedMessage.text_body || selectedMessage.snippet || '(no text content)'}
                  </div>
                ) : (
                  selectedMessage.html_body && selectedMessage.html_body.length <= HTML_SIZE_LIMIT ? (
                    <iframe
                      sandbox=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      srcDoc={selectedMessage.html_body}
                      className="w-full rounded-md border"
                      style={{ maxHeight: '600px', minHeight: '200px' }}
                      title="Email HTML content"
                    />
                  ) : (
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                      HTML too large to preview ({formatBytes(selectedMessage.html_body?.length || 0)})
                    </div>
                  )
                )}
                {selectedMessage.html_body && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => setShowHtml(!showHtml)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    {showHtml ? 'View Text' : 'View HTML'}
                  </Button>
                )}
              </div>

              {/* Attachments */}
              {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Attachments ({selectedMessage.attachments.length})</h4>
                  <div className="space-y-2">
                    {selectedMessage.attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{att.filename}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{att.contentType}</Badge>
                        <span className="text-xs text-muted-foreground shrink-0">{formatBytes(att.size)}</span>
                        {att.storageKey ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownloadAttachment(selectedMessage.id, i)}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Download
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">File not stored</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw Headers (collapsible) */}
              {selectedMessage.headers && Object.keys(selectedMessage.headers).length > 0 && (
                <details>
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Raw headers
                  </summary>
                  <pre className="mt-2 rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto">
                    {JSON.stringify(selectedMessage.headers, null, 2)}
                  </pre>
                </details>
              )}

              {/* Actions */}
              <div className="flex gap-2 border-t pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleMarkRead(selectedMessage.id, !selectedMessage.is_read)}
                >
                  {selectedMessage.is_read ? 'Mark Unread' : 'Mark Read'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleArchive(selectedMessage.id, !selectedMessage.is_archived)}
                >
                  <Archive className="h-3.5 w-3.5 mr-1" />
                  {selectedMessage.is_archived ? 'Unarchive' : 'Archive'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(selectedMessage.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============= THREAD DETAIL DIALOG ============= */}
      <Dialog open={threadDetailOpen} onOpenChange={setThreadDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thread</DialogTitle>
            <DialogDescription>{selectedThread?.subject || '(no subject)'}</DialogDescription>
          </DialogHeader>
          {selectedThread && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {selectedThread.message_count} message{selectedThread.message_count !== 1 ? 's' : ''}
                {selectedThread.unread_count > 0 && ` (${selectedThread.unread_count} unread)`}
              </div>

              {threadMessages.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  {threadMessages.map((msg) => (
                    <div key={msg.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className={!msg.is_read ? 'font-semibold' : ''}>
                          {msg.from_name || msg.from_email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.received_at), 'PPp')}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap text-muted-foreground max-h-[150px] overflow-y-auto">
                        {msg.snippet || msg.text_body || '(no text content)'}
                      </div>
                      {(msg.attachments?.length || 0) > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" />
                          {msg.attachments!.length} attachment{msg.attachments!.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
