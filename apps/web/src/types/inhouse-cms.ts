export type CmsEntryStatus = 'draft' | 'published' | 'archived'

export interface CmsContentType {
  id: string
  projectId: string
  name: string
  slug: string
  schema: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface CmsContentEntry {
  id: string
  projectId: string
  contentTypeId: string
  slug: string | null
  data: Record<string, any>
  status: CmsEntryStatus
  locale: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CmsMediaItem {
  id: string
  projectId: string
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  url: string
  altText: string | null
  metadata: Record<string, any>
  createdAt: string
}

export interface CmsListResponse<T> {
  items: T[]
}
