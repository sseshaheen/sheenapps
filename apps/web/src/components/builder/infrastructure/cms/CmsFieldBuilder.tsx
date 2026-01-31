'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import Icon from '@/components/ui/icon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const FIELD_TYPES = [
  'text',
  'number',
  'email',
  'url',
  'date',
  'select',
  'image',
  'boolean',
  'richtext',
  'json',
] as const

type FieldType = (typeof FIELD_TYPES)[number]

// Reserved field names that conflict with backend schema
const RESERVED_NAMES = new Set(['id', 'created_at', 'updated_at', 'slug', '_id', 'type', 'status'])

/**
 * Validate a field name for CMS schemas
 * Returns error message if invalid, null if valid
 */
function validateFieldName(name: string, allNames: string[]): string | null {
  if (!name.trim()) return null // Empty is handled separately
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return 'Must start with letter/underscore, contain only letters, numbers, underscores'
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    return 'Reserved name'
  }
  if (allNames.filter(n => n === name).length > 1) {
    return 'Duplicate field name'
  }
  return null
}

export interface SchemaField {
  name: string
  type: FieldType
  required?: boolean
  options?: string[]
  min?: number
  max?: number
  maxLength?: number
  pattern?: string
  description?: string
  display?: 'currency' | 'percent'
}

interface CmsFieldBuilderProps {
  fields: SchemaField[]
  onChange: (fields: SchemaField[]) => void
  translations: {
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

/**
 * Visual field builder for CMS content type schemas.
 * Replaces the raw JSON textarea with a user-friendly form.
 */
export function CmsFieldBuilder({ fields, onChange, translations }: CmsFieldBuilderProps) {
  const [showJson, setShowJson] = useState(false)

  const addField = () => {
    onChange([...fields, { name: '', type: 'text' }])
  }

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index))
  }

  const updateField = (index: number, updates: Partial<SchemaField>) => {
    const updated = fields.map((f, i) => {
      if (i !== index) return f
      const merged = { ...f, ...updates }

      // Clean up constraints that don't apply to the new type
      if (updates.type) {
        const t = updates.type
        if (t !== 'number') {
          delete merged.min
          delete merged.max
          delete merged.display
        }
        if (t !== 'text' && t !== 'email' && t !== 'url') {
          delete merged.maxLength
          delete merged.pattern
        }
        if (t !== 'select') {
          delete merged.options
        }
        if (t === 'select' && !merged.options) {
          merged.options = ['']
        }
      }
      return merged
    })
    onChange(updated)
  }

  const updateOption = (fieldIndex: number, optionIndex: number, value: string) => {
    const field = fields[fieldIndex]
    const options = [...(field.options || [])]
    options[optionIndex] = value
    updateField(fieldIndex, { options })
  }

  const addOption = (fieldIndex: number) => {
    const field = fields[fieldIndex]
    updateField(fieldIndex, { options: [...(field.options || []), ''] })
  }

  const removeOption = (fieldIndex: number, optionIndex: number) => {
    const field = fields[fieldIndex]
    const options = (field.options || []).filter((_, i) => i !== optionIndex)
    updateField(fieldIndex, { options })
  }

  // Build JSON representation for the "Show JSON" view
  const schemaJson = JSON.stringify({ fields }, null, 2)

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {translations.noFields}
        </p>
      )}

      {fields.map((field, index) => {
        const allNames = fields.map(f => f.name).filter(Boolean)
        const nameError = field.name ? validateFieldName(field.name, allNames) : null

        return (
        <div
          key={index}
          className="rounded-lg border bg-card p-3 space-y-3"
        >
          {/* Row 1: Name, Type, Required, Remove */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2">
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground">{translations.fieldName}</Label>
              <Input
                value={field.name}
                onChange={(e) => updateField(index, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                placeholder={translations.fieldNamePlaceholder}
                className={`h-8 text-sm ${nameError ? 'border-destructive' : ''}`}
              />
              {nameError && (
                <p className="text-xs text-destructive mt-1">{nameError}</p>
              )}
            </div>
            <div className="w-full sm:w-[120px] sm:shrink-0">
              <Label className="text-xs text-muted-foreground">{translations.fieldType}</Label>
              <Select
                value={field.type}
                onValueChange={(v) => updateField(index, { type: v as FieldType })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-sm">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-1 shrink-0 sm:pb-0.5">
              <div className="flex items-center gap-1.5 h-8">
                <Checkbox
                  id={`required-${index}`}
                  checked={field.required || false}
                  onCheckedChange={(checked) => updateField(index, { required: !!checked })}
                />
                <Label htmlFor={`required-${index}`} className="text-xs cursor-pointer">
                  {translations.required}
                </Label>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeField(index)}
                aria-label={translations.removeField}
              >
                <Icon name="trash-2" className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Type-specific constraints */}
          {field.type === 'select' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{translations.options}</Label>
              {(field.options || []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-1">
                  <Input
                    value={opt}
                    onChange={(e) => updateOption(index, oi, e.target.value)}
                    placeholder={translations.optionsPlaceholder}
                    className="h-7 text-xs flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => removeOption(index, oi)}
                    disabled={(field.options || []).length <= 1}
                  >
                    <Icon name="x" className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => addOption(index)}
              >
                <Icon name="plus" className="w-3 h-3 me-1" />
                {translations.options}
              </Button>
            </div>
          )}

          {field.type === 'number' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{translations.minValue}</Label>
                <Input
                  type="number"
                  value={field.min ?? ''}
                  onChange={(e) => updateField(index, { min: e.target.value ? Number(e.target.value) : undefined })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{translations.maxValue}</Label>
                <Input
                  type="number"
                  value={field.max ?? ''}
                  onChange={(e) => updateField(index, { max: e.target.value ? Number(e.target.value) : undefined })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{translations.display}</Label>
                <Select
                  value={field.display || 'none'}
                  onValueChange={(v) => updateField(index, { display: v === 'none' ? undefined : v as 'currency' | 'percent' })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">{translations.displayNone}</SelectItem>
                    <SelectItem value="currency" className="text-xs">{translations.displayCurrency}</SelectItem>
                    <SelectItem value="percent" className="text-xs">{translations.displayPercent}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {(field.type === 'text' || field.type === 'email' || field.type === 'url') && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{translations.maxLength}</Label>
                <Input
                  type="number"
                  value={field.maxLength ?? ''}
                  onChange={(e) => updateField(index, { maxLength: e.target.value ? Number(e.target.value) : undefined })}
                  className="h-7 text-xs"
                  min={1}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{translations.description}</Label>
                <Input
                  value={field.description ?? ''}
                  onChange={(e) => updateField(index, { description: e.target.value || undefined })}
                  placeholder={translations.descriptionPlaceholder}
                  className="h-7 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )})}

      {/* Add Field button */}
      <Button
        variant="outline"
        size="sm"
        onClick={addField}
        className="w-full"
      >
        <Icon name="plus" className="w-4 h-4 me-1" />
        {translations.addField}
      </Button>

      {/* Advanced: Show/Hide JSON */}
      <div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1"
          onClick={() => setShowJson(!showJson)}
        >
          <Icon name={showJson ? 'chevron-down' : 'chevron-right'} className="w-3 h-3" />
          {showJson ? translations.hideJson : translations.showJson}
        </button>
        {showJson && (
          <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-auto max-h-40 font-mono mt-1">
            {schemaJson}
          </pre>
        )}
      </div>
    </div>
  )
}
