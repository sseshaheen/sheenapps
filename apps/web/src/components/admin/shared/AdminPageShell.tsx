import { ReactNode } from 'react'

interface AdminPageShellProps {
  title: string
  description: string
  children: ReactNode
}

/**
 * Shared shell for admin pages
 * Provides consistent header styling across all admin routes
 */
export function AdminPageShell({ title, description, children }: AdminPageShellProps) {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      {children}
    </div>
  )
}
