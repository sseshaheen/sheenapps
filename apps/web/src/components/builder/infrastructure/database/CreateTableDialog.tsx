'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Icon from '@/components/ui/icon'
import type { ApiResponse, CreateTableRequest, CreateTableResponse } from '@/types/inhouse-api'

interface Column {
  id: string
  name: string
  type: string
  nullable: boolean
  defaultValue?: string | null
  isPrimaryKey: boolean
}

interface CreateTableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onSuccess: () => void
  translations: {
    title: string
    description: string
    tableName: string
    tableNamePlaceholder: string
    columns: string
    addColumn: string
    columnName: string
    columnType: string
    nullable: string
    primaryKey: string
    defaultValue: string
    remove: string
    cancel: string
    create: string
    creating: string
    success: string
    error: string
    validation: {
      tableNameRequired: string
      columnNameRequired: string
      atLeastOneColumn: string
    }
  }
}

const COLUMN_TYPES = [
  'text',
  'integer',
  'bigint',
  'boolean',
  'timestamp',
  'timestamptz',
  'uuid',
  'json',
  'jsonb',
  'numeric',
  'real',
  'double precision'
]

/**
 * Create Table Dialog Component
 *
 * Allows users to create database tables visually without SQL.
 * Features:
 * - Table name input
 * - Dynamic column management
 * - Type selection
 * - Nullable/PK flags
 * - Default values
 */
export function CreateTableDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
  translations
}: CreateTableDialogProps) {
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<Column[]>([
    {
      id: '1',
      name: 'id',
      type: 'uuid',
      nullable: false,
      defaultValue: 'gen_random_uuid()',
      isPrimaryKey: true
    }
  ])
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextColumnId, setNextColumnId] = useState(2)

  const addColumn = () => {
    setColumns([
      ...columns,
      {
        id: String(nextColumnId),
        name: '',
        type: 'text',
        nullable: true,
        isPrimaryKey: false
      }
    ])
    setNextColumnId(nextColumnId + 1)
  }

  const removeColumn = (id: string) => {
    if (columns.length === 1) return
    setColumns(columns.filter(col => col.id !== id))
  }

  const updateColumn = (id: string, field: keyof Column, value: string | boolean | null | undefined) => {
    setColumns(
      columns.map(col =>
        col.id === id ? { ...col, [field]: value } : col
      )
    )
  }

  // EXPERT FIX ROUND 4: Make primary key exclusive (only one column can be PK)
  const setPrimaryKey = (id: string) => {
    setColumns(cols =>
      cols.map(col => ({
        ...col,
        isPrimaryKey: col.id === id
      }))
    )
  }

  const validateForm = (): string | null => {
    if (!tableName.trim()) {
      return translations.validation.tableNameRequired
    }

    if (columns.length === 0) {
      return translations.validation.atLeastOneColumn
    }

    for (const col of columns) {
      if (!col.name.trim()) {
        return translations.validation.columnNameRequired
      }
    }

    return null
  }

  const handleCreate = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch(`/api/inhouse/projects/${projectId}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName,
          columns: columns.map(col => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable,
            defaultValue: col.defaultValue || null,
            isPrimaryKey: col.isPrimaryKey
          }))
        } as Omit<CreateTableRequest, 'projectId'>)
      })

      const data = await response.json() as ApiResponse<CreateTableResponse>

      if (!response.ok || !data.ok) {
        throw new Error(data.ok === false ? data.error.message : 'Failed to create table')
      }

      // Success - reset form and close
      setTableName('')
      setColumns([
        {
          id: '1',
          name: 'id',
          type: 'uuid',
          nullable: false,
          defaultValue: 'gen_random_uuid()',
          isPrimaryKey: true
        }
      ])
      setNextColumnId(2)
      setError(null)
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : translations.error)
    } finally {
      setIsCreating(false)
    }
  }

  // EXPERT FIX ROUND 4: Proper onOpenChange handler that accepts boolean (Radix requirement)
  const handleOpenChange = (nextOpen: boolean) => {
    // If user is trying to close while creating, ignore
    if (!nextOpen && isCreating) {
      return
    }

    onOpenChange(nextOpen)

    // If closing, reset form after animation
    if (!nextOpen) {
      setTimeout(() => {
        setTableName('')
        setColumns([
          {
            id: '1',
            name: 'id',
            type: 'uuid',
            nullable: false,
            defaultValue: 'gen_random_uuid()',
            isPrimaryKey: true
          }
        ])
        setNextColumnId(2)
        setError(null)
      }, 300)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{translations.title}</DialogTitle>
          <DialogDescription>{translations.description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          <div className="space-y-4">
            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <Icon name="alert-circle" className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Table Name */}
            <div className="space-y-2">
              <Label htmlFor="tableName">{translations.tableName}</Label>
              <Input
                id="tableName"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder={translations.tableNamePlaceholder}
                disabled={isCreating}
              />
            </div>

            {/* Columns */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{translations.columns}</Label>
                <Button
                  onClick={addColumn}
                  size="sm"
                  variant="outline"
                  disabled={isCreating}
                >
                  <Icon name="plus" className="w-4 h-4 me-1" />
                  {translations.addColumn}
                </Button>
              </div>

              <div className="space-y-3">
                {columns.map((col) => (
                  <div
                    key={col.id}
                    className="border border-border rounded-lg p-4 space-y-3"
                  >
                    {/* Column Name and Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`col-name-${col.id}`} className="text-xs">
                          {translations.columnName}
                        </Label>
                        <Input
                          id={`col-name-${col.id}`}
                          value={col.name}
                          onChange={(e) => updateColumn(col.id, 'name', e.target.value)}
                          disabled={isCreating}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`col-type-${col.id}`} className="text-xs">
                          {translations.columnType}
                        </Label>
                        <Select
                          value={col.type}
                          onValueChange={(value) => updateColumn(col.id, 'type', value)}
                          disabled={isCreating}
                        >
                          <SelectTrigger id={`col-type-${col.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COLUMN_TYPES.map(type => (
                              <SelectItem key={type} value={type}>
                                <span className="font-mono text-sm">{type}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Checkboxes and Default Value */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`nullable-${col.id}`}
                          checked={col.nullable}
                          onCheckedChange={(checked) =>
                            updateColumn(col.id, 'nullable', checked === true)
                          }
                          disabled={isCreating}
                        />
                        <Label
                          htmlFor={`nullable-${col.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {translations.nullable}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`pk-${col.id}`}
                          checked={col.isPrimaryKey}
                          onCheckedChange={(checked) =>
                            checked === true && setPrimaryKey(col.id)
                          }
                          disabled={isCreating}
                        />
                        <Label
                          htmlFor={`pk-${col.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {translations.primaryKey}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeColumn(col.id)}
                          disabled={columns.length === 1 || isCreating}
                          className="text-destructive hover:text-destructive"
                        >
                          <Icon name="trash-2" className="w-4 h-4 me-1" />
                          {translations.remove}
                        </Button>
                      </div>
                    </div>

                    {/* Default Value (optional) */}
                    <div className="space-y-1.5">
                      <Label htmlFor={`default-${col.id}`} className="text-xs text-muted-foreground">
                        {translations.defaultValue} (optional)
                      </Label>
                      <Input
                        id={`default-${col.id}`}
                        value={col.defaultValue || ''}
                        onChange={(e) =>
                          updateColumn(col.id, 'defaultValue', e.target.value || null)
                        }
                        disabled={isCreating}
                        placeholder="NULL"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isCreating}>
            {translations.cancel}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!tableName || columns.length === 0 || isCreating}
          >
            {isCreating && <Icon name="loader-2" className="w-4 h-4 me-2 animate-spin" />}
            {isCreating ? translations.creating : translations.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
