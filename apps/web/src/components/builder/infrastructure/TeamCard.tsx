'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Icon from '@/components/ui/icon'
import { useToast } from '@/hooks/useToast'
import {
  useCollaborators,
  useInviteCollaborator,
  useUpdateCollaboratorRole,
  useRemoveCollaborator,
  type Collaborator,
  type CollaboratorRole,
} from '@/hooks/use-collaborators'

interface TeamCardProps {
  projectId: string
  /** Current user's role on the project (determines what actions they can take) */
  currentUserRole?: CollaboratorRole
  translations: {
    title: string
    invite: string
    inviting: string
    emailPlaceholder: string
    roles: {
      owner: string
      admin: string
      editor: string
      viewer: string
    }
    status: {
      pending: string
      accepted: string
    }
    actions: {
      changeRole: string
      remove: string
    }
    empty: string
    you: string
    errors: {
      inviteFailed: string
      updateFailed: string
      removeFailed: string
    }
    success: {
      invited: string
      updated: string
      removed: string
    }
  }
}

function getRoleBadgeVariant(role: CollaboratorRole): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'owner':
      return 'default'
    case 'admin':
      return 'secondary'
    default:
      return 'outline'
  }
}

export function TeamCard({ projectId, currentUserRole, translations }: TeamCardProps) {
  const { success, error: showError } = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')

  const { data: collaborators, isLoading } = useCollaborators(projectId)
  const inviteMutation = useInviteCollaborator(projectId)
  const updateRoleMutation = useUpdateCollaboratorRole(projectId)
  const removeMutation = useRemoveCollaborator(projectId)

  const canManageTeam = currentUserRole === 'owner' || currentUserRole === 'admin'
  const isOwner = currentUserRole === 'owner'

  const handleInvite = async () => {
    if (!email.trim()) return

    try {
      await inviteMutation.mutateAsync({ email: email.trim(), role })
      setEmail('')
      success(`${translations.success.invited}: ${email.trim()}`)
    } catch (err) {
      showError(translations.errors.inviteFailed, {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleUpdateRole = async (collaboratorId: string, newRole: 'admin' | 'editor' | 'viewer') => {
    try {
      await updateRoleMutation.mutateAsync({ collaboratorId, role: newRole })
      success(translations.success.updated)
    } catch (err) {
      showError(translations.errors.updateFailed, {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleRemove = async (collaboratorId: string) => {
    try {
      await removeMutation.mutateAsync(collaboratorId)
      success(translations.success.removed)
    } catch (err) {
      showError(translations.errors.removeFailed, {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Icon name="users" className="w-4 h-4" />
          {translations.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Collaborator list */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Icon name="loader-2" className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : collaborators && collaborators.length > 0 ? (
          <div className="space-y-2">
            {collaborators.map((collaborator) => (
              <CollaboratorRow
                key={collaborator.id}
                collaborator={collaborator}
                canManage={canManageTeam && collaborator.role !== 'owner'}
                isOwner={isOwner}
                translations={translations}
                onUpdateRole={(newRole) => handleUpdateRole(collaborator.id, newRole)}
                onRemove={() => handleRemove(collaborator.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-1">
            {translations.empty}
          </div>
        )}

        {/* Invite form - only visible to owners/admins */}
        {canManageTeam && (
          <div className="pt-2 border-t space-y-2">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder={translations.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleInvite()
                  }
                }}
              />
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{translations.roles.admin}</SelectItem>
                  <SelectItem value="editor">{translations.roles.editor}</SelectItem>
                  <SelectItem value="viewer">{translations.roles.viewer}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              disabled={!email.trim() || inviteMutation.isPending}
              onClick={handleInvite}
            >
              {inviteMutation.isPending ? (
                <>
                  <Icon name="loader-2" className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {translations.inviting}
                </>
              ) : (
                <>
                  <Icon name="user-plus" className="w-3.5 h-3.5 mr-1.5" />
                  {translations.invite}
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface CollaboratorRowProps {
  collaborator: Collaborator
  canManage: boolean
  isOwner: boolean
  translations: TeamCardProps['translations']
  onUpdateRole: (role: 'admin' | 'editor' | 'viewer') => void
  onRemove: () => void
}

function CollaboratorRow({
  collaborator,
  canManage,
  isOwner,
  translations,
  onUpdateRole,
  onRemove,
}: CollaboratorRowProps) {
  const isPending = collaborator.status === 'pending'
  const displayName = collaborator.user_name || collaborator.email

  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 min-w-0">
        {/* Avatar placeholder */}
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Icon name="user" className="w-3 h-3 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="font-medium truncate text-xs">{displayName}</div>
          {collaborator.user_name && (
            <div className="text-[10px] text-muted-foreground truncate">{collaborator.email}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Status badge for pending */}
        {isPending && (
          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
            {translations.status.pending}
          </Badge>
        )}

        {/* Role badge */}
        <Badge variant={getRoleBadgeVariant(collaborator.role)} className="text-[10px]">
          {translations.roles[collaborator.role]}
        </Badge>

        {/* Actions dropdown */}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Icon name="more-horizontal" className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem
                onClick={() => onUpdateRole('admin')}
                disabled={collaborator.role === 'admin'}
              >
                {translations.roles.admin}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onUpdateRole('editor')}
                disabled={collaborator.role === 'editor'}
              >
                {translations.roles.editor}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onUpdateRole('viewer')}
                disabled={collaborator.role === 'viewer'}
              >
                {translations.roles.viewer}
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onRemove}
                    className="text-destructive focus:text-destructive"
                  >
                    <Icon name="user-x" className="w-3.5 h-3.5 mr-1.5" />
                    {translations.actions.remove}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
