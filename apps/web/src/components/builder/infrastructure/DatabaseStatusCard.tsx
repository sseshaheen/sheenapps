'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Icon from '@/components/ui/icon'
import type { DatabaseStatus, StatusVariant } from '@/types/inhouse-api'
import { getStatusVariant } from '@/types/inhouse-api'
import dynamic from 'next/dynamic'
import { useState } from 'react'

// EXPERT FIX ROUND 4: Lazy-load heavy database components for better performance
const SchemaBrowser = dynamic(() => import('./database/SchemaBrowser').then(mod => ({ default: mod.SchemaBrowser })), {
  loading: () => (
    <div className="flex items-center justify-center py-8">
      <Icon name="loader-2" className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )
})

const CreateTableDialog = dynamic(() => import('./database/CreateTableDialog').then(mod => ({ default: mod.CreateTableDialog })), {
  loading: () => null // Dialog handles loading state internally
})

const QueryConsole = dynamic(() => import('./database/QueryConsole').then(mod => ({ default: mod.QueryConsole })), {
  loading: () => (
    <div className="flex items-center justify-center py-8">
      <Icon name="loader-2" className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )
})

interface DatabaseStatusCardProps {
  projectId: string
  status: DatabaseStatus
  translations: {
    title: string
    schema: string
    tables: string
    storage: string
    status: {
      active: string
      provisioning: string
      error: string
    }
    actions: {
      viewSchema: string
      createTable: string
      queryConsole: string
    }
    dialogs: {
      schema: {
        title: string
        description: string
        tables: string
        columns: string
        type: string
        nullable: string
        primaryKey: string
        loading: string
        error: string
        noTables: string
        createFirst: string
        createTable: string
        rows: string
      }
      createTable: {
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
      query: {
        title: string
        description: string
        queryPlaceholder: string
        run: string
        running: string
        clear: string
        results: string
        noResults: string
        executionTime: string
        rowCount: string
        error: string
        selectOnlyWarning: string
      }
    }
  }
}

function mapStatusVariantToBadgeVariant(variant: StatusVariant): 'default' | 'destructive' | 'outline' | 'secondary' {
  switch (variant) {
    case 'success':
      return 'secondary'
    case 'warning':
      return 'outline'
    case 'error':
      return 'destructive'
    default:
      return 'default'
  }
}

export function DatabaseStatusCard({ projectId, status, translations }: DatabaseStatusCardProps) {
  const statusVariant = getStatusVariant(status.status)
  const badgeVariant = mapStatusVariantToBadgeVariant(statusVariant)
  const statusText = translations.status[status.status] || status.status

  // Dialog states
  const [schemaDialogOpen, setSchemaDialogOpen] = useState(false)
  const [createTableDialogOpen, setCreateTableDialogOpen] = useState(false)
  const [queryDialogOpen, setQueryDialogOpen] = useState(false)

  const handleTableCreated = () => {
    // Refresh schema browser if it's open
    // SWR will handle revalidation
  }

  const isActive = status.status === 'active'

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Icon name="database" className="w-4 h-4" />
              {translations.title}
            </CardTitle>
            <Badge variant={badgeVariant}>
              {status.status === 'provisioning' && (
                <Icon name="loader-2" className="w-3 h-3 me-1 animate-spin" />
              )}
              {statusText}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Database Stats */}
            <div className="space-y-3">
              {/* Schema Name */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{translations.schema}:</span>
                <span className="font-mono text-xs">{status.schemaName}</span>
              </div>

              {/* Tables Count */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{translations.tables}:</span>
                <span className="font-medium">{status.tableCount}</span>
              </div>

              {/* Storage */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{translations.storage}:</span>
                  <span className="text-xs">
                    {status.storageUsedMb.toFixed(1)} MB / {status.storageQuotaMb} MB
                  </span>
                </div>
                {/* Storage Progress Bar */}
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      (status.storageUsedMb / status.storageQuotaMb) > 0.9
                        ? 'bg-destructive'
                        : (status.storageUsedMb / status.storageQuotaMb) > 0.7
                        ? 'bg-warning'
                        : 'bg-primary'
                    }`}
                    style={{
                      width: `${Math.min((status.storageUsedMb / status.storageQuotaMb) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>

              {/* Error Message */}
              {status.errorMessage && (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                  {status.errorMessage}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {isActive && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-border">
                <Button
                  onClick={() => setSchemaDialogOpen(true)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Icon name="list" className="w-4 h-4 me-1" />
                  {translations.actions.viewSchema}
                </Button>
                <Button
                  onClick={() => setCreateTableDialogOpen(true)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Icon name="pause-circle" className="w-4 h-4 me-1" />
                  {translations.actions.createTable}
                </Button>
                <Button
                  onClick={() => setQueryDialogOpen(true)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Icon name="database" className="w-4 h-4 me-1" />
                  {translations.actions.queryConsole}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Schema Browser Dialog */}
      <Dialog open={schemaDialogOpen} onOpenChange={setSchemaDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{translations.dialogs.schema.title}</DialogTitle>
            <DialogDescription>
              {translations.dialogs.schema.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-1">
            <SchemaBrowser
              projectId={projectId}
              translations={translations.dialogs.schema}
              onCreateTable={() => {
                setSchemaDialogOpen(false)
                setCreateTableDialogOpen(true)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Table Dialog */}
      <CreateTableDialog
        open={createTableDialogOpen}
        onOpenChange={setCreateTableDialogOpen}
        projectId={projectId}
        onSuccess={handleTableCreated}
        translations={translations.dialogs.createTable}
      />

      {/* Query Console Dialog */}
      <Dialog open={queryDialogOpen} onOpenChange={setQueryDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <QueryConsole
              projectId={projectId}
              translations={translations.dialogs.query}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
