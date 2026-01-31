'use client'

import { useCallback, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCmsContentTypes,
  useCmsEntries,
  useCmsMedia,
  useCreateCmsContentType,
  useCreateCmsEntry,
  useUploadCmsMedia
} from '@/hooks/useCmsAdmin'
import { useToast } from '@/hooks/useToast'
import Icon from '@/components/ui/icon'
import type { CmsContentType } from '@/types/inhouse-cms'
import { CmsFieldBuilder, type SchemaField as BuilderSchemaField } from './CmsFieldBuilder'

interface SchemaField {
  name: string
  type: string
  required?: boolean
  options?: string[]
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  step?: number
  precision?: number
  format?: string
  placeholder?: string
  description?: string
  display?: 'currency' | 'percent'
}

type EntryStatus = 'draft' | 'published' | 'archived'

interface CmsManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Live site URL for "View on site" links */
  siteUrl?: string | null
  translations: {
    title: string
    description: string
    tabs: {
      types: string
      entries: string
      media: string
    }
    types: {
      header: string
      name: string
      slug: string
      schema: string
      schemaHelp: string
      schemaHint: string
      create: string
      creating: string
      empty: string
      error: string
      validation: {
        invalidSchema: string
        missingFields: string
      }
      fieldBuilder?: {
        addField: string
        removeField: string
        fieldName: string
        fieldNamePlaceholder: string
        fieldType: string
        required: string
        constraints: string
        options: string
        optionsPlaceholder: string
        minValue: string
        maxValue: string
        maxLength: string
        description: string
        descriptionPlaceholder: string
        display: string
        displayCurrency: string
        displayPercent: string
        displayNone: string
        showJson: string
        hideJson: string
        noFields: string
      }
    }
    entries: {
      header: string
      contentType: string
      contentTypePlaceholder: string
      fieldPlaceholder: string
      requiredLabel: string
      slug: string
      status: string
      locale: string
      data: string
      dataHelp: string
      quickFill: string
      editorTabs: {
        form: string
        json: string
      }
      showAdvanced?: string
      hideAdvanced?: string
      noSchema: string
      create: string
      creating: string
      empty: string
      error: string
      validation: {
        required: string
        invalidJson: string
        minLength: string
        maxLength: string
        min: string
        max: string
        pattern: string
      }
      hints: {
        format: string
        pattern: string
        description: string
        range: string
        currency: string
        percent: string
      }
      statuses: {
        draft: string
        published: string
        archived: string
      }
    }
    media: {
      header: string
      filename: string
      altText: string
      upload: string
      uploading: string
      empty: string
      error: string
      sizeNote: string
    }
    errors: {
      invalidJson: string
      missingType: string
      missingFile: string
    }
    /** Optional preview-related translations for "View on site" links */
    preview?: {
      entryCreated: string
      viewOnSite: string
      previewOnSite: string
      showPreview?: string
      hidePreview?: string
      previewTitle?: string
      refreshPreview?: string
    }
  }
}

function formatJson(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '{}'
  }
}

type ParsedSchema = {
  fields?: unknown
  required?: unknown
}

function parseSchema(schema: unknown): { fields: SchemaField[]; required: Set<string> } {
  const fields: SchemaField[] = []
  const required = new Set<string>()

  if (!schema || typeof schema !== 'object') {
    return { fields, required }
  }

  const schemaObject = schema as ParsedSchema

  if (Array.isArray(schemaObject.required)) {
    schemaObject.required.forEach((name) => {
      if (typeof name === 'string') required.add(name)
    })
  }

  if (Array.isArray(schemaObject.fields)) {
    schemaObject.fields.forEach((field) => {
      if (!field || typeof field !== 'object') return
      const fieldRecord = field as Record<string, unknown>
      if (typeof fieldRecord.name !== 'string' || typeof fieldRecord.type !== 'string') return
      const options = Array.isArray(field.options)
        ? field.options.map((option) => {
            if (typeof option === 'string') return option
            if (option && typeof option === 'object') {
              const optionRecord = option as Record<string, unknown>
              if (typeof optionRecord.value === 'string') return optionRecord.value
              if (typeof optionRecord.label === 'string') return optionRecord.label
            }
            return null
          }).filter(Boolean)
        : Array.isArray(field.enum)
          ? field.enum.filter((value) => typeof value === 'string')
          : undefined
      const entry: SchemaField = {
        name: fieldRecord.name,
        type: fieldRecord.type,
        required: fieldRecord.required === true,
        options: options && options.length > 0 ? options : undefined,
        min: typeof fieldRecord.min === 'number' ? fieldRecord.min : undefined,
        max: typeof fieldRecord.max === 'number' ? fieldRecord.max : undefined,
        minLength: typeof fieldRecord.minLength === 'number' ? fieldRecord.minLength : undefined,
        maxLength: typeof fieldRecord.maxLength === 'number' ? fieldRecord.maxLength : undefined,
        pattern: typeof fieldRecord.pattern === 'string' ? fieldRecord.pattern : undefined,
        step: typeof fieldRecord.step === 'number' ? fieldRecord.step : undefined,
        precision: typeof fieldRecord.precision === 'number' ? fieldRecord.precision : undefined,
        format: typeof fieldRecord.format === 'string' ? fieldRecord.format : undefined,
        placeholder: typeof fieldRecord.placeholder === 'string' ? fieldRecord.placeholder : undefined,
        description: typeof fieldRecord.description === 'string' ? fieldRecord.description : undefined,
        display: fieldRecord.display === 'currency' || fieldRecord.display === 'percent' ? fieldRecord.display : undefined
      }
      if (entry.required) required.add(entry.name)
      fields.push(entry)
    })
  }

  return { fields, required }
}

function validateSchema(schema: unknown): 'invalidSchema' | 'missingFields' | 'invalidField' | null {
  if (!schema || typeof schema !== 'object') {
    return 'invalidSchema'
  }
  const schemaObject = schema as ParsedSchema
  if (!Array.isArray(schemaObject.fields)) {
    return 'invalidSchema'
  }
  if (schemaObject.fields.length === 0) {
    return 'missingFields'
  }
  for (const field of schemaObject.fields) {
    if (!field || typeof field !== 'object') return 'invalidField'
    const fieldRecord = field as Record<string, unknown>
    if (typeof fieldRecord.name !== 'string' || !fieldRecord.name.trim()) return 'invalidField'
    if (typeof fieldRecord.type !== 'string' || !fieldRecord.type.trim()) return 'invalidField'
  }
  return null
}

function buildSampleData(fields: SchemaField[]): Record<string, unknown> {
  const sample: Record<string, unknown> = {}

  fields.forEach((field) => {
    const type = field.type.toLowerCase()
    if (field.options && field.options.length > 0) {
      sample[field.name] = field.options[0]
      return
    }
    if (type === 'boolean') {
      sample[field.name] = false
      return
    }
    if (type === 'email') {
      sample[field.name] = 'user@example.com'
      return
    }
    if (type === 'url') {
      sample[field.name] = 'https://example.com'
      return
    }
    if (type === 'date') {
      sample[field.name] = new Date().toISOString().slice(0, 10)
      return
    }
    if (type === 'datetime' || type === 'timestamptz' || type === 'timestamp') {
      sample[field.name] = new Date().toISOString()
      return
    }
    if (type === 'json' || type === 'object') {
      sample[field.name] = {}
      return
    }
    if (type === 'richtext' || type === 'long_text' || type === 'text_long') {
      sample[field.name] = 'Sample text'
      return
    }
    if (type === 'number' || type === 'integer' || type === 'float' || type === 'decimal' || type === 'numeric') {
      const fallback = field.min !== undefined ? field.min : 0
      sample[field.name] = fallback
      return
    }
    sample[field.name] = `${field.name} value`
  })

  return sample
}

function getNumberStep(field: SchemaField): number | undefined {
  if (typeof field.step === 'number' && Number.isFinite(field.step)) {
    return field.step
  }
  if (typeof field.precision === 'number' && field.precision >= 0 && field.precision <= 8) {
    return Number((1 / Math.pow(10, field.precision)).toFixed(field.precision))
  }
  return undefined
}

function validateFieldValue(field: SchemaField, value: unknown, messages: CmsManagerDialogProps['translations']['entries']['validation']): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const stringValue = typeof value === 'string' ? value : String(value)
  const numberValue = typeof value === 'number' ? value : Number(value)

  if (field.minLength !== undefined && stringValue.length < field.minLength) {
    return messages.minLength.replace('{field}', field.name).replace('{min}', String(field.minLength))
  }
  if (field.maxLength !== undefined && stringValue.length > field.maxLength) {
    return messages.maxLength.replace('{field}', field.name).replace('{max}', String(field.maxLength))
  }
  if (!Number.isNaN(numberValue) && Number.isFinite(numberValue)) {
    if (field.min !== undefined && numberValue < field.min) {
      return messages.min.replace('{field}', field.name).replace('{min}', String(field.min))
    }
    if (field.max !== undefined && numberValue > field.max) {
      return messages.max.replace('{field}', field.name).replace('{max}', String(field.max))
    }
  }
  if (field.pattern) {
    try {
      const regex = new RegExp(field.pattern)
      if (!regex.test(stringValue)) {
        return messages.pattern.replace('{field}', field.name)
      }
    } catch {
      return null
    }
  }

  return null
}

export function CmsManagerDialog({
  open,
  onOpenChange,
  projectId,
  siteUrl,
  translations
}: CmsManagerDialogProps) {
  const [typeName, setTypeName] = useState('')
  const [typeSlug, setTypeSlug] = useState('')
  const [typeSchema, setTypeSchema] = useState('{\n  "fields": []\n}')
  const [typeFields, setTypeFields] = useState<BuilderSchemaField[]>([])
  const [entryTypeId, setEntryTypeId] = useState('')
  const [entrySlug, setEntrySlug] = useState('')
  const [entryStatus, setEntryStatus] = useState<'draft' | 'published' | 'archived'>('draft')
  const [entryLocale, setEntryLocale] = useState('en')
  const [entryData, setEntryData] = useState('{\n  "title": ""\n}')
  const [entryMode, setEntryMode] = useState<'form' | 'json'>('form')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaAltText, setMediaAltText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false)
  // Default to showing preview split-view when site URL is available (P2.1 UX improvement)
  const [showPreview, setShowPreview] = useState(!!siteUrl)
  const [previewKey, setPreviewKey] = useState(0)

  const refreshPreview = useCallback(() => {
    setPreviewKey(k => k + 1)
  }, [])

  // Reset to form mode when hiding advanced editor
  const handleToggleAdvanced = () => {
    setShowAdvancedEditor(v => {
      if (v && entryMode === 'json') {
        setEntryMode('form')
      }
      return !v
    })
  }

  const contentTypesQuery = useCmsContentTypes(projectId, open)
  const entriesQuery = useCmsEntries(
    projectId,
    entryTypeId ? { contentTypeId: entryTypeId } : {},
    open
  )
  const mediaQuery = useCmsMedia(projectId, {}, open)

  const createType = useCreateCmsContentType(projectId)
  const createEntry = useCreateCmsEntry(projectId)
  const uploadMedia = useUploadCmsMedia(projectId)
  const toast = useToast()

  const contentTypes = useMemo(() => contentTypesQuery.data || [], [contentTypesQuery.data])
  const entries = useMemo(() => entriesQuery.data || [], [entriesQuery.data])
  const media = useMemo(() => mediaQuery.data || [], [mediaQuery.data])

  const selectedType = useMemo(() => {
    return contentTypes.find((type) => type.id === entryTypeId) || null
  }, [contentTypes, entryTypeId])
  const schemaInfo = useMemo(() => parseSchema(selectedType?.schema), [selectedType])
  const entryDataObject = useMemo(() => {
    try {
      return JSON.parse(entryData || '{}') as Record<string, unknown>
    } catch {
      return null
    }
  }, [entryData])
  const entryFieldErrors = useMemo(() => {
    if (entryMode !== 'form' || !entryDataObject) return {}
    const errors: Record<string, string> = {}
    for (const field of schemaInfo.fields) {
      const value = entryDataObject[field.name]
      const message = validateFieldValue(field, value, translations.entries.validation)
      if (message) {
        errors[field.name] = message
      }
    }
    return errors
  }, [entryMode, entryDataObject, schemaInfo.fields, translations.entries.validation])

  const resetError = () => setError(null)

  const handleCreateType = async () => {
    resetError()
    try {
      // Use visual field builder when available, fall back to raw JSON
      let parsedSchema: Record<string, unknown>
      if (translations.types.fieldBuilder && typeFields.length > 0) {
        // Clean up fields: remove empty names, strip undefined values
        const cleanFields = typeFields
          .filter(f => f.name.trim() !== '')
          .map(f => {
            const cleaned: Record<string, unknown> = { name: f.name, type: f.type }
            if (f.required) cleaned.required = true
            if (f.options && f.options.length > 0) cleaned.options = f.options.filter(o => o.trim() !== '')
            if (f.min !== undefined) cleaned.min = f.min
            if (f.max !== undefined) cleaned.max = f.max
            if (f.maxLength !== undefined) cleaned.maxLength = f.maxLength
            if (f.pattern) cleaned.pattern = f.pattern
            if (f.description) cleaned.description = f.description
            if (f.display) cleaned.display = f.display
            return cleaned
          })
        parsedSchema = { fields: cleanFields }
      } else {
        parsedSchema = JSON.parse(typeSchema || '{}')
      }

      const schemaError = validateSchema(parsedSchema)
      if (schemaError) {
        const message = {
          invalidSchema: translations.types.validation.invalidSchema,
          missingFields: translations.types.validation.missingFields,
          invalidField: translations.types.validation.invalidSchema
        }[schemaError]
        setError(message)
        return
      }
      await createType.mutateAsync({
        name: typeName.trim(),
        slug: typeSlug.trim(),
        schema: parsedSchema
      })
      setTypeName('')
      setTypeSlug('')
      setTypeSchema('{\n  "fields": []\n}')
      setTypeFields([])
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError(translations.errors.invalidJson)
      } else {
        setError(err instanceof Error ? err.message : translations.types.error)
      }
    }
  }

  const handleCreateEntry = async () => {
    resetError()
    if (!entryTypeId) {
      setError(translations.errors.missingType)
      return
    }

    try {
      const parsedData = JSON.parse(entryData || '{}')
      if (entryMode === 'form') {
        const firstFieldError = Object.values(entryFieldErrors)[0]
        if (firstFieldError) {
          setError(firstFieldError)
          return
        }
        for (const field of schemaInfo.fields) {
          const value = parsedData[field.name]
          if (schemaInfo.required.has(field.name) && (value === undefined || value === null || value === '')) {
            setError(translations.entries.validation.required.replace('{field}', field.name))
            return
          }
        }
      }
      await createEntry.mutateAsync({
        contentTypeId: entryTypeId,
        slug: entrySlug.trim() || undefined,
        status: entryStatus,
        locale: entryLocale.trim() || undefined,
        data: parsedData
      })
      setEntrySlug('')
      setEntryData('{\n  "title": ""\n}')
      // Refresh preview iframe after a short delay
      if (showPreview) {
        setTimeout(refreshPreview, 1000)
      }
      // Show success toast with optional "View on site" action
      if (siteUrl && translations.preview?.entryCreated) {
        toast.success(translations.preview.entryCreated, {
          action: {
            label: translations.preview.viewOnSite,
            onClick: () => window.open(siteUrl, '_blank', 'noopener,noreferrer'),
          },
        })
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError(translations.entries.validation.invalidJson)
      } else {
        setError(err instanceof Error ? err.message : translations.entries.error)
      }
    }
  }

  const handleQuickFill = () => {
    if (schemaInfo.fields.length === 0) {
      setError(translations.entries.noSchema)
      return
    }
    const sample = buildSampleData(schemaInfo.fields)
    setEntryData(JSON.stringify(sample, null, 2))
  }

  const handleEntryFieldChange = (field: SchemaField, value: unknown) => {
    let next: Record<string, unknown> = {}
    try {
      next = JSON.parse(entryData || '{}') as Record<string, unknown>
    } catch {
      next = {}
    }
    next[field.name] = value
    setEntryData(JSON.stringify(next, null, 2))
  }

  const handleUploadMedia = async () => {
    resetError()
    if (!mediaFile) {
      setError(translations.errors.missingFile)
      return
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result
          if (!result || typeof result !== 'string') {
            reject(new Error('Invalid file data'))
            return
          }
          const stripped = result.includes(',') ? result.split(',')[1] : result
          resolve(stripped)
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(mediaFile)
      })

      await uploadMedia.mutateAsync({
        filename: mediaFile.name,
        contentBase64: base64,
        contentType: mediaFile.type || undefined,
        altText: mediaAltText.trim() || undefined
      })

      setMediaFile(null)
      setMediaAltText('')
      // Refresh preview iframe after a short delay to show new media
      if (showPreview) {
        setTimeout(refreshPreview, 1000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : translations.media.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showPreview && siteUrl ? 'max-w-6xl' : 'max-w-3xl'}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{translations.title}</DialogTitle>
            <div className="flex items-center gap-2">
              {siteUrl && translations.preview?.showPreview && (
                <Button
                  variant={showPreview ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowPreview(v => !v)}
                >
                  <Icon name="eye" className="w-3 h-3" />
                  {showPreview
                    ? (translations.preview.hidePreview ?? 'Hide Preview')
                    : translations.preview.showPreview}
                </Button>
              )}
              {siteUrl && translations.preview?.previewOnSite && (
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Icon name="external-link" className="w-3 h-3" />
                  {translations.preview.previewOnSite}
                </a>
              )}
            </div>
          </div>
          <DialogDescription>{translations.description}</DialogDescription>
        </DialogHeader>

        <div className={showPreview && siteUrl ? 'flex flex-col lg:flex-row gap-4 mt-2' : ''}>
        {/* Left pane: editor */}
        <div className={showPreview && siteUrl ? 'flex-1 min-w-0 overflow-y-auto max-h-[40vh] lg:max-h-[60vh]' : ''}>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="types" className="mt-4">
          <TabsList>
            <TabsTrigger value="types">{translations.tabs.types}</TabsTrigger>
            <TabsTrigger value="entries">{translations.tabs.entries}</TabsTrigger>
            <TabsTrigger value="media">{translations.tabs.media}</TabsTrigger>
          </TabsList>

          <TabsContent value="types" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="text-sm font-medium">{translations.types.header}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{translations.types.name}</Label>
                  <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{translations.types.slug}</Label>
                  <Input value={typeSlug} onChange={(e) => setTypeSlug(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{translations.types.schema}</Label>
                {translations.types.fieldBuilder ? (
                  <CmsFieldBuilder
                    fields={typeFields}
                    onChange={setTypeFields}
                    translations={translations.types.fieldBuilder}
                  />
                ) : (
                  <>
                    <Textarea
                      value={typeSchema}
                      onChange={(e) => setTypeSchema(e.target.value)}
                      rows={6}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">{translations.types.schemaHelp}</p>
                    <p className="text-xs text-muted-foreground">{translations.types.schemaHint}</p>
                  </>
                )}
              </div>
              <Button
                onClick={handleCreateType}
                disabled={createType.isPending}
              >
                {createType.isPending ? translations.types.creating : translations.types.create}
              </Button>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              {contentTypesQuery.isLoading && (
                <div className="text-sm text-muted-foreground">{translations.types.empty}</div>
              )}
              {!contentTypesQuery.isLoading && contentTypes.length === 0 && (
                <div className="text-sm text-muted-foreground">{translations.types.empty}</div>
              )}
              {contentTypes.map((type) => (
                <div key={type.id} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{type.name}</div>
                    <div className="text-xs text-muted-foreground">{type.slug}</div>
                  </div>
                  <pre className="text-[10px] bg-muted/40 rounded px-2 py-1 max-w-[220px] overflow-hidden">
                    {formatJson(type.schema)}
                  </pre>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="entries" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="text-sm font-medium">{translations.entries.header}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{translations.entries.contentType}</Label>
                  <Select value={entryTypeId} onValueChange={setEntryTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder={translations.entries.contentTypePlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {contentTypes.map((type: CmsContentType) => (
                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{translations.entries.slug}</Label>
                  <Input value={entrySlug} onChange={(e) => setEntrySlug(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{translations.entries.status}</Label>
                  <Select value={entryStatus} onValueChange={(value) => setEntryStatus(value as EntryStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">{translations.entries.statuses.draft}</SelectItem>
                      <SelectItem value="published">{translations.entries.statuses.published}</SelectItem>
                      <SelectItem value="archived">{translations.entries.statuses.archived}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{translations.entries.locale}</Label>
                  <Input value={entryLocale} onChange={(e) => setEntryLocale(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{translations.entries.data}</Label>
                  <button
                    type="button"
                    onClick={handleToggleAdvanced}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAdvancedEditor
                      ? (translations.entries.hideAdvanced ?? 'Hide advanced')
                      : (translations.entries.showAdvanced ?? 'Show advanced')}
                  </button>
                </div>
                <Tabs value={entryMode} onValueChange={(value) => setEntryMode(value as 'form' | 'json')}>
                  <TabsList>
                    <TabsTrigger value="form">{translations.entries.editorTabs.form}</TabsTrigger>
                    {showAdvancedEditor && (
                      <TabsTrigger value="json">{translations.entries.editorTabs.json}</TabsTrigger>
                    )}
                  </TabsList>
                  <TabsContent value="form" className="mt-3 space-y-3">
                    {schemaInfo.fields.length === 0 && (
                      <div className="text-xs text-muted-foreground">
                        {translations.entries.noSchema}
                      </div>
                    )}
                    {entryDataObject === null && (
                      <div className="text-xs text-warning">
                        {translations.entries.validation.invalidJson}
                      </div>
                    )}
                    {schemaInfo.fields.map((field) => {
                      const rawValue = entryDataObject && field.name in entryDataObject
                        ? entryDataObject[field.name]
                        : ''
                      const type = field.type.toLowerCase()
                      const selectedValue = typeof rawValue === 'string'
                        ? rawValue
                        : rawValue === null || rawValue === undefined
                          ? ''
                          : String(rawValue)
                      const canShowSlider = type === 'number' || type === 'integer' || type === 'float' || type === 'decimal' || type === 'numeric'
                      const sliderEnabled = canShowSlider && field.min !== undefined && field.max !== undefined
                      const sliderValue = typeof rawValue === 'number' ? rawValue : Number(rawValue)

                      if (type === 'boolean') {
                        return (
                          <div key={field.name} className="flex items-center justify-between rounded-md border p-3">
                            <div>
                              <div className="text-sm font-medium">{field.name}</div>
                              <div className="text-xs text-muted-foreground">{field.type}</div>
                              {schemaInfo.required.has(field.name) && (
                                <span className="text-[10px] text-primary font-semibold uppercase">{translations.entries.requiredLabel}</span>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              checked={Boolean(rawValue)}
                              onChange={(e) => handleEntryFieldChange(field, e.target.checked)}
                              className="h-4 w-4"
                            />
                          </div>
                        )
                      }

                      if (field.options && field.options.length > 0) {
                        return (
                          <div key={field.name} className="space-y-2">
                            <Label>
                              {field.name}
                              {schemaInfo.required.has(field.name) && (
                                <span className="ml-2 text-[10px] text-primary font-semibold uppercase">{translations.entries.requiredLabel}</span>
                              )}
                            </Label>
                            <Select
                              value={selectedValue}
                              onValueChange={(value) => handleEntryFieldChange(field, value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={translations.entries.fieldPlaceholder} />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options.map((option) => (
                                  <SelectItem key={option} value={option}>{option}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {entryFieldErrors[field.name] && (
                              <p className="text-xs text-destructive">{entryFieldErrors[field.name]}</p>
                            )}
                          </div>
                        )
                      }

                      if (type === 'richtext' || type === 'long_text' || type === 'text_long') {
                        return (
                          <div key={field.name} className="space-y-2">
                            <Label>
                              {field.name}
                              {schemaInfo.required.has(field.name) && (
                                <span className="ml-2 text-[10px] text-primary font-semibold uppercase">{translations.entries.requiredLabel}</span>
                              )}
                            </Label>
                            <Textarea
                              value={String(rawValue ?? '')}
                              onChange={(e) => handleEntryFieldChange(field, e.target.value)}
                              rows={4}
                              className="text-xs"
                            />
                            {entryFieldErrors[field.name] && (
                              <p className="text-xs text-destructive">{entryFieldErrors[field.name]}</p>
                            )}
                          </div>
                        )
                      }

                      if (type === 'json' || type === 'object') {
                        return (
                          <div key={field.name} className="space-y-2">
                            <Label>
                              {field.name}
                              {schemaInfo.required.has(field.name) && (
                                <span className="ml-2 text-[10px] text-primary font-semibold uppercase">{translations.entries.requiredLabel}</span>
                              )}
                            </Label>
                            <Textarea
                              value={typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue ?? {}, null, 2)}
                              onChange={(e) => {
                                const value = e.target.value
                                try {
                                  handleEntryFieldChange(field, JSON.parse(value))
                                } catch {
                                  handleEntryFieldChange(field, value)
                                }
                              }}
                              rows={4}
                              className="font-mono text-xs"
                            />
                            {entryFieldErrors[field.name] && (
                              <p className="text-xs text-destructive">{entryFieldErrors[field.name]}</p>
                            )}
                          </div>
                        )
                      }

                      const inputType = type === 'number' || type === 'integer' || type === 'float' || type === 'decimal' || type === 'numeric'
                        ? 'number'
                        : type === 'date'
                          ? 'date'
                          : type === 'datetime' || type === 'timestamptz' || type === 'timestamp'
                            ? 'datetime-local'
                            : type === 'email'
                              ? 'email'
                              : type === 'url'
                                ? 'url'
                                : 'text'

                      return (
                        <div key={field.name} className="space-y-2">
                          <Label>
                            {field.name}
                            {schemaInfo.required.has(field.name) && (
                              <span className="ml-2 text-[10px] text-primary font-semibold uppercase">{translations.entries.requiredLabel}</span>
                            )}
                          </Label>
                          <Input
                            type={inputType}
                            value={selectedValue}
                            placeholder={field.placeholder || undefined}
                            step={inputType === 'number' ? getNumberStep(field) : undefined}
                            min={inputType === 'number' && field.min !== undefined ? field.min : undefined}
                            max={inputType === 'number' && field.max !== undefined ? field.max : undefined}
                            onChange={(e) => {
                              const value = inputType === 'number'
                                ? (e.target.value === '' ? null : Number(e.target.value))
                                : e.target.value
                              handleEntryFieldChange(field, value)
                            }}
                          />
                          {sliderEnabled && !Number.isNaN(sliderValue) && (
                            <input
                              type="range"
                              className="w-full"
                              min={field.min}
                              max={field.max}
                              step={getNumberStep(field) || 1}
                              value={Number.isFinite(sliderValue) ? sliderValue : field.min}
                              onChange={(e) => handleEntryFieldChange(field, Number(e.target.value))}
                            />
                          )}
                          {(field.description || field.format || field.pattern) && (
                            <div className="text-[11px] text-muted-foreground space-y-1">
                              {field.description && (
                                <div>{translations.entries.hints.description}: {field.description}</div>
                              )}
                              {field.format && (
                                <div>{translations.entries.hints.format}: {field.format}</div>
                              )}
                              {field.pattern && (
                                <div>{translations.entries.hints.pattern}: {field.pattern}</div>
                              )}
                              {field.display === 'currency' && (
                                <div>{translations.entries.hints.currency}</div>
                              )}
                              {field.display === 'percent' && (
                                <div>{translations.entries.hints.percent}</div>
                              )}
                            </div>
                          )}
                          {(field.min !== undefined || field.max !== undefined) && (
                            <div className="text-[11px] text-muted-foreground">
                              {translations.entries.hints.range}: {field.min ?? '—'} - {field.max ?? '—'}
                            </div>
                          )}
                          {entryFieldErrors[field.name] && (
                            <p className="text-xs text-destructive">{entryFieldErrors[field.name]}</p>
                          )}
                        </div>
                      )
                    })}
                  </TabsContent>
                  <TabsContent value="json" className="mt-3">
                    <Textarea
                      value={entryData}
                      onChange={(e) => setEntryData(e.target.value)}
                      rows={6}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-2">{translations.entries.dataHelp}</p>
                  </TabsContent>
                </Tabs>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleQuickFill}
                >
                  {translations.entries.quickFill}
                </Button>
                <Button
                  onClick={handleCreateEntry}
                  disabled={createEntry.isPending}
                >
                  {createEntry.isPending ? translations.entries.creating : translations.entries.create}
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              {!selectedType && (
                <div className="text-sm text-muted-foreground">{translations.errors.missingType}</div>
              )}
              {selectedType && entries.length === 0 && (
                <div className="text-sm text-muted-foreground">{translations.entries.empty}</div>
              )}
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{entry.slug || entry.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{entry.status} • {entry.locale}</div>
                  </div>
                  <pre className="text-[10px] bg-muted/40 rounded px-2 py-1 max-w-[220px] overflow-hidden">
                    {formatJson(entry.data)}
                  </pre>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="media" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="text-sm font-medium">{translations.media.header}</div>
              <div className="space-y-2">
                <Label>{translations.media.filename}</Label>
                <Input type="file" onChange={(e) => setMediaFile(e.target.files?.[0] || null)} />
              </div>
              <div className="space-y-2">
                <Label>{translations.media.altText}</Label>
                <Input value={mediaAltText} onChange={(e) => setMediaAltText(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">{translations.media.sizeNote}</p>
              <Button
                onClick={handleUploadMedia}
                disabled={uploadMedia.isPending}
              >
                {uploadMedia.isPending ? translations.media.uploading : translations.media.upload}
              </Button>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              {mediaQuery.isLoading && (
                <div className="text-sm text-muted-foreground">{translations.media.empty}</div>
              )}
              {!mediaQuery.isLoading && media.length === 0 && (
                <div className="text-sm text-muted-foreground">{translations.media.empty}</div>
              )}
              {media.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {item.mimeType?.startsWith('image/') && (
                      <Image
                        src={item.url}
                        alt={item.altText || item.filename}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-md object-cover border"
                        unoptimized
                      />
                    )}
                    <div>
                      <div className="text-sm font-medium">{item.filename}</div>
                      <div className="text-xs text-muted-foreground">{item.mimeType || 'file'}</div>
                    </div>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline"
                  >
                    {item.url.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        </div>{/* end left pane */}

        {/* Right pane: preview iframe - full width on mobile, fixed on desktop */}
        {showPreview && siteUrl && (
          <div className="w-full lg:w-[340px] flex-shrink-0 border rounded-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
              <span className="text-xs font-medium">
                {translations.preview?.previewTitle ?? 'Live Preview'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={refreshPreview}
                title={translations.preview?.refreshPreview ?? 'Refresh'}
              >
                <Icon name="rotate-ccw" className="w-3 h-3" />
              </Button>
            </div>
            <iframe
              key={previewKey}
              src={siteUrl}
              className="flex-1 w-full min-h-[250px] lg:min-h-[400px] bg-white"
              title={translations.preview?.previewTitle ?? 'Live Preview'}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        )}

        </div>{/* end flex container */}
      </DialogContent>
    </Dialog>
  )
}
