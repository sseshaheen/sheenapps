'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import { format } from 'date-fns'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import type { AdminUser } from '@/lib/admin/admin-management-client-browser'
import { CreateAdminForm } from '@/components/admin/create-admin-form'

export default function AdminUsersPage() {
  const { session, canViewAdminList, canCreateAdmins, canRevokeAdmins, isSuperAdmin } = useAdminAuth()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  useEffect(() => {
    if (canViewAdminList) {
      fetchAdmins()
    }
  }, [canViewAdminList])

  const fetchAdmins = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/management/users', {
        headers: {
          'x-admin-reason': 'Viewing admin user list for management'
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch admin users')
      }

      const data = await response.json()
      setAdmins(data.admins || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRevokeAdmin = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to revoke admin privileges for ${email}? This action cannot be undone.`)) {
      return
    }

    const reason = prompt('Please provide a reason for revoking admin privileges:')
    if (!reason) {
      alert('A reason is required to revoke admin privileges')
      return
    }

    try {
      const response = await fetch(`/api/admin/management/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-reason': reason
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to revoke admin privileges')
      }

      // Refresh the list
      await fetchAdmins()
      alert('Admin privileges revoked successfully')
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  if (!canViewAdminList) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <div className="flex items-center space-x-3">
            <Icon name="alert-triangle" className="w-6 h-6 text-yellow-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
              <p className="text-sm text-gray-500">You don't have permission to view admin users</p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="p-6 bg-red-50 border-red-200">
          <div className="flex items-center space-x-3">
            <Icon name="x-circle" className="w-6 h-6 text-red-500" />
            <div>
              <h2 className="text-lg font-semibold text-red-900">Error</h2>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Admin Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage admin users and their privileges
          </p>
        </div>
        {canCreateAdmins && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            <Icon name="plus" className="w-4 h-4 mr-2" />
            Create Admin User
          </button>
        )}
      </div>

      {/* Create Admin Form */}
      {showCreateForm && canCreateAdmins && (
        <Card className="p-6">
          <CreateAdminForm 
            onSuccess={() => {
              setShowCreateForm(false)
              fetchAdmins()
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        </Card>
      )}

      {/* Admin Users Table */}
      <Card>
        <div className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Permissions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                {canRevokeAdmins && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                          <Icon name="user" className="w-5 h-5 text-purple-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {admin.display_name || admin.email}
                        </div>
                        <div className="text-sm text-gray-500">
                          {admin.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      admin.role === 'super_admin' 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {admin.permissions.length > 3 ? (
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {admin.permissions.length} permissions
                        </span>
                      ) : (
                        admin.permissions.map((perm, idx) => (
                          <span key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded mr-1">
                            {perm}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      {format(new Date(admin.created_at), 'MMM d, yyyy')}
                    </div>
                    <div className="text-xs">
                      by {admin.created_by === 'system' ? 'System' : admin.created_by}
                    </div>
                  </td>
                  {canRevokeAdmins && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {admin.id !== session?.user.id && (
                        <button
                          onClick={() => handleRevokeAdmin(admin.id, admin.email)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Revoke
                        </button>
                      )}
                      {admin.id === session?.user.id && (
                        <span className="text-gray-400 text-xs">Current User</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {admins.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No admin users found
            </div>
          )}
        </div>
      </Card>

      {/* Stats Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center">
            <Icon name="users" className="w-8 h-8 text-purple-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Admins</p>
              <p className="text-2xl font-semibold text-gray-900">{admins.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center">
            <Icon name="shield" className="w-8 h-8 text-red-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Super Admins</p>
              <p className="text-2xl font-semibold text-gray-900">
                {admins.filter(a => a.role === 'super_admin').length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center">
            <Icon name="user-check" className="w-8 h-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Regular Admins</p>
              <p className="text-2xl font-semibold text-gray-900">
                {admins.filter(a => a.role === 'admin').length}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}