/**
 * Shared loading component for admin pages
 * Use with next/dynamic loading prop
 */
export function AdminLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>
  )
}
