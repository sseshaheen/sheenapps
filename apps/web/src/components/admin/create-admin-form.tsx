'use client'

import { useState } from 'react'
import Icon from '@/components/ui/icon'
import { AdminManagementClient } from '@/lib/admin/admin-management-client-browser'

interface CreateAdminFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function CreateAdminForm({ onSuccess, onCancel }: CreateAdminFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordErrors, setPasswordErrors] = useState<string[]>([])
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'admin' as 'admin' | 'super_admin',
    permissions: 'admin:*',
    display_name: '',
    reason: ''
  })

  const handlePasswordChange = (password: string) => {
    setFormData(prev => ({ ...prev, password }))
    
    // Validate password in real-time
    const validation = AdminManagementClient.validatePassword(password)
    setPasswordErrors(validation.errors)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    // Validate password before submitting
    const passwordValidation = AdminManagementClient.validatePassword(formData.password)
    if (!passwordValidation.valid) {
      setError('Please fix password requirements before submitting')
      setPasswordErrors(passwordValidation.errors)
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/admin/management/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          permissions: formData.permissions.split(',').map(p => p.trim()).filter(Boolean)
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create admin user')
      }

      const result = await response.json()
      
      // Show success message with temporary password
      alert(`Admin user created successfully!\n\nEmail: ${result.user.email}\nTemporary Password: ${result.user.temporary_password}\n\nPlease save this password as it won't be shown again. The user should change it on first login.`)
      
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Create New Admin User</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-500"
        >
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          id="email"
          required
          value={formData.email}
          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
          placeholder="admin@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Temporary Password <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          id="password"
          required
          value={formData.password}
          onChange={(e) => handlePasswordChange(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
          placeholder="Minimum 8 characters"
          minLength={8}
        />
        {passwordErrors.length > 0 && (
          <ul className="mt-2 text-sm text-red-600">
            {passwordErrors.map((err, idx) => (
              <li key={idx} className="flex items-start">
                <Icon name="x-circle" className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" />
                {err}
              </li>
            ))}
          </ul>
        )}
        {formData.password && passwordErrors.length === 0 && (
          <p className="mt-2 text-sm text-green-600 flex items-center">
            <Icon name="check-circle" className="w-4 h-4 mr-1" />
            Password meets all requirements
          </p>
        )}
      </div>

      <div>
        <label htmlFor="role" className="block text-sm font-medium text-gray-700">
          Role <span className="text-red-500">*</span>
        </label>
        <select
          id="role"
          required
          value={formData.role}
          onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as 'admin' | 'super_admin' }))}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
        >
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <p className="mt-1 text-sm text-gray-500">
          {formData.role === 'super_admin' 
            ? 'Can create and revoke other admin users' 
            : 'Can access admin panel and manage content'}
        </p>
      </div>

      <div>
        <label htmlFor="permissions" className="block text-sm font-medium text-gray-700">
          Permissions
        </label>
        <input
          type="text"
          id="permissions"
          value={formData.permissions}
          onChange={(e) => setFormData(prev => ({ ...prev, permissions: e.target.value }))}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
          placeholder="admin:*, promotion:write (comma-separated)"
        />
        <p className="mt-1 text-sm text-gray-500">
          Comma-separated list of permissions. Default: admin:*
        </p>
      </div>

      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-gray-700">
          Display Name
        </label>
        <input
          type="text"
          id="display_name"
          value={formData.display_name}
          onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
          placeholder="John Doe (optional)"
        />
      </div>

      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
          Reason for Creating Admin <span className="text-red-500">*</span>
        </label>
        <textarea
          id="reason"
          required
          value={formData.reason}
          onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
          rows={3}
          placeholder="e.g., Creating support admin for APAC timezone coverage"
        />
        <p className="mt-1 text-sm text-gray-500">
          This reason will be logged for audit purposes
        </p>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || passwordErrors.length > 0}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating...' : 'Create Admin User'}
        </button>
      </div>
    </form>
  )
}